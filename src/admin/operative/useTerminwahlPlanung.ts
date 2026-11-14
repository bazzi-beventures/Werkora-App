import { useEffect, useState } from 'react'
import {
  type NachfassFall, type Reservation, fetchNachfassen, fetchReservationen,
} from '../../api/serviceBegleitung'
import { shiftISO, toDateStr } from '../utils/calendarHelpers'
import { type CalendarEntry, type PlannedSlot, type StaffLite, VORSCHLAG_PREFIX } from './scheduleShared'
import type { ScheduleProject } from '../../api/admin'

// Terminwahl per Link in der Einsatzplanung (docs/specs/servicebegleitung.md §7.3,
// §7.6): reservierte Fenster offener Anfragen als gestrichelte Ebene und — ohne
// Aufgaben-Board — die Fälle, bei denen das Büro anrufen muss.
//
// Die Reservationen laufen über dieselbe Ebene wie die Vorschläge der
// Hagelschaden-Disposition (`VORSCHLAG_PREFIX`): sie sind KEINE Termine, und die
// Plantafel behandelt solche Einträge schon richtig — kein Verschieben, keine
// Doppelbelegungs-Warnung, nicht in der Suche. Monteure sehen sie nie.

export const RESERVATION_PREFIX = `${VORSCHLAG_PREFIX}res:`
const ZEIGEN_KEY = 'einsatzplanung-reservationen-zeigen'
const TAKT_MS = 60_000

function gespeichert(): boolean {
  try { return window.localStorage.getItem(ZEIGEN_KEY) !== '0' } catch { return true }
}

export interface TerminwahlPlanung {
  reservationen: Reservation[]
  zeigen: boolean
  umschalten: () => void
  faelle: NachfassFall[]
}

export function useTerminwahlPlanung(aktiv: boolean, mitFaellen: boolean): TerminwahlPlanung {
  const [reservationen, setReservationen] = useState<Reservation[]>([])
  const [faelle, setFaelle] = useState<NachfassFall[]>([])
  const [zeigen, setZeigen] = useState(gespeichert)

  useEffect(() => {
    if (!aktiv) return
    let alive = true
    const laden = () => {
      const heute = toDateStr(new Date())
      fetchReservationen(shiftISO(heute, -1), shiftISO(heute, 120))
        .then(r => { if (alive) setReservationen(r.reservationen) })
        .catch(() => { /* still: ohne Ebene wird weiter geplant */ })
      if (mitFaellen) {
        fetchNachfassen().then(r => { if (alive) setFaelle(r.faelle) }).catch(() => {})
      }
    }
    laden()
    const timer = window.setInterval(laden, TAKT_MS)
    return () => { alive = false; window.clearInterval(timer) }
  }, [aktiv, mitFaellen])

  function umschalten() {
    setZeigen(v => {
      try { window.localStorage.setItem(ZEIGEN_KEY, v ? '0' : '1') } catch { /* egal */ }
      return !v
    })
  }

  return { reservationen: aktiv ? reservationen : [], zeigen, umschalten, faelle: aktiv ? faelle : [] }
}

/** Reservationen als gestrichelte Kalender-Einträge; Projekte ausserhalb der Liste fallen weg. */
export function reservationEntries(projById: Map<string, ScheduleProject>, reservationen: Reservation[]): CalendarEntry[] {
  const entries: CalendarEntry[] = []
  for (const r of reservationen) {
    const p = projById.get(r.project_id)
    if (!p) continue
    entries.push({
      ...p,
      id: `${RESERVATION_PREFIX}${r.id}`,
      start_date: r.datum,
      end_date: r.datum,
      start_time: r.start,
      end_time: r.ende,
      monteur_ids: r.monteur_ids,
      termin_badge: r.reserviert_bis_text ? `Reserviert bis ${r.reserviert_bis_text}` : 'Reserviert',
      termin_kind: undefined,
    })
  }
  return entries
}

function minuten(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

/**
 * Liegt ein geplanter Termin über einer Reservation? (§7.3: «Legt jemand einen echten
 * Termin darüber, warnt die Maske und blockiert nicht.») Ein Satz für die Rückfrage
 * der Einsatzplanung — oder `null`. Ohne Uhrzeit zählt der ganze Tag.
 */
export function reservationHinweis(
  reservationen: Reservation[], slot: PlannedSlot, staff: StaffLite[],
  projektName: (projectId: string) => string,
): string | null {
  if (!slot.start_date || slot.staffIds.length === 0) return null
  const von = slot.start_date.slice(0, 10)
  const bis = (slot.end_date || slot.start_date).slice(0, 10)
  const sS = minuten(slot.start_time) ?? 0
  const sE = minuten(slot.end_time) ?? (slot.start_time ? sS + 60 : 24 * 60)
  const namen = new Map(staff.map(s => [s.id, s.name]))
  const treffer: string[] = []
  for (const r of reservationen) {
    if (r.datum < von || r.datum > bis) continue
    const rS = minuten(r.start) ?? 0
    const rE = minuten(r.ende) ?? 24 * 60
    if (!(sS < rE && rS < sE)) continue
    const wer = slot.staffIds.filter(id => r.monteur_ids.includes(id)).map(id => namen.get(id) ?? '').filter(Boolean)
    if (!wer.length) continue
    treffer.push(`${wer.join(', ')}: ${projektName(r.project_id)}, ${r.text}`
      + (r.reserviert_bis_text ? ` (reserviert bis ${r.reserviert_bis_text})` : ''))
  }
  return treffer.length
    ? `Dem Kunden zur Wahl angeboten — ${treffer.join('; ')}. Wählt er dieses Fenster, prüft Werkora erneut und bietet ihm es nicht mehr an, wenn es belegt ist.`
    : null
}

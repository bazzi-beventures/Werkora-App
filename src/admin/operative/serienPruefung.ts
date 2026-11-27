// Prüfungen VOR dem Anlegen einer Serie: Doppelbelegung und Absenz über ALLE
// Wiederholungen, nicht nur über den ersten Termin.
//
// Befund (Marcin, 11/2026): Wer eine Blocker-Serie für Arzttermine über einen
// Zeitraum legte, in dem schon Einsätze standen, bekam die Rückfrage «bereits
// eingeplant» nur, wenn gerade der ERSTE Termin kollidierte — die übrigen legte
// die Serie still darüber. Und traf eine Wiederholung Ferien, kam die
// Absenz-Rückfrage erst nach dem Anlegen des Blockers: «Abbrechen» liess ihn
// ohne Termin (unsichtbar) stehen, ein zweites Speichern legte einen zweiten an.
//
// `serienVorkommen` ist der Spiegel von `db/project_appointments.py::
// expand_recurrence` — dieselben Testfälle in `serienPruefung.test.ts`. Er dient
// nur der Rückfrage; was angelegt wird, rechnet weiter der Server.
import { listScheduleAbsences, type AppointmentRecurrence } from '../../api/admin'
import type { ScheduleAbsence } from '../../api/admin/scheduling'
import { findStaffOverlaps, type PlannedSlot, type StaffOverlap } from './scheduleShared'
import { repeatToRecurrence, type ApptFormState } from './scheduleScreenModel'

/** Deckel je Serie — wie `MAX_SERIES_OCCURRENCES` im Server. */
export const MAX_SERIES_OCCURRENCES = 260

export interface Vorkommen {
  start_date: string
  end_date: string | null
}

const TAG_MS = 86_400_000

function alsUtc(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function alsIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Startdatum des k-ten Vorkommnisses; null = fällt aus (monatlich am 31.). */
function vorkommen(first: Date, k: number, freq: AppointmentRecurrence['freq'], interval: number): Date | null {
  if (freq === 'daily') return new Date(first.getTime() + k * interval * TAG_MS)
  if (freq === 'weekly') return new Date(first.getTime() + k * interval * 7 * TAG_MS)
  if (freq === 'workdays') {
    // Fällt der Ersttermin aufs Wochenende, bleibt er dort; erst die Folgetermine springen auf Mo–Fr.
    let d = first
    let steps = k * interval
    while (steps > 0) {
      d = new Date(d.getTime() + TAG_MS)
      const wd = d.getUTCDay()
      if (wd !== 0 && wd !== 6) steps -= 1
    }
    return d
  }
  const total = first.getUTCMonth() + k * interval
  const d = new Date(Date.UTC(first.getUTCFullYear() + Math.floor(total / 12), total % 12, first.getUTCDate()))
  // Date rollt den 31.02. still auf März — der Server lässt den Monat ausfallen.
  return d.getUTCDate() === first.getUTCDate() ? d : null
}

/** Entfaltet eine Regel in die Termine der Serie — der erste ist der Ausgangstermin. */
export function serienVorkommen(startDate: string, endDate: string | null, rule: AppointmentRecurrence): Vorkommen[] {
  const first = alsUtc(startDate)
  const span = endDate ? Math.max(0, Math.round((alsUtc(endDate).getTime() - first.getTime()) / TAG_MS)) : 0
  const interval = rule.interval || 1
  const limit = Math.min(rule.count || MAX_SERIES_OCCURRENCES, MAX_SERIES_OCCURRENCES)
  const until = rule.until ? rule.until.slice(0, 10) : null

  const out: Vorkommen[] = []
  for (let k = 0; k < limit * 2 + 24 && out.length < limit; k++) {
    const d = vorkommen(first, k, rule.freq, interval)
    if (!d) continue
    const iso = alsIso(d)
    if (until && iso > until) break
    out.push({ start_date: iso, end_date: endDate ? alsIso(new Date(d.getTime() + span * TAG_MS)) : null })
  }
  return out
}

/** Termine, die das Speichern dieses Editors erzeugt: bei einer NEUEN Serie alle, sonst der eine. */
export function draftVorkommen(a: ApptFormState): Vorkommen[] {
  const einzel = [{ start_date: a.startDate, end_date: a.endDate || null }]
  if (a.id || !a.startDate || !a.repeat || !a.repeatUntil || a.repeatUntil < a.startDate) return einzel
  const rule = repeatToRecurrence(a.repeat, a.repeatUntil)
  return rule ? serienVorkommen(a.startDate, a.endDate || null, rule) : einzel
}

/** Doppelbelegungen über alle Termine — je (Mitarbeiter, Einsatz) einmal, nach Name und Tag. */
export function serienUeberschneidungen(
  entries: Parameters<typeof findStaffOverlaps>[0], slot: PlannedSlot, termine: Vorkommen[],
  staff: Parameters<typeof findStaffOverlaps>[2], exclude: Iterable<string> = [],
): StaffOverlap[] {
  if (termine.length === 0) return []
  const von = termine[0].start_date
  const bis = termine.reduce((m, v) => ((v.end_date || v.start_date) > m ? (v.end_date || v.start_date) : m), von)
  // Vorfilter aufs Gesamtfenster: eine Jahresserie gegen alle Einträge wäre sonst quadratisch.
  const imFenster = entries.filter(e => e.start_date && e.start_date.slice(0, 10) <= bis
    && (e.end_date || e.start_date).slice(0, 10) >= von)
  const ausgeschlossen = [...exclude]
  const seen = new Set<string>()
  const out: StaffOverlap[] = []
  for (const v of termine) {
    for (const hit of findStaffOverlaps(imFenster, { ...slot, ...v }, staff, ausgeschlossen)) {
      const key = `${hit.staffId}|${hit.entry.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(hit)
    }
  }
  return out.sort((a, b) =>
    a.staffName.localeCompare(b.staffName, 'de-CH')
    || `${a.entry.start_date}${a.entry.start_time}`.localeCompare(`${b.entry.start_date}${b.entry.start_time}`))
}

/**
 * Rückfrage-Text, wenn ein Eingeplanter an einem der Termine eine genehmigte
 * Absenz hat — derselbe Wortlaut wie der 409 des Servers
 * (`services/scheduling_conflicts.py::format_absence_conflicts`). Altzeilen ohne
 * `staff_id` bleiben aussen vor; die fängt weiter der Server.
 */
export function absenzMeldung(absenzen: ScheduleAbsence[], staffIds: string[], termine: Vorkommen[]): string | null {
  const team = new Set(staffIds)
  const treffer = absenzen.filter(a => a.staff_id && team.has(a.staff_id) && termine.some(v =>
    v.start_date <= a.date_end && a.date_start <= (v.end_date || v.start_date)))
  if (treffer.length === 0) return null
  treffer.sort((a, b) => a.staff_name.localeCompare(b.staff_name, 'de-CH') || a.date_start.localeCompare(b.date_start))
  const teile = treffer.map(a => `${(a.staff_name || 'Mitarbeiter').trim()}: ${a.label || 'Absenz'}`)
  return 'Absenz im Einsatzzeitraum — ' + [...new Set(teile)].join('; ') + '.'
}

/**
 * Absenz-Rückfrage VOR dem ersten Schreiben eines neuen Eintrags. Der Server
 * prüft erst beim Termin — da steht der Eintrag schon. Ladefehler: null, dann
 * bleibt es bei der Prüfung des Servers (wie dort: ein Hinweis, keine Sperre).
 */
export async function absenzVorpruefung(staffIds: string[], termine: Vorkommen[]): Promise<string | null> {
  if (staffIds.length === 0 || termine.length === 0) return null
  const von = termine[0].start_date
  const bis = termine.reduce((m, v) => ((v.end_date || v.start_date) > m ? (v.end_date || v.start_date) : m), von)
  try {
    const absenzen = await listScheduleAbsences(von, bis)
    return Array.isArray(absenzen) ? absenzMeldung(absenzen, staffIds, termine) : null
  } catch {
    return null
  }
}

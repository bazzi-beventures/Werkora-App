import type { UserInfo } from './auth'
import { apiFetch } from './client'
import type { Antwort } from './generated'

// Servicebegleitung — Spec docs/specs/servicebegleitung.md. Ein Modul, mehrere
// Werkzeuge; welche ein Konto sieht, sagt `/pwa/me` (`service_werkzeuge`), der
// Server hat Modul, Betatest und Schalter schon verrechnet.

export type Werkzeug = 'unterwegs_meldung' | 'terminwahl' | 'statusseite' | 'terminvorschlag'

export function hasWerkzeug(user: UserInfo | null, key: Werkzeug): boolean {
  return user?.service_werkzeuge?.includes(key) ?? false
}

/** Stand eines Einsatzes am Tag — was der Monteur selbst gemeldet hat, nie ein Ort.
 *  Generiert aus agents/routers/antworten/servicebegleitung.py. */
export type EinsatzStand = Antwort<'EinsatzStand'>
export type EinsatzStandWert = EinsatzStand['stand']
export type MeldungAnsicht = Antwort<'MeldungAnsicht'>

export type MeldungArt = 'unterwegs' | 'verspaetung' | 'vor_ort'

export type MeldungAntwort = Antwort<'MeldungAntwort'>

const pfad = (appointmentId: string) =>
  `/pwa/schedule/appointments/${encodeURIComponent(appointmentId)}/meldung`

export function fetchMeldung(appointmentId: string): Promise<MeldungAnsicht> {
  return apiFetch<MeldungAnsicht>(pfad(appointmentId))
}

export function sendeMeldung(appointmentId: string, art: MeldungArt, ankunftCa: string | null): Promise<MeldungAntwort> {
  return apiFetch<MeldungAntwort>(pfad(appointmentId), {
    method: 'POST',
    body: JSON.stringify({ art, ankunft_ca: ankunftCa }),
  })
}

/** Stand aller Kundeneinsätze eines Tages fürs Büro (Plantafel). */
export function fetchEinsatzStaende(dateIso: string): Promise<Antwort<'EinsatzStaende'>> {
  return apiFetch(`/pwa/admin/schedule/meldungen?date=${encodeURIComponent(dateIso)}`)
}

/** «jetzt + Minuten», auf die nächste volle 5-Minuten-Marke aufgerundet, als «HH:MM». */
export function inMinuten(minuten: number, jetzt: Date = new Date()): string {
  const t = new Date(jetzt.getTime() + minuten * 60_000)
  t.setSeconds(0, 0)
  const rest = t.getMinutes() % 5
  if (rest) t.setMinutes(t.getMinutes() + (5 - rest))
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}

/** Liegt `heute` (ISO) im Termin? Mehrtägige zählen an jedem Tag. */
export function terminIstHeute(start: string | null | undefined, ende: string | null | undefined, heute: string): boolean {
  if (!start) return false
  const s = start.slice(0, 10)
  const e = (ende || start).slice(0, 10)
  return s <= heute && heute <= (e < s ? s : e)
}

// ─── Terminwahl per Link (docs/specs/servicebegleitung.md §7) ────────────────

// Terminwahl — generiert (Feldbeschreibungen im Modell).
export type TerminOption = Antwort<'TerminOption'>
export type Terminanfrage = Antwort<'Terminanfrage'>
export type AnfrageStatus = Terminanfrage['status']
/** Dauer in Minuten (Spanne; ohne Spanne von = bis). */
export type Dauer = Antwort<'Dauer'>
export type TerminwahlAnsicht = Antwort<'TerminwahlAnsicht'>

export interface FensterEingabe {
  datum: string
  start: string
  ende: string
  monteur_ids: string[]
}

export function fetchTerminwahl(projectId: string): Promise<TerminwahlAnsicht> {
  return apiFetch<TerminwahlAnsicht>(`/pwa/admin/projects/${encodeURIComponent(projectId)}/terminwahl`)
}

export function sendeTerminwahl(projectId: string, eingabe: {
  fenster: FensterEingabe[]; empfaenger: string; cc: string[]; mitteilung: string; reserviert_bis: string
  kind: string; dauer_von: number | null; dauer_bis: number | null; aus_vorschlag?: boolean
}): Promise<TerminwahlAnsicht> {
  return apiFetch<TerminwahlAnsicht>(`/pwa/admin/projects/${encodeURIComponent(projectId)}/terminwahl`, {
    method: 'POST',
    body: JSON.stringify(eingabe),
  })
}

export function zieheTerminanfrageZurueck(anfrageId: string): Promise<Antwort<'Erledigt'>> {
  return apiFetch(`/pwa/admin/terminanfragen/${encodeURIComponent(anfrageId)}/zurueckziehen`, { method: 'POST' })
}

export function fetchKundenlink(projectId: string): Promise<Antwort<'Kundenlink'>> {
  return apiFetch(`/pwa/admin/projects/${encodeURIComponent(projectId)}/kundenlink`)
}

export function sperreKundenlink(projectId: string): Promise<Antwort<'Kundenlink'>> {
  return apiFetch(`/pwa/admin/projects/${encodeURIComponent(projectId)}/kundenlink/sperren`, { method: 'POST' })
}

export type Reservation = Antwort<'Reservation'>

export function fetchReservationen(von: string, bis: string): Promise<Antwort<'Reservationen'>> {
  return apiFetch(`/pwa/admin/schedule/reservationen?date_from=${encodeURIComponent(von)}&date_to=${encodeURIComponent(bis)}`)
}

export type NachfassFall = Antwort<'NachfassFall'>

export function fetchNachfassen(): Promise<Antwort<'NachfassFaelle'>> {
  return apiFetch('/pwa/admin/service/nachfassen')
}

/** Klartext zum Stand einer Anfrage für die Kachel. */
export function anfrageStandText(a: Terminanfrage): string {
  switch (a.status) {
    case 'offen': return a.erinnert_at ? 'Offen — Kunde wurde erinnert' : 'Offen — wartet auf die Wahl des Kunden'
    case 'gewaehlt': {
      const g = a.optionen.find(o => o.status === 'gewaehlt')
      return g ? `Kunde hat gewählt: ${g.text}` : 'Kunde hat gewählt'
    }
    case 'keiner_passt': return 'Kein Termin passt — Kunde bittet um einen Anruf'
    case 'abgelaufen': return a.grund === 'keine_fenster'
      ? 'Abgelaufen — kein Fenster mehr frei, bitte neue senden oder anrufen'
      : 'Abgelaufen — keine Antwort, bitte Kunde anrufen'
    case 'zurueckgezogen': return 'Zurückgezogen'
  }
}

// ── Dauer-Vorgaben je Termin-Art (Einstellungen → Termindauer) ─────────────

export type TerminDauerVorgaben = Antwort<'TerminDauerVorgaben'>

export function fetchTerminDauer(): Promise<TerminDauerVorgaben> {
  return apiFetch<TerminDauerVorgaben>('/pwa/admin/service/termindauer')
}

export function speichereTerminDauer(vorgaben: Record<string, Partial<Dauer>>): Promise<TerminDauerVorgaben> {
  return apiFetch<TerminDauerVorgaben>('/pwa/admin/service/termindauer', {
    method: 'PUT',
    body: JSON.stringify({ vorgaben }),
  })
}

/** Auswahl der Dauer im Dialog und in den Einstellungen (Minuten, Raster 15). */
export const DAUER_STUFEN = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480, 600, 720] as const

/** «1½ Std.», «45 Min.» — Beschriftung der Auswahl. */
export function dauerLabel(min: number): string {
  if (min < 60) return `${min} Min.`
  const ganz = Math.floor(min / 60)
  const bruch = ({ 0: '', 15: '¼', 30: '½', 45: '¾' } as Record<number, string>)[min % 60] ?? ''
  return `${ganz}${bruch} Std.`
}

// ── Terminvorschläge (docs/specs/servicebegleitung.md §6) ───────────────────

/** Generiert aus agents/routers/antworten/servicebegleitung.py (Feldbeschreibungen dort). */
export type TerminVorschlag = Antwort<'TerminVorschlag'>
export type TerminVorschlaegeAntwort = Antwort<'TerminVorschlaege'>

export interface VorschlagEingabe {
  kind: string
  dauer_min?: number | null
  dringend?: boolean
  tageshaelfte?: 'vormittag' | 'nachmittag' | null
  staff_id?: string | null
  ab?: string | null
  horizont?: number | null
}

export function fetchTerminVorschlaege(projectId: string, eingabe: VorschlagEingabe): Promise<TerminVorschlaegeAntwort> {
  return apiFetch<TerminVorschlaegeAntwort>(`/pwa/admin/projects/${encodeURIComponent(projectId)}/terminvorschlaege`, {
    method: 'POST', body: JSON.stringify(eingabe),
  })
}

export type VorschlagErgebnis = 'rang_1' | 'rang_2' | 'rang_3' | 'von_hand'

/** Welcher Rang übernommen wurde — ohne Mitarbeiterbezug, best effort. */
export function protokolliereVorschlag(projectId: string, ergebnis: VorschlagErgebnis): Promise<unknown> {
  return apiFetch(`/pwa/admin/projects/${encodeURIComponent(projectId)}/terminvorschlaege/protokoll`, {
    method: 'POST', body: JSON.stringify({ ergebnis }),
  }).catch(() => undefined)
}

/** Die Terminwahl-Kachel lädt neu, wenn anderswo eine Anfrage gesendet wurde. */
export const TERMINWAHL_GEAENDERT = 'werkora:terminwahl-geaendert'

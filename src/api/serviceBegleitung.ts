import type { UserInfo } from './auth'
import { apiFetch } from './client'

// Servicebegleitung — Spec docs/specs/servicebegleitung.md. Ein Modul, mehrere
// Werkzeuge; welche ein Konto sieht, sagt `/pwa/me` (`service_werkzeuge`), der
// Server hat Modul, Betatest und Schalter schon verrechnet.

export type Werkzeug = 'unterwegs_meldung' | 'terminwahl' | 'statusseite'

export function hasWerkzeug(user: UserInfo | null, key: Werkzeug): boolean {
  return user?.service_werkzeuge?.includes(key) ?? false
}

/** Stand eines Einsatzes am Tag — was der Monteur selbst gemeldet hat, nie ein Ort. */
export type EinsatzStandWert = 'geplant' | 'unterwegs' | 'vor_ort' | 'erledigt'

export interface EinsatzStand {
  stand: EinsatzStandWert
  /** «HH:MM» Schweizer Zeit */
  ankunft_ca: string | null
  unterwegs_at: string | null
  vor_ort_at: string | null
  /** Wie viele Nachrichten an den Kunden heute noch gehen (höchstens drei je Termin). */
  nachrichten_uebrig: number
}

export interface MeldungAnsicht extends EinsatzStand {
  appointment_id: string
  /** Vorwahl der Ankunftszeit (nach Plan, ab dem Einsatz davor bzw. dem Depot) — oder null. */
  vorschlag: string | null
  chips: number[]
  /** Hat der Auftrag eine Mail-Adresse (Kontakt vor Ort oder Kunde)? */
  kunde_erreichbar: boolean
  telefon: string
}

export type MeldungArt = 'unterwegs' | 'verspaetung' | 'vor_ort'

export interface MeldungAntwort {
  stand: EinsatzStand
  kunde_informiert: boolean
  hinweis: string
}

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
export function fetchEinsatzStaende(dateIso: string): Promise<{ date: string; meldungen: Record<string, EinsatzStand> }> {
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

export interface TerminOption {
  id: string
  datum: string
  start: string
  ende: string
  monteur_ids: string[]
  status: 'reserviert' | 'gewaehlt' | 'frei' | 'vergeben'
  text: string
}

export type AnfrageStatus = 'offen' | 'gewaehlt' | 'keiner_passt' | 'abgelaufen' | 'zurueckgezogen'

export interface Terminanfrage {
  id: string
  status: AnfrageStatus
  grund: 'keine_antwort' | 'keine_fenster' | null
  empfaenger: string
  reserviert_bis: string
  reserviert_bis_text: string
  gesendet_at: string | null
  erinnert_at: string | null
  hinweis_kunde: string | null
  created_at: string
  optionen: TerminOption[]
}

export interface TerminwahlAnsicht {
  anfragen: Terminanfrage[]
  /** «YYYY-MM-DDTHH:MM» Schweizer Zeit — Vorbelegung von «reserviert bis». */
  vorgabe_reserviert_bis: string
  empfaenger_vorschlag: string
  kundenlink: string | null
}

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
}): Promise<TerminwahlAnsicht> {
  return apiFetch<TerminwahlAnsicht>(`/pwa/admin/projects/${encodeURIComponent(projectId)}/terminwahl`, {
    method: 'POST',
    body: JSON.stringify(eingabe),
  })
}

export function zieheTerminanfrageZurueck(anfrageId: string): Promise<{ status: string }> {
  return apiFetch(`/pwa/admin/terminanfragen/${encodeURIComponent(anfrageId)}/zurueckziehen`, { method: 'POST' })
}

export function fetchKundenlink(projectId: string): Promise<{ url: string }> {
  return apiFetch(`/pwa/admin/projects/${encodeURIComponent(projectId)}/kundenlink`)
}

export function sperreKundenlink(projectId: string): Promise<{ url: string }> {
  return apiFetch(`/pwa/admin/projects/${encodeURIComponent(projectId)}/kundenlink/sperren`, { method: 'POST' })
}

export interface Reservation extends TerminOption {
  project_id: string
  reserviert_bis_text: string
}

export function fetchReservationen(von: string, bis: string): Promise<{ reservationen: Reservation[] }> {
  return apiFetch(`/pwa/admin/schedule/reservationen?date_from=${encodeURIComponent(von)}&date_to=${encodeURIComponent(bis)}`)
}

export interface NachfassFall {
  anfrage_id: string
  project_id: string
  status: AnfrageStatus
  titel: string
  hinweis_kunde: string
}

export function fetchNachfassen(): Promise<{ faelle: NachfassFall[] }> {
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

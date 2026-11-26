// Ferienkonten über Jahre (Modul `ferienplanung`, docs/specs/ferienplanung.md §5, §9 — E7).
// Typen aus dem API-Vertrag (agents/routers/antworten/ferienplanung.py).
import { apiFetch } from '../client'
import type { Antwort } from '../generated'

export type FerienKonten = Antwort<'FerienKonten'>
export type FerienKonto = Antwort<'FerienKonto'>
export type KontoHinweis = Antwort<'KontoHinweis'>
export type Jahresabschluss = Antwort<'Jahresabschluss'>
export type FerienGekuerzt = Antwort<'FerienGekuerzt'>

export interface KontoAenderung {
  uebertrag_tage?: number
  korrektur_tage?: number
  notiz?: string
}

export function getKonten(jahr: number): Promise<FerienKonten> {
  return apiFetch<FerienKonten>(`/pwa/admin/ferienplanung/konten?jahr=${jahr}`)
}

export function aendereKonto(staffId: string, jahr: number, aenderung: KontoAenderung): Promise<FerienKonto> {
  return apiFetch<FerienKonto>(`/pwa/admin/ferienplanung/konten/${encodeURIComponent(staffId)}/${jahr}`, {
    method: 'PUT', body: JSON.stringify(aenderung),
  })
}

export function jahresabschluss(jahr: number): Promise<Jahresabschluss> {
  return apiFetch<Jahresabschluss>('/pwa/admin/ferienplanung/konten/abschluss', {
    method: 'POST', body: JSON.stringify({ jahr }),
  })
}

export function ferienKuerzen(absenceId: string): Promise<FerienGekuerzt> {
  return apiFetch<FerienGekuerzt>('/pwa/admin/ferienplanung/konten/kuerzen', {
    method: 'POST', body: JSON.stringify({ absence_id: absenceId }),
  })
}

const FEHLER: Record<string, string> = {
  folgejahr_abgeschlossen: 'Das Folgejahr ist schon abgeschlossen — der Übertrag lässt sich nicht mehr neu rechnen.',
  jahr_in_zukunft: 'Ein Jahr in der Zukunft lässt sich nicht abschliessen.',
  keine_ueberschneidung: 'In diesen Ferien liegt keine Krankmeldung (mehr).',
  keine_genehmigten_ferien: 'Nur genehmigte Ferien lassen sich kürzen.',
  not_found: 'Nicht gefunden — bitte neu laden.',
}

export function kontoFehlerText(err: unknown): string {
  const code = err instanceof Error ? err.message : ''
  return FEHLER[code] ?? 'Das hat nicht geklappt — bitte nochmals versuchen.'
}

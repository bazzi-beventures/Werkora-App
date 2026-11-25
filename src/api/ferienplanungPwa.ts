// Ferienplanung in der Mitarbeiter-App (docs/specs/ferienplanung.md §7.2, E6):
// was für mich gilt, und die Vorprüfung eines Antrags — ohne Namen anderer.
import { apiFetch } from './client'
import type { Antwort } from './generated'

export type FerienKalender = Antwort<'FerienKalender'>
export type FerienVorpruefung = Antwort<'FerienVorpruefung'>

export function getMeinKalender(jahr: number): Promise<FerienKalender> {
  return apiFetch<FerienKalender>(`/pwa/ferienplanung/kalender?jahr=${jahr}`)
}

export function vorpruefen(payload: {
  absence_type: string; date_start: string; date_end: string; half_day?: string | null
}): Promise<FerienVorpruefung> {
  return apiFetch<FerienVorpruefung>('/pwa/absences/pruefen', { method: 'POST', body: JSON.stringify(payload) })
}

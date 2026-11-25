// Filialen in anderen Kantonen (Feature `filialen`, docs/specs/ferienplanung.md §10.3).
// Wer einer Filiale zugeordnet ist, rechnet mit den Feiertagen ihres Kantons.
import { apiFetch } from '../client'
import type { Antwort } from '../generated'

export type Filiale = Antwort<'Filiale'>
export type FilialenListe = Antwort<'FilialenListe'>
export type FilialeGespeichert = Antwort<'FilialeGespeichert'>

export function getFilialen(): Promise<FilialenListe> {
  return apiFetch<FilialenListe>('/pwa/admin/filialen')
}

export function createFiliale(name: string, kanton: string): Promise<FilialeGespeichert> {
  return apiFetch<FilialeGespeichert>('/pwa/admin/filialen', {
    method: 'POST',
    body: JSON.stringify({ name, kanton }),
  })
}

export function updateFiliale(
  id: string, felder: { name?: string; kanton?: string; aktiv?: boolean },
): Promise<FilialeGespeichert> {
  return apiFetch<FilialeGespeichert>(`/pwa/admin/filialen/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(felder),
  })
}

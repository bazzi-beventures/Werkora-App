// Garantiefälle (docs/specs/garantiefall.md Phase 2): lesen, melden, fortschreiben.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'
import type { Project } from './projects'

export type WarrantyCaseStatus =
  | 'gemeldet' | 'in_pruefung' | 'entschieden' | 'in_arbeit' | 'behoben' | 'abgeschlossen'
export type WarrantyDecision = 'anerkannt' | 'kulanz' | 'abgelehnt'
export type WarrantyCause = 'eigener_fehler' | 'material' | 'fremdverschulden' | 'verschleiss' | 'unklar'
export type WarrantyChannel = 'telefon' | 'mail' | 'vor_ort' | 'brief' | 'sonstiges'

export interface WarrantyCase {
  id: string
  case_no: number
  source_project_id: string
  repair_project_id: string | null
  customer_id: string | null
  reported_at: string
  reported_via: WarrantyChannel | null
  reported_by_name: string | null
  description: string
  /** Rügefrist, wie sie beim Melden galt — eingefroren (Spec §3.4). */
  deadline_at: string | null
  expiry_at: string | null
  status: WarrantyCaseStatus
  decision: WarrantyDecision | null
  decided_at: string | null
  decided_by_name: string | null
  decision_note: string | null
  cause: WarrantyCause | null
  supplier_id: string | null
  resolved_at: string | null
  closed_at: string | null
  created_by_name: string | null
  created_at: string
  /** Vom Server abgeleitet: welche Statuswechsel von hier aus erlaubt sind. */
  allowed_transitions: WarrantyCaseStatus[]
  /** Vom Server abgeleitet: lag die Meldung in der eingefrorenen Rügefrist? null = unbekannt. */
  within_deadline: boolean | null
}

export interface CreateWarrantyCaseBody {
  source_project_id: string
  description: string
  reported_at?: string
  reported_via?: WarrantyChannel | null
  reported_by_name?: string | null
  cause?: WarrantyCause | null
}

/**
 * Nur die Felder, die sich ändern sollen. `null` leert ein Feld, sofern es
 * leerbar ist (Notiz, Ursache, Lieferant, Meldeweg, Melder); ein Entscheid
 * lässt sich nur ersetzen, nicht löschen.
 */
export interface UpdateWarrantyCaseBody {
  status?: WarrantyCaseStatus
  decision?: WarrantyDecision
  decision_note?: string | null
  cause?: WarrantyCause | null
  supplier_id?: string | null
  description?: string
  reported_via?: WarrantyChannel | null
  reported_by_name?: string | null
}

export async function listWarrantyCases(projectId: string): Promise<WarrantyCase[]> {
  return apiFetch<WarrantyCase[]>(
    `/pwa/admin/warranty/cases?project_id=${encodeURIComponent(projectId)}`,
  )
}

export async function createWarrantyCase(body: CreateWarrantyCaseBody): Promise<WarrantyCase> {
  return apiFetch<WarrantyCase>('/pwa/admin/warranty/cases', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateWarrantyCase(
  caseId: string, body: UpdateWarrantyCaseBody,
): Promise<WarrantyCase> {
  return apiFetch<WarrantyCase>(`/pwa/admin/warranty/cases/${encodeURIComponent(caseId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

/**
 * Reparatur-Projekt aus dem Fall (Phase 3): legt das Projekt an, hängt es an
 * den Fall und setzt ihn auf «in Arbeit». `is_warranty` folgt dem Entscheid.
 */
export async function createWarrantyRepairProject(
  caseId: string,
): Promise<{ case: WarrantyCase; project: Project | null }> {
  return apiFetch(`/pwa/admin/warranty/cases/${encodeURIComponent(caseId)}/repair-project`, {
    method: 'POST',
  })
}

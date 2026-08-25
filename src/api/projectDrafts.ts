import { apiFetch } from './client'
import { WorkType } from './workTypes'

export interface DraftMaterial {
  name: string
  quantity?: string | null
}

export interface ProjectDraftPayload {
  customer_name: string
  customer_phone?: string | null
  customer_email?: string | null
  customer_address?: string | null
  title: string
  description?: string | null
  object_name?: string | null
  object_address?: string | null
  materials: DraftMaterial[]
  notes?: string | null
  // Vom Mitarbeiter vor Ort erfasst; belegt beim Umwandeln die Leistungsart des
  // Projekts vor. Fehlt bei Entwürfen aus der Offline-Queue älterer Versionen.
  art_der_arbeit?: WorkType[] | null
}

export interface ProjectDraft extends ProjectDraftPayload {
  id: string
  tenant_id: string
  created_by_staff_id: string | null
  created_by_name: string | null
  status: 'open' | 'converted' | 'rejected'
  converted_to_project_id: string | null
  decision_note: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

export async function createProjectDraft(payload: ProjectDraftPayload): Promise<ProjectDraft> {
  return apiFetch<ProjectDraft>('/pwa/project-drafts', {
    method: 'POST',
    body: JSON.stringify(payload),
    // Entwurf hat eine Offline-Queue: im Funkloch lieber nach 15s abbrechen
    // und queuen, als minutenlang im Spinner zu hängen.
    timeoutMs: 15_000,
  })
}

export async function getAdminProjectDrafts(
  status: 'open' | 'converted' | 'rejected' | 'all' = 'open',
): Promise<ProjectDraft[]> {
  return apiFetch<ProjectDraft[]>(`/pwa/admin/project-drafts?status=${status}`)
}

export interface ConvertDraftPayload {
  project_name: string
  customer_id?: string | null
  object_name?: string | null
  object_address?: string | null
  // Baustellenkontakt — wird serverseitig als is_site_contact-Eintrag in
  // projects.kontakte gespeichert (siehe Migration 20260516d).
  site_contact_name?: string | null
  site_contact_phone?: string | null
  // Mehrfachauswahl wie projects.art_der_arbeit; [] heisst "bewusst keine" und
  // schlägt die Vorbelegung aus dem Entwurf.
  art_der_arbeit?: WorkType[] | null
  projektleiter_id?: string | null
  bemerkung?: string | null
  start_date?: string | null
  end_date?: string | null
}

// Ergebnis der Umwandlung: das angelegte Projekt (id/name) oder ein Fehlerstatus.
export interface ConvertDraftResult {
  status: string
  project_id: string | null
  project_name: string
}

export async function convertProjectDraft(
  draftId: string,
  payload: ConvertDraftPayload,
): Promise<ConvertDraftResult> {
  return apiFetch<ConvertDraftResult>(`/pwa/admin/project-drafts/${draftId}/convert`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function rejectProjectDraft(draftId: string, note?: string | null): Promise<void> {
  await apiFetch(`/pwa/admin/project-drafts/${draftId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note: note ?? null }),
  })
}

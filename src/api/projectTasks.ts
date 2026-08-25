import { apiFetch } from './client'

// Projekt-Aufgaben (Checkliste). Admin legt sie an, der Monteur hakt sie in der
// Mitarbeiter-PWA ab. Siehe ProjekteScreen für die Offline-Queue.
export interface ProjectTask {
  id: string
  text: string
  is_done: boolean
  done_at: string | null
  done_by_name: string | null
  created_by_name?: string | null
  created_at: string
}

// ─── Admin-Seite (Checkliste verwalten) ─────────────────────────────────────
// Anlegen/Ändern/Löschen darf nur der Admin; der Monteur hakt bloss ab. Die
// vier Aufrufe leben hier statt inline im Screen, weil sie inzwischen an zwei
// Stellen gebraucht werden: Projektmaske (Tab «Aufgaben») und Planungs-Panel
// der Einsatzplanung.

export async function listAdminProjectTasks(projectId: string): Promise<ProjectTask[]> {
  const d = await apiFetch(`/pwa/admin/projects/${projectId}/tasks`)
  return Array.isArray(d) ? d as ProjectTask[] : []
}

export async function addAdminProjectTask(projectId: string, text: string): Promise<void> {
  await apiFetch(`/pwa/admin/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export async function updateAdminProjectTask(projectId: string, taskId: string, text: string): Promise<void> {
  await apiFetch(`/pwa/admin/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ text }),
  })
}

export async function deleteAdminProjectTask(projectId: string, taskId: string): Promise<void> {
  await apiFetch(`/pwa/admin/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE' })
}

// Hakt eine Aufgabe ab bzw. setzt sie zurück. Geteilt zwischen direktem Klick
// und dem Offline-Queue-Drain, damit die Call-Logik nur an einer Stelle lebt.
// doneAt = echter Abhak-Zeitpunkt (ISO). Wichtig für offline gepufferte Aktionen,
// die erst später synchronisiert werden — sonst würde der Server die Sync-Zeit
// statt des realen Abhak-Moments stempeln.
export async function toggleProjectTaskDone(
  projectId: string,
  taskId: string,
  isDone: boolean,
  doneAt?: string | null,
): Promise<void> {
  const body: { is_done: boolean; done_at?: string } = { is_done: isDone }
  if (isDone && doneAt) body.done_at = doneAt
  await apiFetch(`/pwa/projects/${projectId}/tasks/${taskId}/done`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    // Abhaken hat eine Offline-Queue: im Funkloch nach 15s abbrechen und
    // queuen statt hängen. Server-Aktion ist idempotent, Retry ist harmlos.
    timeoutMs: 15_000,
  })
}

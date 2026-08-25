// Standard-Aufgaben: mandantenweite Checklisten-Punkte, die beim Anlegen eines
// Kundenprojekts in dessen Aufgabenliste kopiert werden (Reiter «Vorlagen» →
// «Aufgaben»). Teil des api/admin/-Barrels — eine Datei je Domäne.
//
// Kopie, keine Verknüpfung: eine geänderte Vorlage schreibt laufende Projekte
// nicht um, und wer die Aufgabe auf dem Projekt löscht, verliert die Vorlage nicht.

import { apiFetch } from '../client'

export interface ProjectTaskTemplate {
  id: string
  text: string
  sort_order: number
  // false = pausiert: bleibt in der Verwaltung stehen, kommt aber nicht mehr auf neue Projekte.
  is_active: boolean
  created_at: string
  updated_at: string | null
}

export async function listProjectTaskTemplates(): Promise<ProjectTaskTemplate[]> {
  const d = await apiFetch<ProjectTaskTemplate[]>('/pwa/admin/project-task-templates')
  return Array.isArray(d) ? d : []
}

export async function createProjectTaskTemplate(text: string): Promise<void> {
  await apiFetch('/pwa/admin/project-task-templates', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

/** Umbenennen (`text`), pausieren/aktivieren (`is_active`) oder beides. */
export async function updateProjectTaskTemplate(
  id: string, patch: { text?: string; is_active?: boolean },
): Promise<void> {
  await apiFetch(`/pwa/admin/project-task-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function deleteProjectTaskTemplate(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/project-task-templates/${id}`, { method: 'DELETE' })
}

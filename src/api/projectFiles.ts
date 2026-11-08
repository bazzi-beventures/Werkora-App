// Dateien am Projekt — für beide Sichten (Charge H5).
//
// Die Monteur-PWA spricht `/pwa/projects/…`, die Verwaltung `/pwa/admin/projects/…`.
// Vier der fünf Operationen (Liste, Upload, Umbenennen, Löschen) sind in beiden
// Familien identisch; unterschiedlich ist nur, was der Server durchlässt. Deshalb
// steht der Pfad-Präfix als Parameter davor statt zweimal ausgeschrieben.
//
// Die Ausnahme ist der Download-Link — siehe `projectFileUrl`.
//
// api/admin/projects.ts hält die Verwaltungs-Namen als schmale Weiterleitungen —
// die Screens dort rufen weiter `uploadProjectFile(projectId, …)` ohne Präfix.

import { apiFetch, apiFormFetch, apiUrl } from './client'
import type { ProjectFile } from '../shared/projectDetail/types'

/** Wessen Sicht — der Pfad-Präfix der Endpoint-Familie. */
export type ProjectScope = '/pwa' | '/pwa/admin'

const filesPath = (scope: ProjectScope, projectId: string) => `${scope}/projects/${projectId}/files`

export async function listProjectFiles(scope: ProjectScope, projectId: string): Promise<ProjectFile[]> {
  return apiFetch<ProjectFile[]>(filesPath(scope, projectId))
}

export interface UploadProjectFileResult {
  // Die abgelegte Datei — der Offerten-Versand haengt sie ueber ihre id ans Mail.
  file?: { id: string }
  // Gesetzt, wenn der Upload den Beschaffungsstatus vorgerückt hat. Die
  // Vorwärts-Regel liegt serverseitig (services/project_workflow.py) — die PWA
  // uebernimmt nur, was zurueckkommt.
  beschaffung_status?: string | null
}

/** Eine Datei pro Request — der Endpoint nimmt keine Mehrfach-Uploads. */
export async function uploadProjectFile(
  scope: ProjectScope, projectId: string, file: File, category: string,
): Promise<UploadProjectFileResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('category', category)
  return apiFormFetch<UploadProjectFileResult>(filesPath(scope, projectId), form)
}

/** Der Server kann den Namen anpassen (die Endung bleibt erhalten) — danach neu laden. */
export async function renameProjectFile(
  scope: ProjectScope, projectId: string, fileId: string, filename: string,
): Promise<void> {
  await apiFetch(`${filesPath(scope, projectId)}/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ filename }),
  })
}

export async function deleteProjectFile(
  scope: ProjectScope, projectId: string, fileId: string,
): Promise<void> {
  await apiFetch(`${filesPath(scope, projectId)}/${fileId}`, { method: 'DELETE' })
}

/**
 * Direkter Link auf die Datei (für `<a href>`, nicht für fetch).
 *
 * Ohne Flag liefert der Proxy Fotos und PDFs `inline` aus — der Name öffnet die
 * Datei. `download: true` erzwingt `attachment`, das ist der Speichern-Knopf.
 *
 * Der Download ist die eine Operation ohne symmetrischen Pfad: Die Verwaltung
 * lädt über `/pwa/admin/project-files/{id}/download`
 * (`agents/routers/documents.py::get_project_file`), einen Pfad ohne Projekt.
 * `/pwa/admin/projects/{p}/files/{id}/download` gibt es im Backend nicht. Bis
 * 2026-11-08 baute diese Funktion genau den — die Fotos in der
 * Hagelschaden-Ansicht liefen alle in 404, und weil das `<img>` sich bei einem
 * Ladefehler ausblendet, sah man nur die Dateinamen.
 */
export function projectFileUrl(
  scope: ProjectScope, projectId: string, fileId: string, opts: { download?: boolean } = {},
): string {
  const path = scope === '/pwa/admin'
    ? `/pwa/admin/project-files/${fileId}/download`
    : `${filesPath(scope, projectId)}/${fileId}/download`
  return apiUrl(`${path}${opts.download ? '?download=1' : ''}`)
}

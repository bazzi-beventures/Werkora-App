// Lieferschein fotografieren — docs/specs/lieferschein-erfassung.md.
//
// Ablauf: Foto → `uploadLieferschein` legt es in den Eingang und liefert
// Vorschläge → der Mensch bestätigt ein Projekt → `assignLieferschein`. Ohne
// Bestätigung bleibt der Lieferschein im Eingang, und das Büro ordnet zu.

import { apiFetch, apiFormFetch, apiUrl } from './client'

/** Ein Projekt in der schmalen Form — mehr zeigt die Zuordnung nie. */
export interface LieferscheinProjekt {
  project_id: string
  number: string
  name: string
  customer: string
  locality: string
}

export type LieferscheinStatus = 'offen' | 'zugeordnet' | 'verworfen'

export interface LieferscheinEintrag {
  id: string
  status: LieferscheinStatus
  created_at: string
  filename: string
  mime_type: string | null
  uploaded_by_name: string | null
  candidates: LieferscheinProjekt[]
  assigned_project: LieferscheinProjekt | null
  assigned_at: string | null
  assigned_by_name: string | null
}

export interface UploadLieferscheinResult {
  inbox_id: string
  entry: LieferscheinEintrag
  /** Auf dem Lieferschein gefundene, existierende Projekte (OCR). */
  candidates: LieferscheinProjekt[]
  /** Offene Projekte, in denen ich selbst stehe — Abkürzung vor der Suche. */
  recent: LieferscheinProjekt[]
}

export async function uploadLieferschein(file: Blob, filename = 'lieferschein.jpg'): Promise<UploadLieferscheinResult> {
  const form = new FormData()
  form.append('file', file, filename)
  return apiFormFetch<UploadLieferscheinResult>('/pwa/lieferscheine', form)
}

export async function searchLieferscheinProjekte(q: string): Promise<LieferscheinProjekt[]> {
  const res = await apiFetch<{ projects: LieferscheinProjekt[] }>(
    `/pwa/lieferscheine/projects?q=${encodeURIComponent(q)}`,
  )
  return res.projects ?? []
}

export async function assignLieferschein(
  entryId: string, projectId: string,
): Promise<{ status: string; project: LieferscheinProjekt }> {
  return apiFetch(`/pwa/lieferscheine/${entryId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId }),
  })
}

export async function listMeineLieferscheine(): Promise<LieferscheinEintrag[]> {
  const res = await apiFetch<{ entries: LieferscheinEintrag[] }>('/pwa/lieferscheine/mine')
  return res.entries ?? []
}

/** Bild eines Eintrags — Cookie-Auth, direkt als `<img src>`. */
export function lieferscheinBildUrl(entryId: string): string {
  return apiUrl(`/pwa/lieferscheine/${entryId}/image`)
}

// ── Eingang des Büros ────────────────────────────────────────

export async function listLieferscheinEingang(): Promise<LieferscheinEintrag[]> {
  const res = await apiFetch<{ entries: LieferscheinEintrag[] }>('/pwa/admin/lieferscheine')
  return res.entries ?? []
}

export async function verwerfeLieferschein(entryId: string): Promise<void> {
  await apiFetch(`/pwa/admin/lieferscheine/${entryId}/discard`, { method: 'POST' })
}

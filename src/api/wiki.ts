import { apiFetch, apiFormFetch, apiStreamFetch } from './client'

// ────────────────────────────────────────────────────────────────────────────
// Lieferanten-Wiki (Spec docs/specs/lieferanten-wiki.md)
//
// Handbücher der Lieferanten: der Admin lädt sie hoch, die Monteure fragen sie
// in der Hilfe-Blase ab und öffnen das PDF. Modul `supplier_wiki`.
// ────────────────────────────────────────────────────────────────────────────

export type WikiIndexStatus = 'pending' | 'running' | 'indexed' | 'error'

export interface WikiHandbook {
  id: string
  supplier_id: string | null
  supplier_name: string
  title: string
  file_name: string
  content_type?: string | null
  size_bytes?: number | null
  index_status: WikiIndexStatus
  chunk_count: number
  index_error?: string | null
  indexed_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  /** Signierte URL (1 h), zum Öffnen des PDFs. Null, wenn das Signieren scheiterte. */
  url: string | null
}

/** Quelle eines Wiki-Treffers — trägt zusätzlich zum Hilfe-Bot das Handbuch. */
export interface WikiSource {
  section: string
  source_file?: string
  similarity?: number
  handbook_id?: string | null
  title?: string
  supplier_name?: string
  label?: string
}

/** Ein Handbuch zur Auswahl — Antwort auf eine unklare Gerätefrage. */
export interface WikiChoice {
  handbook_id: string
  label: string
}

export type WikiEvent =
  | { type: 'delta'; text: string }
  | { type: 'sources'; sources: WikiSource[]; cached?: boolean }
  | { type: 'choice'; message: string; handbooks: WikiChoice[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** Frage ans Wiki. `handbookId` grenzt auf ein Gerät ein — fehlt sie, grenzt der
 *  Server selbst ein und schickt notfalls ein `choice`-Event statt einer Antwort. */
export async function* askWiki(
  question: string,
  handbookId?: string | null,
): AsyncGenerator<WikiEvent, void, void> {
  const body: Record<string, unknown> = { question }
  if (handbookId) body.handbook_id = handbookId
  for await (const ev of apiStreamFetch('/pwa/wiki/ask', body)) {
    yield ev as WikiEvent
  }
}

/** Typenschild-Foto → passende Handbücher.
 *
 *  Das Bild wird serverseitig nirgends gespeichert (Spec §14) und verlässt auch
 *  auf dem Gerät den Seitenspeicher nicht: kein localStorage, kein Offline-Paket. */
export async function identifyByPhoto(file: File): Promise<{
  recognized: boolean
  handbooks: WikiChoice[]
}> {
  const form = new FormData()
  form.append('photo', file, file.name || 'typenschild.jpg')
  return (await apiFormFetch('/pwa/wiki/identify', form)) as {
    recognized: boolean
    handbooks: WikiChoice[]
  }
}

export async function listWikiHandbooks(): Promise<WikiHandbook[]> {
  const res = (await apiFetch('/pwa/wiki/handbooks')) as { handbooks: WikiHandbook[] }
  return res.handbooks ?? []
}

// ── Admin ───────────────────────────────────────────────────────────────────

export interface WikiUploadFields {
  title?: string
  supplier_name?: string
  supplier_id?: string
}

export async function uploadWikiHandbook(file: File, fields: WikiUploadFields = {}): Promise<WikiHandbook> {
  const form = new FormData()
  form.append('file', file)
  if (fields.title) form.append('title', fields.title)
  if (fields.supplier_name) form.append('supplier_name', fields.supplier_name)
  if (fields.supplier_id) form.append('supplier_id', fields.supplier_id)
  const res = (await apiFormFetch('/pwa/admin/wiki/handbooks', form)) as { handbook: WikiHandbook }
  return res.handbook
}

export async function updateWikiHandbook(
  id: string,
  patch: { title?: string; supplier_name?: string; supplier_id?: string | null },
): Promise<WikiHandbook> {
  const res = (await apiFetch(`/pwa/admin/wiki/handbooks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })) as { handbook: WikiHandbook }
  return res.handbook
}

export async function deleteWikiHandbook(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/wiki/handbooks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function reindexWikiHandbook(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/wiki/handbooks/${encodeURIComponent(id)}/reindex`, { method: 'POST' })
}

export async function reindexWiki(): Promise<void> {
  await apiFetch('/pwa/admin/wiki/reindex', { method: 'POST' })
}

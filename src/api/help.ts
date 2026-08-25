import { apiFetch, apiFormFetch, apiStreamFetch } from './client'

export type HelpSource = {
  section: string
  source_file?: string
  similarity?: number
}

export type HelpEvent =
  | { type: 'delta'; text: string }
  | { type: 'sources'; sources: HelpSource[]; cached?: boolean }
  | { type: 'done' }
  | { type: 'error'; message: string }

export async function* askHelp(question: string): AsyncGenerator<HelpEvent, void, void> {
  for await (const ev of apiStreamFetch('/pwa/help/ask', { question })) {
    yield ev as HelpEvent
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handbuch-Verwaltung (Admin) — Bucket `help-docs`
// ────────────────────────────────────────────────────────────────────────────

export type HelpDoc = {
  name: string
  size?: number | null
  updated_at?: string | null
  /** Vom Anbieter publiziertes Systemhandbuch (`_system_*`) — nicht löschbar. */
  system?: boolean
}

export type ReindexStatus = {
  state: 'idle' | 'running' | 'success' | 'error'
  started_at?: string | null
  finished_at?: string | null
  files_total: number
  files_processed: number
  files_skipped: number
  chunks_indexed: number
  errors: string[]
  last_error?: string | null
}

export async function listHelpDocs(): Promise<HelpDoc[]> {
  const res = (await apiFetch('/pwa/help/docs')) as { docs: HelpDoc[] }
  return res.docs ?? []
}

export async function uploadHelpDoc(file: File): Promise<HelpDoc> {
  const form = new FormData()
  form.append('file', file)
  return (await apiFormFetch('/pwa/help/docs', form)) as HelpDoc
}

export async function deleteHelpDoc(name: string): Promise<void> {
  await apiFetch(`/pwa/help/docs/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export async function triggerHelpReindex(): Promise<void> {
  await apiFetch('/pwa/help/reindex', { method: 'POST' })
}

export async function getHelpReindexStatus(): Promise<ReindexStatus> {
  return (await apiFetch('/pwa/help/reindex/status')) as ReindexStatus
}

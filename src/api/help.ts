import { apiStreamFetch } from './client'

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

// Die fuenf Funktionen zur Handbuch-Verwaltung standen hier bis zum Rueckbau
// (P4). Sie riefen `/pwa/help/docs` und `/pwa/help/reindex` — Routen, die es
// nicht mehr gibt: Handbuecher pflegt der Betreiber auf `admin.werkora.ch`
// ueber `/pwa/superadmin/tenants/{id}/help/…` (api/platform.ts, Spec
// docs/specs/admin-werkora-ch.md §5.1/§6.5).
//
// Die Typen `HelpDoc` und `ReindexStatus` bleiben hier: Sie beschreiben die
// Antwort, nicht den Weg, und `adminSite/` importiert sie.

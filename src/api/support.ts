import { apiFetch, apiFormFetch } from './client'
import { getBreadcrumbs } from '../shared/breadcrumbs'

// ────────────────────────────────────────────────────────────────────────────
// Support-Meldung — Spec docs/specs/support-ticket.md
// ────────────────────────────────────────────────────────────────────────────

export const MAX_SUPPORT_FILES = 3
export const MAX_SUPPORT_FILE_BYTES = 10 * 1024 * 1024
/** Deckel des Freitexts — identisch zu `support_service.MAX_MESSAGE_CHARS`. */
export const MAX_SUPPORT_MESSAGE_CHARS = 2000

export type SupportTicketCreated = {
  ticket_no: number
  /** Anzeigeform «WS-1042» — kommt vom Server, damit UI, Mail und Push dieselbe
   *  Zeichenkette nennen (der Nutzer liest sie am Telefon vor). */
  reference: string
  created_at: string
  attachment_count: number
}

/** Technischer Kontext des Geräts — bewusst nur Rahmendaten, keine Inhalte. */
function clientContext(route: string) {
  return {
    route,
    user_agent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    online: navigator.onLine,
    breadcrumbs: getBreadcrumbs(),
  }
}

export async function sendSupportTicket(
  message: string,
  files: File[],
  opts: { route: string; appContext: 'pwa' | 'admin' },
): Promise<SupportTicketCreated> {
  const form = new FormData()
  form.append('message', message)
  form.append('route', opts.route)
  form.append('app_context', opts.appContext)
  form.append('client_context', JSON.stringify(clientContext(opts.route)))
  for (const file of files.slice(0, MAX_SUPPORT_FILES)) form.append('files', file)
  return apiFormFetch<SupportTicketCreated>('/pwa/support/tickets', form)
}

// ────────────────────────────────────────────────────────────────────────────
// Diktat — Spec docs/specs/support-ticket.md §5.5
// ────────────────────────────────────────────────────────────────────────────

/**
 * Aufnahme an Mistral Voice (Voxtral) und Text zurück.
 *
 * Der Server transkribiert nur — er legt weder Ticket noch Aufnahme an. Was der
 * Melder abschickt, hat er vorher im Textfeld gelesen.
 */
export async function transcribeSupportAudio(blob: Blob): Promise<string> {
  const form = new FormData()
  form.append('audio', blob, 'aufnahme.webm')
  const res = await apiFormFetch<{ text?: string }>('/pwa/support/transcribe', form)
  return (res?.text || '').trim()
}

/**
 * Diktiertes an den vorhandenen Text hängen — reine Funktion, damit die Regel
 * testbar ist statt im Formular zu verschwinden.
 *
 * Angehängt, nie ersetzt: wer erst tippt und dann diktiert (oder zweimal
 * diktiert), soll das Erste nicht verlieren. Der Deckel greift hier von Hand —
 * `maxLength` des Textfeldes bremst nur die Tastatur, nicht `setState`.
 */
export function appendTranscript(existing: string, addition: string): string {
  const add = addition.trim()
  if (!add) return existing
  const base = existing.trimEnd()
  const merged = base ? `${base} ${add}` : add
  return merged.slice(0, MAX_SUPPORT_MESSAGE_CHARS)
}

// ────────────────────────────────────────────────────────────────────────────
// Superadmin-Eingang
// ────────────────────────────────────────────────────────────────────────────

export type SupportStatus = 'offen' | 'in_arbeit' | 'erledigt'

export type SupportTicket = {
  id: string
  ticket_no: number
  reference: string
  tenant_id: string
  tenant_name?: string | null
  created_by_name?: string | null
  created_by_role?: string | null
  message: string
  route?: string | null
  app_context?: string | null
  status: SupportStatus
  superadmin_note?: string | null
  created_at: string
  updated_at?: string | null
  closed_at?: string | null
  snapshot_error_count: number
  snapshot_top_source?: string | null
  attachment_count: number
}

export type SupportAttachment = {
  path: string
  size?: number
  content_type?: string
  url?: string | null
}

export type SupportSnapshot = {
  window_minutes?: number
  since?: string
  audit?: { action: string; entity: string; performed_by: string; platform: string; created_at: string }[]
  errors?: { source: string; error_type?: string; message: string; level: string; occurred_at: string }[]
  health?: { service: string; status: string; response_ms?: number; checked_at: string }[]
  client?: {
    route?: string
    user_agent?: string
    viewport?: string
    online?: boolean
    breadcrumbs?: { t: string; kind: string; detail: string }[]
  }
  /** Namen der Quellen, die beim Bauen ausgefallen sind. Leer = vollständig. */
  partial?: string[]
}

export type SupportTicketDetail = SupportTicket & {
  snapshot: SupportSnapshot
  attachments: SupportAttachment[]
}

export type SupportListResponse = {
  tickets: SupportTicket[]
  tenants: { id: string; name: string }[]
  capped: boolean
}

export async function fetchSupportTickets(
  params: { status?: string; tenantId?: string } = {},
): Promise<SupportListResponse> {
  const q = new URLSearchParams()
  if (params.status) q.set('status', params.status)
  if (params.tenantId) q.set('tenant_id', params.tenantId)
  const suffix = q.toString() ? `?${q}` : ''
  return apiFetch<SupportListResponse>(`/pwa/superadmin/support-tickets${suffix}`)
}

export async function fetchSupportTicket(id: string): Promise<SupportTicketDetail> {
  return apiFetch<SupportTicketDetail>(`/pwa/superadmin/support-tickets/${id}`)
}

export async function updateSupportTicket(
  id: string,
  body: { status?: SupportStatus; superadmin_note?: string },
): Promise<unknown> {
  return apiFetch(`/pwa/superadmin/support-tickets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export type SupportDashboard = {
  counts: Record<SupportStatus, number>
  open_total: number
  new_7d: number
  new_prev_7d: number
  median_hours_30d: number | null
  error_share_30d: number | null
  total_30d: number
  window_days: number
  by_week: { week: string; count: number }[]
  by_tenant: { key: string; name?: string; count: number }[]
  by_context: { key: string; count: number }[]
  by_route: { key: string; count: number }[]
  by_source: { key: string; count: number }[]
}

export async function fetchSupportDashboard(): Promise<SupportDashboard> {
  return apiFetch<SupportDashboard>('/pwa/superadmin/support-dashboard')
}

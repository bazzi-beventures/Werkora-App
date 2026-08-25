import { apiBlobFetch, apiFetch } from './client'

export type ErrorLevel = 'warning' | 'error' | 'critical'

export const ERROR_LEVELS: ErrorLevel[] = ['critical', 'error', 'warning']

export interface ErrorLogRow {
  id: number
  occurred_at: string
  tenant_id: string | null
  tenant_name: string | null
  user_id: string | null
  level: ErrorLevel
  source: string
  error_type: string | null
  message: string
  traceback: string | null
  fingerprint: string | null
  context: Record<string, unknown>
}

export interface ErrorLogTenant {
  id: string
  name: string
}

export interface ErrorLogsResponse {
  rows: ErrorLogRow[]
  tenants: ErrorLogTenant[]
  // Gesamtzahl der Treffer im Fenster (unabhängig vom 500er-Deckel der Ansicht);
  // null, wenn der Server sie nicht zählen konnte.
  total: number | null
  capped: boolean  // true wenn das Fenster mehr als das Limit (500) hätte
}

export interface ErrorLogsParams {
  since?: string          // ISO-Zeitstempel (occurred_at >=)
  until?: string          // ISO-Zeitstempel (occurred_at <=)
  tenantId?: string
  levels?: ErrorLevel[]   // leer/alle = keine Einschränkung
  q?: string              // Freitext über Meldung/Typ/Quelle/Signatur
}

// Exportiert, weil Ansicht und CSV-Export dieselben Filter tragen müssen —
// ein Export mit anderen Filtern als die Ansicht wäre stillschweigend falsch.
export function buildErrorLogQuery(params: ErrorLogsParams = {}): string {
  const q = new URLSearchParams()
  if (params.since) q.set('since', params.since)
  if (params.until) q.set('until', params.until)
  if (params.tenantId) q.set('tenant_id', params.tenantId)
  const levels = params.levels ?? []
  if (levels.length > 0 && levels.length < ERROR_LEVELS.length) q.set('level', levels.join(','))
  const term = (params.q ?? '').trim()
  if (term) q.set('q', term)
  const qs = q.toString()
  return qs ? `?${qs}` : ''
}

export async function getErrorLogs(params: ErrorLogsParams = {}): Promise<ErrorLogsResponse> {
  return apiFetch<ErrorLogsResponse>(`/pwa/superadmin/error-logs${buildErrorLogQuery(params)}`)
}

/**
 * Lädt den gewählten Zeitraum als CSV herunter (kompletter Zeitraum, nicht nur
 * die 500 angezeigten Zeilen). Gibt zurück, ob der Server an der Zeilenober-
 * grenze abschneiden musste — sonst hielte man einen Teil-Export für vollständig.
 */
export async function downloadErrorLogsCsv(params: ErrorLogsParams = {}): Promise<{ truncated: boolean }> {
  const { blob, filename, headers } = await apiBlobFetch(
    `/pwa/superadmin/error-logs.csv${buildErrorLogQuery(params)}`,
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : 'error-logs.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return { truncated: headers.get('X-Export-Truncated') === '1' }
}

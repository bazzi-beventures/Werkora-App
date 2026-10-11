import { apiFetch } from './client'

export type ServiceName = 'railway' | 'supabase' | 'mistral'
export type ServiceStatus = 'ok' | 'down' | 'slow'

export interface LatestCheck {
  checked_at: string
  status: ServiceStatus
  response_ms: number | null
  http_status: number | null
  error: string | null
  is_stale?: boolean  // true wenn checked_at älter als ~10min — Probe-Cron tot
}

export interface UptimeStats {
  checks: number
  ok: number
  uptime_pct: number
  avg_ms: number | null
}

export interface ServiceHealth {
  latest: LatestCheck | null
  uptime_24h: UptimeStats
  uptime_7d: UptimeStats
}

export interface HealthStatusResponse {
  services: Record<ServiceName, ServiceHealth>
}

export async function getHealthStatus(): Promise<HealthStatusResponse> {
  return apiFetch<HealthStatusResponse>('/pwa/superadmin/health/status')
}

export interface DayUptime {
  uptime_pct: number
  checks: number
  avg_ms: number | null
}

export interface HistoryDay {
  day: string  // YYYY-MM-DD
  railway: DayUptime | null
  supabase: DayUptime | null
  mistral: DayUptime | null
}

export interface HealthHistoryResponse {
  days: HistoryDay[]
}

export async function getHealthHistory(days = 90): Promise<HealthHistoryResponse> {
  return apiFetch<HealthHistoryResponse>(`/pwa/superadmin/health/history?days=${days}`)
}

// Migrationsstand (docs/specs/migrations-runner.md §6.3). Nur Versionen und
// Metadaten — der Endpunkt liefert nie Dateiinhalte.
export type MigrationGateStatus = 'aktuell' | 'fehlend' | 'unbekannt' | 'nicht_lesbar'

export interface MigrationRun {
  version: string
  applied_at: string | null
  applied_by: string | null
  snapshot: string | null
}

export interface MigrationStatus {
  status: MigrationGateStatus
  erwartet: number
  angewandt: number | null
  baseline: number | null
  fehlend: string[]
  letzte: MigrationRun[]
}

export async function getMigrationStatus(): Promise<MigrationStatus> {
  return apiFetch<MigrationStatus>('/pwa/superadmin/health/migrations')
}

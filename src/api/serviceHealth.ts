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

// Routen-Messung (docs/specs/refactoring-wachstum.md §9): Dauer bis zur Antwort,
// Antwort-Bytes vor GZip und DB-Roundtrips je Route-Schablone — ohne Nutzer und
// Mandant. `nicht_lesbar` statt einer leeren Liste, wenn die Messung fehlt.
export interface RouteMetric {
  method: string
  route: string
  requests: number
  errors: number
  dauer_ms_avg: number | null
  dauer_ms_max: number | null
  bytes_sum: number
  bytes_avg: number | null
  bytes_max: number | null
  db_sum: number
  db_avg: number | null
  db_max: number | null
}

export type RouteMetricsResponse =
  | { status: 'nicht_lesbar'; days: number }
  | {
      status: 'ok'
      days: number
      routen: number
      requests: number
      errors: number
      bytes: number
      db: number
      min_requests: number
      langsamste: RouteMetric[]
      schwerste: RouteMetric[]
      abfragereichste: RouteMetric[]
    }

export async function getRouteMetrics(days = 7): Promise<RouteMetricsResponse> {
  return apiFetch<RouteMetricsResponse>(`/pwa/superadmin/health/routes?days=${days}`)
}

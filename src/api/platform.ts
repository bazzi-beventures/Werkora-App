/**
 * API der Betreiber-Seite `admin.werkora.ch`.
 *
 * Spec: docs/specs/admin-werkora-ch.md §5.1.
 *
 * Zwei Sorten Route, und der Unterschied steckt im Pfad:
 *
 * - **Plattform** (`/pwa/superadmin/…`) — Fehlerbestand, Support, Dienst-Status,
 *   Push-Test, Newsletter. Reichen über alle Mandanten und kennen keinen
 *   Mandanten-Parameter. Die liegen weiterhin in ihren bisherigen Modulen
 *   (`api/errorLogs.ts`, `api/support.ts`, `api/serviceHealth.ts`, `api/adminPush.ts`) —
 *   sie haben sich durch den Umzug nicht geändert.
 * - **Mandant** (`/pwa/superadmin/tenants/{tenantId}/…`) — die Kalibrierung
 *   EINES Mandanten. Nur die stehen hier.
 *
 * Jede Funktion unten nimmt die `tenantId` als **erstes Argument**, nie aus
 * einem Modulzustand. Ein „zuletzt gewählter Mandant“ im Modul wäre der kürzere
 * Weg und genau der Fehler, vor dem §12 warnt: die Schreibaktion landete im
 * falschen Mandanten, und niemand sähe es der Aufrufstelle an.
 */
import { apiFetch } from './client'
import type { AuthUser } from './admin/users'
import type { HelpDoc, ReindexStatus } from './help'
import type { BulkMaterialStatusResult, MaterialCleanupScan } from './admin/materials'
import type { WerkoraBonusResponse } from './admin/werkoraBonus'
// Die Antwortformen sind identisch — die Rümpfe im Backend sind dieselben
// Funktionen (agents/routers/admin_tenant_settings.py). Eigene, lose Typen
// hier wären ein zweites Schema für dieselben Felder und würden an jeder
// Zuweisung im Screen auseinanderlaufen.
import type {
  FeatureRegistryEntry, SchedulingConfig, TenantFeaturesResponse,
  TenantModulesResponse, TenantSchedulingResponse, TenantTravelCostResponse,
  TravelCostRow,
} from './admin/tenant'

/** Ein Mandant, wie ihn der Wähler und die Übersicht brauchen. */
export interface PlatformTenant {
  id: string
  slug: string
  name: string
  enabled_modules: string[]
  beta_modules: string[]
}

/** Die Zähler der Mandanten-Übersicht (§4.3/1). */
export interface PlatformTenantSummary extends PlatformTenant {
  module_count: number
  beta_module_count: number
  account_count: number
  beta_tester_count: number
  last_access_at: string | null
}

/** Basis jeder mandantengebundenen Route. Nicht exportiert — wer sie von aussen
 *  zusammensetzen könnte, könnte sie auch ohne Mandanten zusammensetzen. */
const tenantBase = (tenantId: string) => `/pwa/superadmin/tenants/${encodeURIComponent(tenantId)}`

// ─── Mandantenliste und Übersicht ──────────────────────────────────────────

export async function listTenants(): Promise<PlatformTenant[]> {
  const res = await apiFetch<{ tenants: PlatformTenant[] }>('/pwa/superadmin/tenants')
  return res.tenants ?? []
}

export function getTenantSummary(tenantId: string): Promise<PlatformTenantSummary> {
  return apiFetch<PlatformTenantSummary>(`${tenantBase(tenantId)}/summary`)
}

// ─── Konfiguration: Module, Feature-Flags, Fahrtkosten, Einsatzplanung ─────

export function getModules(tenantId: string): Promise<TenantModulesResponse> {
  return apiFetch<TenantModulesResponse>(`${tenantBase(tenantId)}/tenant/modules`)
}

export function setModules(
  tenantId: string,
  enabledModules: string[],
  betaModules: string[],
): Promise<{ enabled_modules: string[]; beta_modules: string[] }> {
  return apiFetch(`${tenantBase(tenantId)}/tenant/modules`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled_modules: enabledModules, beta_modules: betaModules }),
  })
}

export function getFeatures(tenantId: string): Promise<TenantFeaturesResponse> {
  return apiFetch<TenantFeaturesResponse>(`${tenantBase(tenantId)}/tenant/features`)
}

export function setFeature(
  tenantId: string,
  featureKey: string,
  value: Record<string, unknown>,
): Promise<{ feature_key: string; effective: Record<string, unknown> }> {
  return apiFetch(`${tenantBase(tenantId)}/tenant/features`, {
    method: 'PATCH',
    body: JSON.stringify({ feature_key: featureKey, value }),
  })
}

export function getTravelCost(tenantId: string): Promise<TenantTravelCostResponse> {
  return apiFetch<TenantTravelCostResponse>(`${tenantBase(tenantId)}/tenant/travel-cost`)
}

export function setTravelCost(
  tenantId: string,
  table: TravelCostRow[] | null,
): Promise<{ travel_cost_table: TravelCostRow[] | null }> {
  return apiFetch(`${tenantBase(tenantId)}/tenant/travel-cost`, {
    method: 'PATCH',
    body: JSON.stringify({ travel_cost_table: table }),
  })
}

export function getScheduling(tenantId: string): Promise<TenantSchedulingResponse> {
  return apiFetch<TenantSchedulingResponse>(`${tenantBase(tenantId)}/tenant/scheduling`)
}

export function setScheduling(
  tenantId: string,
  config: SchedulingConfig,
): Promise<{ config: SchedulingConfig }> {
  return apiFetch(`${tenantBase(tenantId)}/tenant/scheduling`, {
    method: 'PATCH',
    body: JSON.stringify({ config }),
  })
}

// ─── Testing: wer in diesem Mandanten Beta-Tester ist ──────────────────────

export function listUsers(tenantId: string): Promise<AuthUser[]> {
  return apiFetch<AuthUser[]>(`${tenantBase(tenantId)}/users`)
}

export function setBetaTester(
  tenantId: string,
  userId: string,
  betaTester: boolean,
): Promise<{ status: string }> {
  return apiFetch(`${tenantBase(tenantId)}/users/${encodeURIComponent(userId)}/beta-tester`, {
    method: 'PATCH',
    body: JSON.stringify({ beta_tester: betaTester }),
  })
}

// ─── Hilfe-Bot: Handbücher des Mandanten ──────────────────────────────────

export async function listHelpDocs(tenantId: string): Promise<HelpDoc[]> {
  const res = await apiFetch<{ docs: HelpDoc[] }>(`${tenantBase(tenantId)}/help/docs`)
  return res.docs ?? []
}

export function deleteHelpDoc(tenantId: string, name: string): Promise<{ status: string }> {
  return apiFetch(`${tenantBase(tenantId)}/help/docs/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}

export function uploadHelpDoc(tenantId: string, file: File): Promise<{ status: string; name: string }> {
  const form = new FormData()
  form.append('file', file)
  // Kein Content-Type setzen: den Multipart-Boundary bestimmt der Browser.
  return apiFetch(`${tenantBase(tenantId)}/help/docs`, { method: 'POST', body: form })
}

export function reindexHelp(tenantId: string): Promise<{ status: string }> {
  return apiFetch(`${tenantBase(tenantId)}/help/reindex`, { method: 'POST' })
}

export function getReindexStatus(tenantId: string): Promise<ReindexStatus> {
  return apiFetch<ReindexStatus>(`${tenantBase(tenantId)}/help/reindex/status`)
}

// ─── Materialdatenbereinigung und Werkora Bonus ───────────────────────────

export function materialCleanupScan(
  tenantId: string,
  params: Record<string, string | number>,
): Promise<MaterialCleanupScan> {
  const q = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== '' && v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)]),
  ).toString()
  return apiFetch(`${tenantBase(tenantId)}/material-cleanup/scan${q ? `?${q}` : ''}`)
}

export function materialCleanupBulkStatus(
  tenantId: string,
  body: Record<string, unknown>,
): Promise<BulkMaterialStatusResult> {
  return apiFetch(`${tenantBase(tenantId)}/material-cleanup/bulk-status`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function getWerkoraBonus(
  tenantId: string,
  von: string,
  bis: string,
): Promise<WerkoraBonusResponse> {
  const q = new URLSearchParams({ von, bis }).toString()
  return apiFetch(`${tenantBase(tenantId)}/werkora-bonus?${q}`)
}

// ─── LLM-Kosten und Nutzung ───────────────────────────────────────────────

/** Nur die Betreiber-Views (`db.PLATFORM_VIEWS`) — die Kennzahlen des Mandanten
 *  antwortet diese Route mit 404. Die Admin-Seite ist nicht der zweite Weg in
 *  fremde Projekt- und Lohnzahlen (Spec §5.1). */
export function getKpiView<T = Record<string, unknown>>(
  tenantId: string,
  viewName: string,
  filters: Record<string, string> = {},
): Promise<{ view: string; rows: T[]; count: number }> {
  const q = new URLSearchParams(filters).toString()
  return apiFetch(`${tenantBase(tenantId)}/kpi-views/${encodeURIComponent(viewName)}${q ? `?${q}` : ''}`)
}

export type { FeatureRegistryEntry }

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
import type { BulkMaterialStatusResult, MaterialCleanupScan, MaterialsMeta } from './admin/materials'
import type { Supplier } from './admin/suppliers'
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

/** Setzt das Passwort eines Kontos im gewählten Mandanten (Reset von aussen).
 *  Das alte Passwort wird nicht verlangt, die Sitzungen des Kontos enden.
 *  Policy-Verstösse kommen als deutscher Klartext zurück. */
export function setUserPassword(
  tenantId: string,
  userId: string,
  newPassword: string,
): Promise<{ status: string }> {
  return apiFetch(`${tenantBase(tenantId)}/users/${encodeURIComponent(userId)}/set-password`, {
    method: 'POST',
    body: JSON.stringify({ new_password: newPassword }),
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

/** Kategorien/Einheiten des gewaehlten Mandanten (Filter der Bereinigung). */
export function materialsMeta(tenantId: string): Promise<MaterialsMeta> {
  return apiFetch<MaterialsMeta>(`${tenantBase(tenantId)}/materials/meta`)
}

/** Lieferanten des gewaehlten Mandanten — Filter UND Lieferanten-Spalte. */
export function listSuppliers(tenantId: string): Promise<Supplier[]> {
  return apiFetch<Supplier[]>(`${tenantBase(tenantId)}/suppliers`)
}

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

// ─── bexio-Anbindung (docs/specs/bexio-anbindung.md §8.1) ───────────────────

export interface BexioCatalogAccount { id: number; account_no: string; name: string; is_active: boolean }
export interface BexioCatalog {
  user_id: number | null
  user_email?: string | null
  company_id: number | null
  company_name: string | null
  numbering_automatic: boolean | null
  taxes: { id: number; code: string | null; value: number | null; name?: string | null }[]
  accounts: BexioCatalogAccount[]
  units: { id: number; name: string }[]
  banks: { id: number; name: string; iban: string; qr_iban: string }[]
}

/** Die Verbindung ohne Geheimnis — `secret_enc` kommt nie über die Leitung. */
export interface BexioConnection {
  auth_kind: 'api_token' | 'oauth'
  secret_set: boolean
  secret_set_at: string | null
  secret_expires_at: string | null
  bexio_company_name: string | null
  bexio_user_id: number | null
  default_account_id: number | null
  account_by_work_type: Record<string, number>
  default_tax_id: number | null
  default_tax_id_zero: number | null
  default_unit_id_hours: number | null
  default_unit_id_piece: number | null
  default_unit_id_flat: number | null
  default_bank_account_id: number | null
  payments_push: boolean
  payments_pull: boolean
  status: 'ok' | 'error' | 'disabled'
  last_ok_at: string | null
  last_error: string | null
  /** Von bexio erteilte Scopes (Leerzeichen-getrennt); null = unbekannt bzw. persönliches Token. */
  granted_scopes?: string | null
}

export interface BexioView {
  key_configured: boolean
  module_enabled: boolean
  connection: BexioConnection | null
  catalog: BexioCatalog | null
  work_types: string[]
  readiness: string[]
  queue_counts: Record<string, number>
  findings?: string[]
  /** «Mit bexio verbinden» (OpenID Connect) ist in dieser Umgebung eingerichtet. */
  oauth_configured?: boolean
  /** Persönliches Token erlaubt — nur Staging-Mandanten (Spec §4.4). Fehlt das Feld: wie bisher erlaubt. */
  pat_allowed?: boolean
  /** Freigaben, die bexio dieser Verbindung nicht erteilt hat, mit Zweck (Spec §8.1). */
  missing_scopes?: { scope: string; purpose: string }[]
  /** Rechnungen, deren Werkora-PDF bexio abgelehnt hat (Spec §6.3a). */
  pdf_errors?: number
  /** Antwort von «PDFs nachreichen»: so viele Rechnungen eingereiht. */
  enqueued?: number
}

export interface BexioJob {
  id: number
  kind: 'customer_upsert' | 'invoice_issue' | 'payment_sync' | 'invoice_cancelled'
  local_id: string
  status: 'pending' | 'running' | 'done' | 'error' | 'needs_attention'
  attempts: number
  last_error: string | null
  created_at: string
  finished_at: string | null
}

export type BexioDefaults = Pick<BexioConnection,
  'default_account_id' | 'account_by_work_type' | 'default_tax_id' | 'default_tax_id_zero'
  | 'default_unit_id_hours' | 'default_unit_id_piece' | 'default_unit_id_flat'
  | 'default_bank_account_id' | 'payments_push' | 'payments_pull'>

const bexioBase = (tenantId: string) => `${tenantBase(tenantId)}/bexio`

export function getBexio(tenantId: string): Promise<BexioView> {
  return apiFetch<BexioView>(bexioBase(tenantId))
}

export function setBexioToken(tenantId: string, token: string, createdOn?: string): Promise<BexioView> {
  return apiFetch<BexioView>(`${bexioBase(tenantId)}/token`, {
    method: 'PUT',
    body: JSON.stringify({ token, created_on: createdOn || null }),
  })
}

export function testBexio(tenantId: string): Promise<BexioView> {
  return apiFetch<BexioView>(`${bexioBase(tenantId)}/test`, { method: 'POST' })
}

export function setBexioDefaults(tenantId: string, defaults: BexioDefaults): Promise<BexioView> {
  return apiFetch<BexioView>(`${bexioBase(tenantId)}/defaults`, {
    method: 'PUT',
    body: JSON.stringify(defaults),
  })
}

/** «Mit bexio verbinden»: Adresse der Anmeldung bei bexio, 15 Minuten gültig, einmal einlösbar. */
export function startBexioOAuth(tenantId: string): Promise<{ authorize_url: string; expires_in_minutes: number }> {
  return apiFetch(`${bexioBase(tenantId)}/oauth/start`, { method: 'POST' })
}

export function deleteBexio(tenantId: string): Promise<BexioView> {
  return apiFetch<BexioView>(bexioBase(tenantId), { method: 'DELETE' })
}

export async function listBexioJobs(tenantId: string, status?: string): Promise<BexioJob[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  const res = await apiFetch<{ jobs: BexioJob[] }>(`${bexioBase(tenantId)}/queue${q}`)
  return res.jobs
}

export function retryBexioJob(tenantId: string, jobId: number) {
  return apiFetch(`${bexioBase(tenantId)}/queue/${jobId}/retry`, { method: 'POST' })
}

export function linkBexioContact(tenantId: string, jobId: number, bexioContactId: number) {
  return apiFetch(`${bexioBase(tenantId)}/queue/${jobId}/link-contact`, {
    method: 'POST',
    body: JSON.stringify({ bexio_contact_id: bexioContactId }),
  })
}

export function cancelInBexio(tenantId: string, jobId: number) {
  return apiFetch(`${bexioBase(tenantId)}/queue/${jobId}/cancel-in-bexio`, { method: 'POST' })
}

/** «PDFs nachreichen»: Rechnungen, deren PDF bexio abgelehnt hat, neu einreihen (Spec §6.3a). */
export function resendBexioPdfs(tenantId: string): Promise<BexioView> {
  return apiFetch<BexioView>(`${bexioBase(tenantId)}/pdfs/resend`, { method: 'POST' })
}

export function enqueueBexioInvoice(tenantId: string, invoiceNumber: string) {
  return apiFetch(`${bexioBase(tenantId)}/invoices/enqueue`, {
    method: 'POST',
    body: JSON.stringify({ invoice_number: invoiceNumber }),
  })
}

// ─── Mail-Eingang (docs/specs/mail-eingang-triage.md §6.4, §10) ─────────────
//
// Die Absenderschranke eines Mandanten: Triage-Postfach, Mail-Domains und
// Funktionsadressen. Sie steht bewusst nur hier und nicht in der Mandanten-App —
// wer die Liste ändern kann, kann die Schranke öffnen.

/** Wo das Triage-Postfach liegt: Microsoft 365 (Graph) oder Google Workspace (Gmail API). */
export type MailSystem = 'graph' | 'gmail'

/** Was der Betreiber einstellt. */
export interface MailEingangEinstellung {
  /** Mailsystem des Triage-Postfachs. Fehlt bei einem Server ohne Gmail-Anbindung → Microsoft. */
  anbieter?: MailSystem
  /** Adresse des Triage-Postfachs; leer = nicht eingerichtet. */
  mailbox: string
  /** Mail-Domains des Betriebs. **Leer heisst: nichts wird ausgewertet.** */
  domains: string[]
  /** Adressen ohne Konto, die trotzdem zuleiten dürfen (z. B. `info@…`). */
  funktionsadressen: string[]
  /** Höchstens so viele Mails je Tag werden ausgewertet. */
  tageslimit: number
}

export interface MailEingangView extends MailEingangEinstellung {
  last_poll_at: string | null
  last_poll_fehler: string | null
  /** Der Zugang zum gewählten Mailsystem ist in dieser Umgebung eingerichtet. */
  postfach_bereit?: boolean
  /** Zugang zu Microsoft 365 (Graph) in dieser Umgebung eingerichtet. */
  graph_bereit: boolean
  /** Zugang zu Google Workspace (Dienstkonto) in dieser Umgebung eingerichtet. */
  gmail_bereit?: boolean
  /** Modul `mail_eingang` ist für den Mandanten eingeschaltet — dann läuft der Abruf. */
  modul_aktiv: boolean
  /** Zähler «nicht ausgewertet» je Grund. */
  abgewiesen: { grund: string; anzahl: number }[]
}

const mailEingangPfad = (tenantId: string) => `${tenantBase(tenantId)}/mail-eingang`

export function getMailEingang(tenantId: string): Promise<MailEingangView> {
  return apiFetch<MailEingangView>(mailEingangPfad(tenantId))
}

/** Validierungsfehler kommen als 400 mit Klartext in `detail` (→ `ApiError.message`). */
export function setMailEingang(tenantId: string, einstellung: MailEingangEinstellung): Promise<MailEingangView> {
  return apiFetch<MailEingangView>(mailEingangPfad(tenantId), {
    method: 'PUT',
    body: JSON.stringify(einstellung),
  })
}

// ─── Servicebegleitung (docs/specs/servicebegleitung.md §4.3) ───────────────
//
// Welche Werkzeuge ein Mandant hat und mit welchen Parametern. Nur auf der
// Betreiber-Seite: ein falsch gestellter Schalter verschickt Mails an fremde
// Kunden, und die Werte entstehen im Workshop mit dem Betrieb.

export interface WerkzeugFeld {
  key: string
  label: string
  type: 'bool' | 'number' | 'time'
  min?: number
  max?: number
  step?: number
}

export interface WerkzeugKatalogEintrag {
  key: string
  label: string
  description: string
  /** Schickt oder zeigt dem Kunden des Betriebs etwas. */
  kundenwirksam: boolean
  hinweis_kunde: string
  default: Record<string, boolean | number | string>
  schema: WerkzeugFeld[]
}

export interface ServiceDepot {
  adresse: string
  lat: number | null
  lon: number | null
}

export interface ServiceBegleitungView {
  katalog: WerkzeugKatalogEintrag[]
  werkzeuge: Record<string, Record<string, boolean | number | string>>
  depot: ServiceDepot
  modul_aktiv: boolean
  info_mitarbeitende: string
  updated_at: string | null
  updated_by: string | null
}

const servicePfad = (tenantId: string) => `${tenantBase(tenantId)}/service-begleitung`

export function getServiceBegleitung(tenantId: string): Promise<ServiceBegleitungView> {
  return apiFetch<ServiceBegleitungView>(servicePfad(tenantId))
}

/** Validierungsfehler kommen als 400 mit Klartext in `detail` (→ `ApiError.message`). */
export function setServiceBegleitung(
  tenantId: string,
  einstellung: { werkzeuge: ServiceBegleitungView['werkzeuge']; depot: { adresse: string } },
): Promise<ServiceBegleitungView> {
  return apiFetch<ServiceBegleitungView>(servicePfad(tenantId), {
    method: 'PUT',
    body: JSON.stringify(einstellung),
  })
}

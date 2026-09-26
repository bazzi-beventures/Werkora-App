/**
 * Feature-Anfragen — Betreiberseite (Spec docs/specs/feature-anfragen.md §7).
 *
 * Zwei Ebenen (Spec F1): eine *Anfrage* (`WW-1042`) ist der Wortlaut eines
 * Menschen, ein *Feature* (`WF-12`) die Karte auf dem Board, die Anfragen aus
 * mehreren Betrieben bündelt.
 *
 * Neben den Aufrufen stehen hier die reinen Funktionen, die Anzeige und
 * Backend gleich halten müssen — allen voran `formatTarget`. Dieselbe Regel
 * steht in `services/feature_requests.py::format_target`; die Tests beider
 * Seiten prüfen dieselben Beispiele.
 */
import { apiBlobFetch, apiFetch, apiFormFetch } from './client'

export type Phase =
  | 'pruefung' | 'geplant' | 'entwurf' | 'umsetzung' | 'test' | 'verfuegbar'
  | 'zurueckgestellt' | 'abgelehnt'

export type Triage = 'neu' | 'zugeordnet' | 'beantwortet' | 'support' | 'abgelehnt'
export type TriageAction = 'zuordnen' | 'neues_feature' | 'support' | 'beantworten' | 'ablehnen'
export type Importance = 'schoen' | 'wichtig' | 'dringend'
export type Precision = 'woche' | 'monat' | 'quartal'
export type Channel = 'whatsapp' | 'telefon' | 'mail' | 'vor_ort'

/** Board-Spalten in Reihenfolge (Spec §4.1). */
export const BOARD_PHASES: Phase[] = ['pruefung', 'geplant', 'entwurf', 'umsetzung', 'test', 'verfuegbar']
/** Endzustände — eingeklappt unter dem Board. */
export const END_PHASES: Phase[] = ['zurueckgestellt', 'abgelehnt']

export const PHASE_LABEL: Record<Phase, string> = {
  pruefung: 'In Prüfung',
  geplant: 'Geplant',
  entwurf: 'Entwurf',
  umsetzung: 'In Umsetzung',
  test: 'Im Test',
  verfuegbar: 'Verfügbar',
  zurueckgestellt: 'Später',
  abgelehnt: 'Nicht geplant',
}

/** Bei diesen Phasen wartet der Nutzer auf Nachricht — das Häkchen
 *  «Anfragende benachrichtigen» ist dort vorbelegt (Spec F11). Gleiche Liste
 *  wie `NOTIFY_DEFAULT_PHASES` in services/feature_requests.py. */
export const NOTIFY_DEFAULT_PHASES: Phase[] = ['geplant', 'test', 'verfuegbar', 'abgelehnt']

/** Endzustände verlangen einen öffentlichen Grund (Spec §7.4). */
export const REASON_REQUIRED: Phase[] = ['zurueckgestellt', 'abgelehnt']

export const TRIAGE_LABEL: Record<Triage, string> = {
  neu: 'Neu',
  zugeordnet: 'Zugeordnet',
  beantwortet: 'Beantwortet',
  support: 'An Support',
  abgelehnt: 'Abgelehnt',
}

/** Bereichskatalog (Spec §5.7) — Schlüssel wie im Backend. */
export const AREA_LABEL: Record<string, string> = {
  zeiterfassung: 'Zeiterfassung',
  einsatzplanung: 'Einsatzplanung',
  projekte: 'Projekte & Aufgaben',
  rapporte: 'Rapporte',
  offerten: 'Offerten',
  rechnungen: 'Rechnungen & Zahlungen',
  material: 'Material & Lager',
  personal: 'Personal & Absenzen',
  kunden: 'Kunden',
  auswertungen: 'Auswertungen & Kennzahlen',
  hilfe: 'Hilfe, Wiki & Support',
  sonstiges: 'Sonstiges',
}

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  schoen: 'Wäre schön',
  wichtig: 'Wichtig',
  dringend: 'Ohne geht es kaum',
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  telefon: 'Telefon',
  mail: 'Mail',
  vor_ort: 'vor Ort',
}

// ── Zeit (Spec F13: Datum, nie Uhrzeit) ─────────────────────────────────────

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember']
const MONATE_KURZ = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli',
  'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.']

/** `YYYY-MM-DD` als lokales Datum ohne Zeitzonen-Verschiebung. */
function parseDay(s?: string | null): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** ISO-Kalenderwoche und ihr Jahr (die KW 1 kann im Dezember beginnen). */
export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: t.getUTCFullYear(), week }
}

/** «KW 42 2026», «Oktober 2026», «Q4 2026» — gleiche Regel wie das Backend. */
export function formatTarget(from?: string | null, to?: string | null, precision?: string | null): string {
  const start = parseDay(from)
  const end = parseDay(to) ?? start
  if (!start || !end || !precision || !['woche', 'monat', 'quartal'].includes(precision)) {
    return 'noch ohne Termin'
  }
  if (precision === 'woche') {
    const a = isoWeek(start)
    const b = isoWeek(end)
    if (a.year === b.year && a.week === b.week) return `KW ${a.week} ${a.year}`
    if (a.year === b.year) return `KW ${a.week}–${b.week} ${a.year}`
    return `KW ${a.week} ${a.year} – KW ${b.week} ${b.year}`
  }
  if (precision === 'monat') {
    const sameYear = start.getFullYear() === end.getFullYear()
    if (sameYear && start.getMonth() === end.getMonth()) {
      return `${MONATE[start.getMonth()]} ${start.getFullYear()}`
    }
    if (sameYear) return `${MONATE_KURZ[start.getMonth()]}–${MONATE_KURZ[end.getMonth()]} ${end.getFullYear()}`
    return `${MONATE_KURZ[start.getMonth()]} ${start.getFullYear()} – ${MONATE_KURZ[end.getMonth()]} ${end.getFullYear()}`
  }
  const q1 = Math.floor(start.getMonth() / 3) + 1
  const q2 = Math.floor(end.getMonth() / 3) + 1
  if (start.getFullYear() === end.getFullYear() && q1 === q2) return `Q${q1} ${start.getFullYear()}`
  if (start.getFullYear() === end.getFullYear()) return `Q${q1}–Q${q2} ${start.getFullYear()}`
  return `Q${q1} ${start.getFullYear()} – Q${q2} ${end.getFullYear()}`
}

/** `2026-09-25` → `25.09.26`. Nie eine Uhrzeit (F13). */
export function fmtDay(s?: string | null): string {
  const d = parseDay(s)
  if (!d) return '—'
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** Heute als `YYYY-MM-DD` in lokaler Zeit (für Datumsfelder). */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

// ── Typen ───────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  art: 'phase' | 'ziel' | 'update' | 'intern'
  on: string
  phase?: Phase
  text?: string
  by?: string
  from?: { from: string; to: string; precision: Precision } | null
  to?: { from: string; to: string; precision: Precision } | null
}

export interface FeatureCard {
  id: string
  feature_no: number
  reference: string
  title: string
  area: string
  phase: Phase
  phase_label: string
  phase_since: string
  visibility: 'oeffentlich' | 'intern'
  target_from?: string | null
  target_to?: string | null
  target_precision?: Precision | null
  target_label: string
  priority?: number | null
  effort?: 'S' | 'M' | 'L' | 'XL' | null
  request_count: number
  tenant_count: number
  last_request_on?: string | null
  updated_at?: string
}

export interface FeatureRequestRow {
  id: string
  tenant_id: string
  tenant_name?: string | null
  request_no: number
  reference: string
  feature_id?: string | null
  origin: 'anfrage' | 'unterstuetzung'
  source: 'app' | 'betreiber'
  source_channel?: Channel | null
  created_by?: string | null
  created_by_name?: string | null
  created_by_role?: string | null
  title?: string | null
  description?: string | null
  problem?: string | null
  area?: string | null
  importance: Importance
  app_context?: string | null
  route?: string | null
  triage: Triage
  answer?: string | null
  support_ticket_id?: string | null
  internal_note?: string | null
  created_at: string
  created_on?: string | null
}

export interface FeatureDetail extends FeatureCard {
  description?: string | null
  public_reason?: string | null
  history: HistoryEntry[]
  shipped_on?: string | null
  internal_note?: string | null
  ai_summary?: string | null
  module_key?: string | null
  feature_flag_key?: string | null
  spec_path?: string | null
  links: { label: string; url: string }[]
  requests: FeatureRequestRow[]
}

export interface FeatureRequestDetail extends FeatureRequestRow {
  allowed_actions: TriageAction[]
  similar: FeatureCard[]
  feature?: Pick<FeatureCard, 'id' | 'feature_no' | 'title' | 'phase' | 'reference' | 'phase_label'> | null
}

export interface TargetInput {
  from: string
  to?: string
  precision: Precision
}

// ── Aufrufe ─────────────────────────────────────────────────────────────────

const BASE = '/pwa/superadmin'

export function fetchFeatureRequests(params: {
  triage?: Triage | ''
  tenantId?: string
  area?: string
} = {}): Promise<{
  requests: FeatureRequestRow[]
  new_count: number
  tenants: { id: string; name: string }[]
  capped: boolean
}> {
  const q = new URLSearchParams()
  if (params.triage) q.set('triage', params.triage)
  if (params.tenantId) q.set('tenant_id', params.tenantId)
  if (params.area) q.set('area', params.area)
  const suffix = q.toString() ? `?${q}` : ''
  return apiFetch(`${BASE}/feature-requests${suffix}`)
}

export function fetchNewRequestCount(): Promise<{ count: number }> {
  return apiFetch(`${BASE}/feature-requests/new-count`)
}

export function fetchFeatureRequest(id: string): Promise<FeatureRequestDetail> {
  return apiFetch(`${BASE}/feature-requests/${id}`)
}

export function createOperatorRequest(body: {
  tenant_id: string
  account_id?: string
  created_by_name?: string
  source_channel?: Channel | ''
  created_on?: string
  title: string
  description: string
  problem?: string
  area: string
  importance: Importance
  feature_id?: string
}): Promise<FeatureRequestRow> {
  return apiFetch(`${BASE}/feature-requests`, { method: 'POST', body: JSON.stringify(body) })
}

export function updateFeatureRequest(id: string, body: { internal_note?: string; area?: string }) {
  return apiFetch(`${BASE}/feature-requests/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function triageFeatureRequest(id: string, body: {
  aktion: TriageAction
  feature_id?: string
  feature?: { title: string; area: string; description?: string }
  text?: string
  /** Satz an den Einreicher zustellen (Push + «Meine Wünsche»), Spec F11. */
  notify?: boolean
}) {
  return apiFetch(`${BASE}/feature-requests/${id}/triage`, { method: 'POST', body: JSON.stringify(body) })
}

export function assignFeatureRequests(ids: string[], featureId: string): Promise<{
  assigned: string[]
  failed: { id: string; detail: string }[]
}> {
  return apiFetch(`${BASE}/feature-requests/assign`, {
    method: 'POST', body: JSON.stringify({ ids, feature_id: featureId }),
  })
}

export function fetchFeatures(): Promise<{ features: FeatureCard[] }> {
  return apiFetch(`${BASE}/features`)
}

export function searchFeatures(q: string): Promise<{ features: FeatureCard[] }> {
  return apiFetch(`${BASE}/features/search?q=${encodeURIComponent(q)}`)
}

export function fetchFeature(id: string): Promise<FeatureDetail> {
  return apiFetch(`${BASE}/features/${id}`)
}

export function createFeature(body: {
  title: string
  area: string
  description?: string
  visibility?: 'oeffentlich' | 'intern'
  phase?: Phase
  on?: string
  public_reason?: string
  target?: TargetInput | null
}): Promise<FeatureCard> {
  return apiFetch(`${BASE}/features`, { method: 'POST', body: JSON.stringify(body) })
}

export function updateFeature(id: string, body: Partial<{
  title: string
  description: string | null
  area: string
  visibility: 'oeffentlich' | 'intern'
  internal_note: string | null
  ai_summary: string | null
  priority: number | null
  effort: string | null
  module_key: string | null
  feature_flag_key: string | null
  spec_path: string | null
  links: { label: string; url: string }[]
}>) {
  return apiFetch(`${BASE}/features/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

/**
 * Phase und/oder Ziel ändern. Eigene Route neben `updateFeature` (Spec §10.2):
 * nur sie darf benachrichtigen — ein Titel-Fix über `updateFeature` nie.
 * `target` weglassen = unverändert, `target: null` = entfernen.
 */
export function changeFeaturePhase(id: string, body: {
  phase?: Phase
  on?: string
  text?: string
  target?: TargetInput | null
  notify?: boolean
}): Promise<{ notify?: 'gesendet' | 'aus' | 'intern' }> {
  return apiFetch(`${BASE}/features/${id}/phase`, { method: 'POST', body: JSON.stringify(body) })
}

export function postFeatureUpdate(id: string, text: string, intern: boolean, notify = false) {
  return apiFetch(`${BASE}/features/${id}/update`, {
    method: 'POST', body: JSON.stringify({ text, intern, notify: notify && !intern }),
  })
}

export function fetchFeatureSummary(
  id: string, format: 'markdown' | 'text' = 'markdown',
): Promise<{ format: string; text: string }> {
  return apiFetch(`${BASE}/features/${id}/summary?format=${format}`)
}

/** Weiche Support → Wunsch (Spec §7.3). Schickt dem Melder nichts. */
export function supportTicketToFeatureRequest(ticketId: string): Promise<FeatureRequestRow & {
  reply_suggestion: string
}> {
  return apiFetch(`${BASE}/support-tickets/${ticketId}/to-feature-request`, {
    method: 'POST', body: JSON.stringify({}),
  })
}

// ── Paket 3: Auswertung, Export, Zusammenlegen, KI-Entwurf ─────────────────

export type Granularity = 'woche' | 'monat' | 'quartal'

export interface FeatureDashboard {
  window: { von: string; bis: string; granularitaet: Granularity; geklemmt: boolean }
  periods: { key: string; label: string; von: string; bis: string }[]
  total: number
  kacheln: {
    neu: number
    diese_woche: number
    vorwoche: number
    in_umsetzung: number
    im_test: number
    median_triage_tage: number | null
    median_triage_n: number
    fehlkanal_quote: number | null
    fehlkanal_n: number
    fehlkanal_basis: number
  }
  by_period: { key: string; label: string; anfrage: number; unterstuetzung: number }[]
  by_tenant: { tenant_id: string; name: string; count: number; accounts: number; per_account: number | null }[]
  matrix: { tenant_id: string; name: string; cells: number[]; total: number }[]
  matrix_text: string
  by_area: { key: string; label: string; count: number }[]
  top_features: {
    id: string; reference: string; title: string; phase: Phase; phase_label: string
    visibility?: FeatureCard['visibility']; tenants: number; requests: number
  }[]
  durchlauf: { phase: string; label: string; median_tage: number | null; n: number }[]
  durchlauf_features: number
}

function dashboardQuery(p: { von?: string; bis?: string; tenantId?: string; granularitaet?: Granularity }): string {
  const q = new URLSearchParams()
  if (p.von) q.set('von', p.von)
  if (p.bis) q.set('bis', p.bis)
  if (p.granularitaet) q.set('granularitaet', p.granularitaet)
  if (p.tenantId) q.set('tenant_id', p.tenantId)
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** Auswertung (Spec §8) — fertige Serien, der Client rechnet nichts nach. */
export function fetchFeatureDashboard(p: {
  von?: string; bis?: string; granularitaet: Granularity
}): Promise<FeatureDashboard> {
  return apiFetch(`${BASE}/feature-dashboard${dashboardQuery(p)}`)
}

/** CSV aller Anfragen im Zeitraum (Spec §7.6) — vollständig, ohne Ansichtsdeckel. */
export async function downloadFeatureRequestsCsv(p: { von?: string; bis?: string; tenantId?: string }) {
  const { blob, filename } = await apiBlobFetch(`${BASE}/feature-requests/export.csv${dashboardQuery(p)}`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : 'Feature-Anfragen.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** «In WF-… aufgehen lassen» (Spec §7.1): Anfragen wandern, das alte Feature
 *  wird «Nicht geplant — zusammengelegt mit WF-…». Benachrichtigt niemanden. */
export function mergeFeature(id: string, into: string): Promise<{
  ok: boolean; into: string; reference: string; moved: number; duplicates_removed: number
}> {
  return apiFetch(`${BASE}/features/${id}/merge`, { method: 'POST', body: JSON.stringify({ into }) })
}

/** KI-Entwurf der Zusammenfassung (Spec §7.5) — überschreibt `ai_summary`. */
export function generateFeatureAiSummary(id: string): Promise<{ ai_summary: string }> {
  return apiFetch(`${BASE}/features/${id}/summary/ai`, { method: 'POST', body: '{}' })
}

// ── Nutzerseite (Paket 2, Spec §5) ──────────────────────────────────────────
// Andere Endpunkte als oben: `/pwa/features/…` statt `/pwa/superadmin/…`. Was
// hier zurückkommt, hat der Server auf öffentliche Spalten und den eigenen
// Betrieb beschränkt — fremde Betriebe stehen nur als Zahl da (Spec F3).

export interface BoardCard {
  id: string
  feature_no: number
  reference: string
  title: string
  area: string
  phase: Phase
  phase_label: string
  phase_since: string
  target_from?: string | null
  target_to?: string | null
  target_precision?: Precision | null
  target_label: string
  public_reason?: string | null
  shipped_on?: string | null
  request_count: number
  tenant_count: number
  last_request_on?: string | null
  updated_at?: string | null
  /** Personen des EIGENEN Betriebs, die angefragt oder unterstützt haben. */
  own_count: number
  /** Andere Betriebe — nur als Zahl. */
  other_tenants: number
  /** Was dieses Konto beigetragen hat. */
  mine: 'anfrage' | 'unterstuetzung' | null
}

export interface PeerRow {
  feature_id?: string
  created_by_name?: string | null
  importance: Importance
  created_at: string
  created_on?: string | null
  origin: 'anfrage' | 'unterstuetzung'
  is_me: boolean
  /** Nur für Admin/Management — der Wortlaut der Kollegen. */
  title?: string | null
  description?: string | null
  problem?: string | null
}

export interface PublicFeatureDetail extends BoardCard {
  description?: string | null
  history: HistoryEntry[]
  from_our_tenant: PeerRow[]
}

export interface MyWish {
  id: string
  request_no: number
  reference: string
  feature_id?: string | null
  origin: 'anfrage' | 'unterstuetzung'
  title?: string | null
  description?: string | null
  problem?: string | null
  area?: string | null
  importance: Importance
  triage: Triage
  triage_label: string
  answer?: string | null
  created_at: string
  created_on?: string | null
  notified_at?: string | null
  read_at?: string | null
  created_by_name?: string | null
  created_by_role?: string | null
  feature?: {
    id: string
    reference: string
    title: string
    phase: Phase
    phase_label: string
    target_label: string
  } | null
}

export function fetchRoadmap(): Promise<{ features: BoardCard[] }> {
  return apiFetch('/pwa/features/board')
}

export function fetchRoadmapFeature(id: string): Promise<PublicFeatureDetail> {
  return apiFetch(`/pwa/features/${id}`)
}

export function searchSimilarFeatures(q: string): Promise<{ features: BoardCard[] }> {
  return apiFetch(`/pwa/features/similar?q=${encodeURIComponent(q)}`)
}

export function submitWish(body: {
  title: string
  description: string
  problem?: string
  area: string
  importance: Importance
  route?: string
  app_context?: 'pwa' | 'admin'
}): Promise<{ id: string; request_no: number; reference: string; created_at: string }> {
  return apiFetch('/pwa/features/requests', { method: 'POST', body: JSON.stringify(body) })
}

export function withdrawWish(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/pwa/features/requests/${id}`, { method: 'DELETE' })
}

export function supportFeatureWish(id: string, body: {
  text?: string
  importance?: Importance
  app_context?: 'pwa' | 'admin'
} = {}): Promise<{ ok: boolean; already: boolean }> {
  return apiFetch(`/pwa/features/${id}/support`, { method: 'POST', body: JSON.stringify(body) })
}

export function withdrawFeatureSupport(id: string): Promise<{ ok: boolean; removed: number }> {
  return apiFetch(`/pwa/features/${id}/support`, { method: 'DELETE' })
}

export function fetchMyWishes(): Promise<{ requests: MyWish[]; unread: number }> {
  return apiFetch('/pwa/features/requests/mine')
}

export function markWishesRead(): Promise<{ ok: boolean }> {
  return apiFetch('/pwa/features/requests/mine/read', { method: 'POST', body: '{}' })
}

export function fetchTenantWishes(): Promise<{ requests: MyWish[] }> {
  return apiFetch('/pwa/features/requests/tenant')
}

/** Diktat fürs Wunsch-Formular — dieselbe Mechanik wie `transcribeSupportAudio`. */
export async function transcribeWishAudio(blob: Blob): Promise<string> {
  const form = new FormData()
  form.append('audio', blob, 'aufnahme.webm')
  const res = await apiFormFetch<{ text?: string }>('/pwa/features/transcribe', form)
  return (res?.text || '').trim()
}

/**
 * Vorbelegung des Bereichs aus dem aktuellen Screen (Spec §5.7). Unbekannte
 * Routen belegen NICHTS vor — nie still «Sonstiges», sonst landet jeder Wunsch
 * aus einem neuen Screen dort, ohne dass jemand es gewählt hat.
 */
export const ROUTE_AREA: Record<string, string> = {
  // Mitarbeiter-PWA
  arbeitszeit: 'zeiterfassung',
  absenzen: 'personal',
  bericht: 'zeiterfassung',
  rapport: 'rapporte',
  rapportOffline: 'rapporte',
  projekte: 'projekte',
  offerten: 'offerten',
  projektEntwurf: 'projekte',
  inventur: 'material',
  // Admin
  'my-time': 'zeiterfassung',
  'bulk-clockin': 'zeiterfassung',
  corrections: 'zeiterfassung',
  absences: 'personal',
  vacation: 'personal',
  'hr-reports': 'personal',
  staff: 'personal',
  'staff-roles': 'personal',
  tasks: 'projekte',
  projects: 'projekte',
  'project-drafts': 'projekte',
  'project-schedule': 'einsatzplanung',
  customers: 'kunden',
  aftersales: 'kunden',
  quotes: 'offerten',
  'quote-templates': 'offerten',
  invoices: 'rechnungen',
  'payment-reconciliation': 'rechnungen',
  materials: 'material',
  suppliers: 'material',
  'supplier-wiki': 'hilfe',
  kpis: 'auswertungen',
}

export function areaForRoute(route?: string | null): string {
  return (route && ROUTE_AREA[route]) || ''
}

/** Seit wann steht die Karte in ihrer Phase — «seit 12 Tagen» / «seit KW 38». */
export function sinceLabel(phaseSince?: string | null, now: Date = new Date()): string {
  const d = parseDay(phaseSince)
  if (!d) return ''
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today.getTime() - d.getTime()) / 86400000)
  if (days <= 0) return 'seit heute'
  if (days === 1) return 'seit gestern'
  if (days < 21) return `seit ${days} Tagen`
  const w = isoWeek(d)
  return w.year === today.getFullYear() ? `seit KW ${w.week}` : `seit KW ${w.week} ${w.year}`
}

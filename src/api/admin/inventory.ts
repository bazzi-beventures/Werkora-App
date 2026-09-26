// Lagerbestand: Bewegungen buchen und nachlesen (Modul `inventory`).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiBlobFetch, apiFetch } from '../client'

/**
 * Bewegungsarten, die von Hand buchbar sind.
 *
 * Bis 20260919 stand hier `'adjustment' | 'purchase' | 'consumption' | 'return'`
 * — vier Werte, von denen die Datenbank keinen einzigen kannte (ihre
 * CHECK-Constraint erlaubte `usage/delivery/correction/initial`). Der Server
 * prüfte den Insert nicht: der Bestand änderte sich, die Bewegung ging mit
 * HTTP 400 verloren, die Antwort war trotzdem erfolgreich. Jede Korrektur aus
 * der Maske war damit unbelegt. Diese Liste ist jetzt die Teilmenge der
 * DB-Werte, die ein Mensch buchen darf: `usage` entsteht ausschliesslich am
 * Rapport, `count` an der Inventur, `initial` beim Import.
 */
export type StockMovementType = 'delivery' | 'correction' | 'return'

/** Alle Arten, die im Journal auftauchen können — auch die nicht buchbaren. */
export type StockMovementKind = StockMovementType | 'usage' | 'count' | 'initial'

export interface StockMovementReference {
  kind: 'report' | 'delivery' | 'count' | 'draft' | 'sonstige'
  id: string
  label: string
}

export interface StockMovement {
  id: string
  created_at: string
  movement_type: StockMovementKind
  movement_label: string
  quantity_delta: number
  /** Bestand nach dieser Buchung. `null` bei Bewegungen von vor dem 19.09.2026
   *  — für die ist er nicht rekonstruierbar, die Maske zeigt dort «—». */
  balance_after: number | null
  note: string | null
  created_by: string | null
  reference: StockMovementReference | null
}

export interface StockMovementsResponse {
  rows: StockMovement[]
  total: number
  page: number
  page_size: number
}

export interface AdjustStockResult {
  status: string
  /** Neuer Bestand, vom DB-Trigger gesetzt. */
  new_quantity: number | null
}

/**
 * Bucht eine Bestandsänderung. `quantityDelta` ist die DIFFERENZ, nicht der neue
 * Bestand: der Server schreibt die Bewegung, und der Bestand folgt ihr. So bleibt
 * die Historie nachvollziehbar, und zwei gleichzeitige Korrekturen überschreiben
 * sich nicht gegenseitig (die Buchung ist seit Lager v2 atomar in der Datenbank).
 *
 * `note` ist bei `correction` Pflicht — ohne Begründung steht beim nächsten
 * Zählen eine Differenz da, die niemand mehr erklären kann. Der Server lehnt
 * sie sonst mit 400 ab.
 */
export async function adjustStock(
  artNr: string,
  quantityDelta: number,
  opts: { movementType?: StockMovementType; note?: string | null } = {},
): Promise<AdjustStockResult> {
  return apiFetch<AdjustStockResult>('/pwa/admin/inventory/adjust', {
    method: 'POST',
    body: JSON.stringify({
      art_nr: artNr,
      quantity_delta: quantityDelta,
      movement_type: opts.movementType ?? 'correction',
      note: opts.note ?? null,
    }),
  })
}

/** Bewegungsjournal eines Artikels, neueste Buchung zuerst. */
export async function listStockMovements(
  artNr: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<StockMovementsResponse> {
  const params = new URLSearchParams({
    page: String(opts.page ?? 1),
    page_size: String(opts.pageSize ?? 20),
  })
  return apiFetch<StockMovementsResponse>(
    `/pwa/admin/inventory/${encodeURIComponent(artNr)}/movements?${params.toString()}`,
  )
}

// ─── Bestandsübersicht, Lieferung, Bestellvorschläge (Lager v2, Phase 2) ───

export type ReorderState = 'ok' | 'unter_meldebestand' | 'bestellt'

export interface StockOverviewRow {
  material_id: string
  art_nr: string
  name: string
  kategorie: string | null
  lieferant: string | null
  lieferant_id: string | null
  lieferant_art_nr: string | null
  unit: string | null
  ist_aktiv: boolean
  quantity: number
  min_quantity: number
  reorder_quantity: number | null
  reorder_state: ReorderState
  reorder_state_since: string | null
  last_counted_at: string | null
  einkaufspreis: number | null
  lagerwert: number | null
  verbrauch_30_tage: number
  /** Für wie viele Tage der Bestand beim aktuellen Verbrauch reicht.
   *  `null` bei Verbrauch 0 — ein Artikel ohne Verbrauch hat keine Reichweite,
   *  und jede Zahl wäre eine Aussage über eine Zukunft ohne Anhaltspunkt. */
  reichweite_tage: number | null
  bestellvorschlag: number
}

export interface StockOverviewResponse {
  rows: StockOverviewRow[]
  summary: {
    unter_meldebestand: number
    bestellt: number
    negativ: number
    lagerwert_ek: number
  }
}

export interface ReorderDraftItem {
  material_id: string
  art_nr: string
  name: string
  unit: string | null
  qty: number
  qty_suggested: number
  lieferant_art_nr?: string | null
}

export interface ReorderDraft {
  id: string
  supplier_id: string | null
  status: 'entwurf' | 'gesendet' | 'verworfen'
  items: ReorderDraftItem[]
  subject: string
  body: string
  body_edited: boolean
  /** `null` = beim Lieferanten ist keine Adresse hinterlegt; dann bleibt nur
   *  «als gesendet markieren», nachdem anders bestellt wurde. */
  to_email: string | null
  created_at: string
  sent_at: string | null
  sent_by: string | null
}

export async function getStockOverview(
  opts: { state?: string; category?: string; supplierId?: string; search?: string } = {},
): Promise<StockOverviewResponse> {
  const params = new URLSearchParams()
  if (opts.state) params.set('state', opts.state)
  if (opts.category) params.set('category', opts.category)
  if (opts.supplierId) params.set('supplier_id', opts.supplierId)
  if (opts.search) params.set('search', opts.search)
  const q = params.toString()
  return apiFetch<StockOverviewResponse>(`/pwa/admin/inventory/overview${q ? `?${q}` : ''}`)
}

export interface DeliveryResult {
  status: 'ok' | 'partial'
  booked: number
  rows: { art_nr: string; qty: number; status: string; new_quantity: number | null; message?: string }[]
}

/** Bucht einen Wareneingang. Artikel, die als «bestellt» galten, wechseln damit
 *  zurück auf «OK» — das entscheidet die Datenbank, nicht diese Maske. */
export async function bookDelivery(input: {
  supplier_id?: string | null
  lieferschein_nr?: string | null
  lieferant_name?: string | null
  items: { art_nr: string; qty: number }[]
}): Promise<DeliveryResult> {
  return apiFetch<DeliveryResult>('/pwa/admin/inventory/deliveries', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function listReorderDrafts(status = 'entwurf'): Promise<{ rows: ReorderDraft[] }> {
  return apiFetch<{ rows: ReorderDraft[] }>(
    `/pwa/admin/inventory/reorder-drafts?status=${encodeURIComponent(status)}`,
  )
}

export async function generateReorderDrafts(): Promise<{ status: string; drafts: number; positionen: number }> {
  return apiFetch('/pwa/admin/inventory/reorder-drafts/generate', { method: 'POST' })
}

export async function updateReorderDraft(
  id: string,
  patch: { subject?: string; body?: string; items?: ReorderDraftItem[] },
): Promise<void> {
  await apiFetch(`/pwa/admin/inventory/reorder-drafts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/** `markOnly` für den Fall, dass anders bestellt wurde (Telefon, Webshop):
 *  die Artikel gelten als bestellt, es geht keine Mail raus. */
export async function sendReorderDraft(id: string, markOnly = false): Promise<void> {
  await apiFetch(
    `/pwa/admin/inventory/reorder-drafts/${encodeURIComponent(id)}/send${markOnly ? '?mark_only=true' : ''}`,
    { method: 'POST' },
  )
}

export async function discardReorderDraft(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/inventory/reorder-drafts/${encodeURIComponent(id)}/discard`, {
    method: 'POST',
  })
}

// ─── Inventur (Lager v2, Phase 3) ───────────────────────────
//
// Das Zählen selbst liegt in `api/inventory.ts`: Ein Inventurmanager ohne
// Admin-Rolle zählt in der Monteur-PWA, und die darf nicht aus dem
// Admin-Barrel importieren (docs/specs/rollierende-inventur.md §10.5). Hier
// stehen die Aufrufe, die wirklich Admin-Sache bleiben — Anlegen, Liste,
// Export, Zählpläne — und die Re-Exporte, damit bestehende Importe gültig
// bleiben.

export {
  abortStockCount, closeStockCount, getStockCount, listMyStockCounts, recordCountItem,
} from '../inventory'
export type {
  CountKind, CountStatus, CountSummary, StockCount, StockCountDetail, StockCountItem,
} from '../inventory'

// Für die eigenen Signaturen unten — `export … from` legt keine lokale Bindung an.
import type { CountKind, StockCount } from '../inventory'

// ─── Rollierende Inventur: Zählpläne ────────────────────────
//
// Die Pläne liegen im Reiter Inventur und nicht in der Superadmin-Konfiguration:
// «20 Artikel pro Woche» ist eine Betriebsgrösse, die der Mandant nachstellt,
// wenn er nach vier Wochen sieht, dass sie nicht passt
// (docs/specs/rollierende-inventur.md E1).

export type CountPeriod = 'tag' | 'woche' | 'monat'

export interface CountPlan {
  id: string
  active: boolean
  per_period: number
  period: CountPeriod
  weekday: number
  day_of_month: number
  /** `null` = alle Kategorien, die kein anderer aktiver Plan abdeckt. */
  category: string | null
  manager_user_id: string
  manager_name: string | null
  /** Konto deaktiviert oder entzogen: Der Nachtlauf überspringt den Plan, und
   *  die Karte muss das sagen — sonst wartet der Betrieb auf Tranchen, die nicht
   *  kommen. */
  manager_fehlt: boolean
  last_generated_on: string | null
  /** Aktive Artikel, die dieser Plan abdeckt. */
  artikel: number
  /** «Bei 20 Artikeln pro Woche ist jeder Artikel etwa alle 13 Wochen dran.» */
  zyklus: string
  naechste_tranche: string
  offene_tranche: {
    count_id: string
    title: string | null
    due_on: string | null
    progress: { gezaehlt?: number; gesamt?: number }
    ueberfaellig: boolean
  } | null
}

export interface CountPlansResponse {
  plans: CountPlan[]
  /** Kategorien, für die sich noch ein eigener Plan anlegen lässt. */
  kategorien_ohne_plan: string[]
  sammelplan_vorhanden: boolean
}

export interface CountPlanInput {
  active: boolean
  per_period: number
  period: CountPeriod
  weekday?: number
  day_of_month?: number
  category?: string | null
  manager_user_id: string
}

/** Was mit einer noch offenen Tranche geschehen soll (Spec E4). */
export type OpenTrancheChoice = 'abort' | 'carry'

export async function listCountPlans(): Promise<CountPlansResponse> {
  return apiFetch<CountPlansResponse>('/pwa/admin/inventory/count-plans')
}

export async function saveCountPlan(
  input: CountPlanInput, planId?: string,
): Promise<{ plan: CountPlan }> {
  return apiFetch<{ plan: CountPlan }>(
    planId
      ? `/pwa/admin/inventory/count-plans/${encodeURIComponent(planId)}`
      : '/pwa/admin/inventory/count-plans',
    { method: planId ? 'PATCH' : 'POST', body: JSON.stringify(input) },
  )
}

export async function deleteCountPlan(planId: string): Promise<void> {
  await apiFetch(`/pwa/admin/inventory/count-plans/${encodeURIComponent(planId)}`, {
    method: 'DELETE',
  })
}

/**
 * «Jetzt zählen» — legt die nächste Tranche an.
 *
 * Läuft noch eine, antwortet der Server mit 409 und dem Code `open_tranche`,
 * statt selbst zu entscheiden: Abbrechen verwirft gezählte Mengen, Übernehmen
 * bucht sie. Beides gehört dem Menschen, der gezählt hat.
 */
export async function runCountPlan(
  planId: string, openTranche?: OpenTrancheChoice,
): Promise<{ count: StockCount; positionen: number; carried?: number }> {
  return apiFetch<{ count: StockCount; positionen: number; carried?: number }>(
    `/pwa/admin/inventory/count-plans/${encodeURIComponent(planId)}/run`,
    { method: 'POST', body: JSON.stringify({ open_tranche: openTranche ?? null }) },
  )
}

export async function listStockCounts(status = '', kind = ''): Promise<{ rows: StockCount[] }> {
  const p = new URLSearchParams()
  if (status) p.set('status', status)
  if (kind) p.set('kind', kind)
  const q = p.toString()
  return apiFetch<{ rows: StockCount[] }>(`/pwa/admin/inventory/counts${q ? `?${q}` : ''}`)
}

export async function createStockCount(input: {
  kind: CountKind
  title?: string | null
  category?: string | null
  material_ids?: string[]
  /** Der Weg von der Befundliste zur Zählung: «diese drei Artikel nachzählen».
   *  Der Server löst die Artikel auf, damit die Maske nicht zwei Listen
   *  zusammenführen muss. */
  anomaly_ids?: string[]
}): Promise<{ status: string; count: StockCount; positionen: number }> {
  return apiFetch('/pwa/admin/inventory/counts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Lädt die CSV der Zählung herunter — die Datei, die zum Treuhänder geht. */
export async function downloadStockCountCsv(id: string): Promise<void> {
  const { blob, filename } = await apiBlobFetch(
    `/pwa/admin/inventory/counts/${encodeURIComponent(id)}/export`,
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ─── Auffälligkeiten (Lager v2, Phase 4) ────────────────────

export type AnomalyKind = 'negativ' | 'ausreisser' | 'ladenhueter' | 'drift' | 'nachzaehlen'
export type AnomalySeverity = 'hoch' | 'mittel' | 'niedrig'

export interface StockAnomaly {
  id: string
  material_id: string
  art_nr: string | null
  name: string | null
  unit: string | null
  kind: AnomalyKind
  severity: AnomalySeverity
  /** Kind-spezifische Zahlen (Schwelle, Tageswert, Lagerwert …). */
  detail: Record<string, unknown>
  detected_at: string
  count_id: string | null
  /** Ein Satz, der sagt, was zu tun ist — vom Server, damit Mail und
   *  Oberfläche dieselbe Empfehlung geben. */
  text: string
}

export async function listAnomalies(
  opts: { kind?: AnomalyKind; severity?: AnomalySeverity } = {},
): Promise<{ rows: StockAnomaly[]; summary: { hoch: number; gesamt: number } }> {
  const params = new URLSearchParams()
  if (opts.kind) params.set('kind', opts.kind)
  if (opts.severity) params.set('severity', opts.severity)
  const q = params.toString()
  return apiFetch(`/pwa/admin/inventory/anomalies${q ? `?${q}` : ''}`)
}

/** Legt einen Befund still. Er kommt frühestens in einem Monat wieder; die
 *  Begründung ist Pflicht und steht später am Befund. */
export async function ignoreAnomaly(id: string, note: string): Promise<void> {
  await apiFetch(`/pwa/admin/inventory/anomalies/${encodeURIComponent(id)}/ignore`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

// ─── Zählstand nach Kategorie (Rollierende Inventur, R3) ────
//
// Die Antwort kommt als Ganzes und wird im Browser gefiltert — wie
// `LagerOverview`. Die Tabelle hat Dutzende Zeilen, nicht Tausende, und jede
// Filterrunde über den Server wäre eine Wartezeit für eine Antwort, die
// schon da ist.

export interface CoverageRow {
  kategorie: string
  artikel: number
  nie_gezaehlt: number
  aelter_als_fenster: number
  in_offener_zaehlung: number
  gezaehlt_im_fenster: number
  /** Anteil der Artikel mit einer Zählung im Fenster. `null` ohne Artikel —
   *  eine 0 läse sich als «nichts gezählt». */
  abdeckung_pct: number | null
  /** Ältester Zählstand der Kategorie; `null`, wenn nie gezählt wurde. */
  aeltester: string | null
  /** Lagerwert (EK) der Artikel ausserhalb des Fensters — die Zahl, die aus
   *  «ungezählt» ein Risiko macht. */
  lagerwert_ungezaehlt: number
  /** Plan, der diese Kategorie abdeckt (eigener Plan oder Sammelplan). */
  plan_id: string | null
  eigener_plan: boolean
}

export interface CoverageArticle {
  material_id: string
  art_nr: string
  name: string
  kategorie: string | null
  unit: string | null
  quantity: number
  lagerwert: number | null
  last_counted_at: string | null
  in_offener_zaehlung: boolean
}

export interface CountCoverage {
  kategorien: CoverageRow[]
  gesamt: Omit<CoverageRow, 'kategorie' | 'plan_id' | 'eigener_plan'>
  /** 365, und nicht einstellbar: Es ist die Frage des Treuhänders. */
  fenster_tage: number
  /** Aktive Artikel, «am längsten her zuerst». */
  artikel: CoverageArticle[]
}

export async function getCountCoverage(): Promise<CountCoverage> {
  return apiFetch<CountCoverage>('/pwa/admin/inventory/count-coverage')
}

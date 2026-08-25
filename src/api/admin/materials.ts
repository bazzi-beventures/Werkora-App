// Material: Stammdaten, häufig benutzte Ersatzteile, Datenbereinigung,
// Massen-VK-Erhöhung.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch, apiFormFetch } from '../client'

// ─── Materialstamm ──────────────────────────────────────────

export interface Material {
  id: string
  art_nr: string
  name: string
  supplier_id: string | null
  category: string | null
  unit: string | null
  unit_price: number | null   // fixer VK-Override (nur noch Fallback ohne EK)
  cost_price: number | null   // EK (Einkaufspreis)
  markup_pct: number | null   // Per-Artikel-Aufschlag % auf EK (null = Lieferanten-Default)
  calc_vk: number | null      // berechneter VK (EK x Aufschlag bzw. Override)
  is_active: boolean
  image_path: string | null   // Objektpfad im privaten Bucket (nur intern)
  image_url?: string | null   // transient: frisch signierte URL zum Anzeigen
  inventory: { quantity: number; min_quantity: number | null }[]
}

export interface MaterialsListResponse {
  rows: Material[]
  total: number
  page: number
  page_size: number
}

// Dropdown-Inhalte und die nächste freie Artikelnummer — nicht aus der
// paginierten Liste ableitbar, deshalb ein eigener Endpoint.
export interface MaterialsMeta {
  categories: string[]
  units: string[]
  next_art_nr: string
}

export type MaterialSortKey = 'art_nr' | 'name' | 'category' | 'unit' | 'cost_price'

export interface MaterialsListQuery {
  sort: MaterialSortKey
  dir: 'asc' | 'desc'
  page: number
  pageSize: number
  search?: string
  category?: string
  supplierId?: string
}

// Was POST/PATCH schickt. `unit_price` und `markup_pct` hängen zusammen: mit EK
// ist der Aufschlag die Quelle der Wahrheit (VK folgt der Teuerung), ohne EK wird
// der Ziel-VK als fixer unit_price gespeichert — die Umrechnung macht der
// Aufrufer, hier steht nur der Vertrag.
export interface MaterialInput {
  art_nr: string
  name: string
  category: string | null
  unit: string | null
  unit_price: number
  cost_price: number | null
  markup_pct: number | null
  supplier_id: string | null
}

export async function listMaterials(q: MaterialsListQuery): Promise<MaterialsListResponse> {
  const params = new URLSearchParams({
    sort: q.sort,
    dir: q.dir,
    page: String(q.page),
    page_size: String(q.pageSize),
  })
  if (q.search) params.set('search', q.search)
  if (q.category) params.set('category', q.category)
  if (q.supplierId) params.set('supplier_id', q.supplierId)
  return apiFetch<MaterialsListResponse>(`/pwa/admin/materials/list?${params.toString()}`)
}

/** `includeInactive` nimmt auch Kategorien stillgelegter Artikel mit (Datenbereinigung). */
export async function getMaterialsMeta(opts: { includeInactive?: boolean } = {}): Promise<MaterialsMeta> {
  return apiFetch<MaterialsMeta>(
    `/pwa/admin/materials/meta${opts.includeInactive ? '?include_inactive=1' : ''}`,
  )
}

/**
 * Alle Materialien in einem Zug (ohne Pagination) — für Auswahllisten und
 * Bereinigungs-Werkzeuge. Die Tabelle nutzt `listMaterials`, sonst käme bei
 * mehreren tausend Artikeln alles auf einmal in den Browser.
 */
export async function listAllMaterials(): Promise<Material[]> {
  return apiFetch<Material[]>('/pwa/admin/materials')
}

/** Ohne `artNr` anlegen, mit `artNr` den bestehenden Artikel ändern. */
export async function saveMaterial(input: MaterialInput, artNr?: string): Promise<void> {
  await apiFetch(artNr ? `/pwa/admin/materials/${encodeURIComponent(artNr)}` : '/pwa/admin/materials', {
    method: artNr ? 'PATCH' : 'POST',
    body: JSON.stringify(input),
  })
}

export async function uploadMaterialImage(artNr: string, file: File): Promise<void> {
  const fd = new FormData()
  fd.append('file', file)
  await apiFormFetch(`/pwa/admin/materials/${encodeURIComponent(artNr)}/image`, fd)
}

export async function deleteMaterialImage(artNr: string): Promise<void> {
  await apiFetch(`/pwa/admin/materials/${encodeURIComponent(artNr)}/image`, { method: 'DELETE' })
}

export interface FrequentMaterial {
  id: string            // frequent_materials.id (für remove/reorder)
  sort_order: number
  material_id: string
  art_nr: string
  name: string
  unit: string
  category?: string | null
  is_active: boolean
  calc_vk: number
}

export async function getFrequentMaterials(): Promise<FrequentMaterial[]> {
  return apiFetch<FrequentMaterial[]>('/pwa/admin/frequent-materials')
}

export async function addFrequentMaterial(artNr: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/pwa/admin/frequent-materials', {
    method: 'POST',
    body: JSON.stringify({ art_nr: artNr }),
  })
}

export async function removeFrequentMaterial(id: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/pwa/admin/frequent-materials/${id}`, { method: 'DELETE' })
}

export async function reorderFrequentMaterials(orderedIds: string[]): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/pwa/admin/frequent-materials/order', {
    method: 'PUT',
    body: JSON.stringify({ ordered_ids: orderedIds }),
  })
}

// ─── Materialdatenbereinigung (superadmin-only) ─────────────────────
// Setzt Artikel auf Aktiv ↔ Löschvormerkung (is_active). NIE Hard-Delete —
// nur Soft-Flag, jederzeit reversibel.

export type MaterialSzenario =
  | 'RECENTLY_USED' | 'QUOTED_AND_BILLED' | 'STALE_USED' | 'RAPPORT_MATERIAL'
  | 'USED_PENDING' | 'QUOTE_ONLY_OLD' | 'QUOTE_ONLY_NEW' | 'NEVER_USED_OLD' | 'NEVER_USED_NEW'

export interface MaterialCleanupRow {
  art_nr: string
  name: string
  category: string | null
  supplier_id: string | null
  is_active: boolean
  created_at: string | null
  szenario: MaterialSzenario
  in_quote: boolean
  in_invoice: boolean
  last_usage_date: string | null
  age_days: number | null
  dq_no_supplier: boolean
  dq_no_price: boolean
}

export interface MaterialCleanupScan {
  counts: Partial<Record<MaterialSzenario, number>>
  total: number          // Artikel im gesamten Filter (Summe der counts)
  row_total: number      // Zeilen in der aktuellen Ansicht (nach szenario-Filter)
  rows: MaterialCleanupRow[]  // aktuelle Seite
  page: number
  page_size: number
  total_pages: number
  blocked: MaterialSzenario[]
}

export interface BulkMaterialStatusResult {
  updated: number
  skipped_blocked: number
}

export async function scanMaterialCleanup(
  p: {
    category?: string; supplier_id?: string; status?: string; szenario?: string
    page?: number; page_size?: number
  } = {},
): Promise<MaterialCleanupScan> {
  const params = new URLSearchParams()
  if (p.category) params.set('category', p.category)
  if (p.supplier_id) params.set('supplier_id', p.supplier_id)
  if (p.status) params.set('status', p.status)
  if (p.szenario) params.set('szenario', p.szenario)
  if (p.page) params.set('page', String(p.page))
  if (p.page_size) params.set('page_size', String(p.page_size))
  const qs = params.toString()
  return apiFetch<MaterialCleanupScan>(`/pwa/admin/material-cleanup/scan${qs ? `?${qs}` : ''}`)
}

export async function bulkSetMaterialStatus(
  artNrs: string[], isActive: boolean,
): Promise<BulkMaterialStatusResult> {
  return apiFetch<BulkMaterialStatusResult>('/pwa/admin/material-cleanup/bulk-status', {
    method: 'POST',
    body: JSON.stringify({ art_nrs: artNrs, is_active: isActive }),
  })
}

// Filter-Modus: wirkt auf ALLE Artikel des Filters (alle Seiten) — die
// Ziel-Liste entsteht server-seitig aus denselben Filtern wie die Ansicht.
export async function bulkSetMaterialStatusAll(
  filter: { category?: string; supplier_id?: string; status?: string; szenario?: string },
  isActive: boolean,
): Promise<BulkMaterialStatusResult> {
  return apiFetch<BulkMaterialStatusResult>('/pwa/admin/material-cleanup/bulk-status', {
    method: 'POST',
    body: JSON.stringify({ all_filtered: true, is_active: isActive, ...filter }),
  })
}

// ─── Massen-VK-Erhöhung (eigene Materialien ohne Lieferant) ──────
export type VkBulkMode = 'markup' | 'fixed' | 'skip'

export interface VkBulkRow {
  art_nr: string
  name: string
  category: string | null
  cost_price: number | null   // EK
  old_vk: number              // aktueller VK
  new_vk: number              // VK nach Anhebung (bei mode='skip' == old_vk)
  mode: VkBulkMode            // markup = Aufschlag anheben, fixed = Fixpreis, skip = ohne Preis
  skip_reason: string | null
}

export interface VkBulkPreview {
  rows: VkBulkRow[]
  total: number
  applicable: number   // anhebbare Artikel (mode != skip)
  skipped: number      // preislose Artikel
  pct: number
}

export interface VkBulkApplyResult {
  updated: number
  skipped: number
}

export async function previewVkBulkIncrease(
  pct: number, category = '',
): Promise<VkBulkPreview> {
  const params = new URLSearchParams({ pct: String(pct) })
  if (category) params.set('category', category)
  return apiFetch<VkBulkPreview>(`/pwa/admin/materials/vk-bulk/preview?${params.toString()}`)
}

export async function applyVkBulkIncrease(
  pct: number,
  target: { artNrs: string[] } | { allApplicable: true; category?: string },
): Promise<VkBulkApplyResult> {
  const body = 'artNrs' in target
    ? { pct, art_nrs: target.artNrs }
    : { pct, all_applicable: true, category: target.category ?? '' }
  return apiFetch<VkBulkApplyResult>('/pwa/admin/materials/vk-bulk/apply', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

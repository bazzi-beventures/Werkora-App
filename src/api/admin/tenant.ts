// Mandanten-Konfiguration: Module, Fahrtkosten-Tabelle, Einsatzplanung-Anzeige, Feature-Flags.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'
import { SK } from '../storageKeys'

export interface TenantModulesResponse {
  enabled_modules: string[]
  known_modules: string[]
  dependencies: Record<string, string[]>
}

export async function getTenantModules(): Promise<TenantModulesResponse> {
  return apiFetch<TenantModulesResponse>('/pwa/admin/tenant/modules')
}

export async function updateTenantModules(modules: string[]): Promise<{ enabled_modules: string[] }> {
  return apiFetch<{ enabled_modules: string[] }>('/pwa/admin/tenant/modules', {
    method: 'PATCH',
    body: JSON.stringify({ enabled_modules: modules }),
  })
}

// ─── Tenant Fahrtkosten-Tabelle ─────────────────────────────

// Eine Zeile der Staffelung: [km-Schwelle, CHF]. null in der km-Schwelle = „und darüber"
// (nur im default_table vom Backend; eigene Tabellen brauchen keine null-Zeile).
export type TravelCostRow = [number | null, number]

export interface TenantTravelCostResponse {
  travel_cost_table: TravelCostRow[] | null  // null = Mandant nutzt System-Default
  default_table: TravelCostRow[]
}

export async function getTenantTravelCost(): Promise<TenantTravelCostResponse> {
  return apiFetch<TenantTravelCostResponse>('/pwa/admin/tenant/travel-cost')
}

export async function updateTenantTravelCost(
  table: TravelCostRow[] | null,
): Promise<{ travel_cost_table: TravelCostRow[] | null }> {
  return apiFetch<{ travel_cost_table: TravelCostRow[] | null }>('/pwa/admin/tenant/travel-cost', {
    method: 'PATCH',
    body: JSON.stringify({ travel_cost_table: table }),
  })
}

// ─── Tenant Einsatzplanung-Anzeige ──────────────────────────

// Bekannte Einsatz-Arten (kind) — Reihenfolge = Anzeige-Reihenfolge im Konfig-Tab.
export const SCHEDULING_KINDS = [
  { key: 'project', label: 'Kundenprojekt' },
  { key: 'teamsitzung', label: 'Teamsitzung' },
  { key: 'lagerarbeit', label: 'Lagerarbeit' },
  { key: 'werkstatt', label: 'Werkstatt' },
  { key: 'weiterbildung', label: 'Weiterbildung' },
  { key: 'reservation', label: 'Mitarbeiter-Reservation' },
  { key: 'blocker', label: 'Blocker (provisorisch)' },
  { key: 'sonstiges', label: 'Sonstiges' },
] as const

// Optionale Anzeige-Felder auf den Kalender-Kacheln.
export const SCHEDULING_FIELDS = [
  { key: 'address', label: 'Adresse (Objekt)' },
  { key: 'projektleiter', label: 'Projektleiter' },
  { key: 'customer', label: 'Kunde' },
  { key: 'bemerkung', label: 'Bemerkung' },
] as const

// Kalender-Ansichten der Einsatzplanung, pro Mandant an-/abschaltbar.
// Gespiegelt in db/tenants.py (SCHEDULING_VIEWS).
export const SCHEDULING_VIEWS = [
  { key: 'month', label: 'Monat' },
  { key: 'week', label: 'Woche' },
  { key: 'staff', label: 'Mitarbeiter' },
  { key: 'plantafel', label: 'Plantafel' },
  { key: 'gantt', label: 'Tagesplan' },
  { key: 'map', label: 'Karte' },
] as const

export type SchedulingViewKey = (typeof SCHEDULING_VIEWS)[number]['key']

export interface SchedulingConfig {
  fields: Record<string, boolean>
  colors: Record<string, string>
  // Sichtbare Kalender-Ansichten; fehlender Key = Ansicht an (Default).
  views?: Record<string, boolean>
  // Fahrdistanzen zwischen Einsätzen in der Plantafel anzeigen (Default an).
  show_distances?: boolean
  // Nicht-Arbeitszeit-Fenster im Wochen-Zeitraster (Werktage Mo–Fr, rein visuell).
  // grey_after = Fenster-Start 'HH:MM' ('' = aus), grey_until = Fenster-Ende 'HH:MM'
  // ('' = bis Rasterende/Feierabend). Blockiert das Planen nicht.
  grey_after?: string
  grey_until?: string
  // Arbeitsstunden je Werktag — Bezugsgrösse des Auslastungsgrads im Tagesplan.
  day_capacity_hours?: number
}

export interface TenantSchedulingResponse {
  config: Partial<SchedulingConfig>  // {} = Mandant nutzt System-Default
  defaults: SchedulingConfig
}

export async function getSchedulingConfig(): Promise<TenantSchedulingResponse> {
  return apiFetch<TenantSchedulingResponse>('/pwa/admin/tenant/scheduling')
}

export async function updateSchedulingConfig(
  config: SchedulingConfig,
): Promise<{ config: SchedulingConfig }> {
  const res = await apiFetch<{ config: SchedulingConfig }>('/pwa/admin/tenant/scheduling', {
    method: 'PATCH',
    body: JSON.stringify({ config }),
  })
  // Der Cache trägt die alte Ansichtsliste — nach dem Speichern wäre er falsch.
  // Verwerfen statt überschreiben: die neuen Defaults kennt nur die GET-Antwort.
  clearCachedSchedulingConfig()
  return res
}

// Mandanten-Override über die System-Defaults legen. Fehlende Keys erben den
// Default — deshalb pro Feld mergen und nicht das ganze Objekt ersetzen.
function mergeSchedulingConfig(
  res: TenantSchedulingResponse,
): SchedulingConfig {
  const { config: cfg, defaults: def } = res
  return {
    fields: { ...def.fields, ...(cfg.fields || {}) },
    colors: { ...def.colors, ...(cfg.colors || {}) },
    views: { ...(def.views || {}), ...(cfg.views || {}) },
    show_distances: cfg.show_distances ?? def.show_distances ?? true,
    grey_after: cfg.grey_after ?? def.grey_after ?? '',
    grey_until: cfg.grey_until ?? def.grey_until ?? '',
    day_capacity_hours: cfg.day_capacity_hours ?? def.day_capacity_hours,
  }
}

// ─── Cache der Einsatzplanung-Anzeige ───────────────────────
//
// Warum überhaupt: die Einsatzplanung entscheidet an der Config, WELCHE Reiter
// (Monat/Woche/Plantafel/…) es im Mandanten gibt. Solange sie fehlt, gilt
// «fehlender Key = an» — der Planer sähe also für die Dauer des Requests alle
// sechs Ansichten und danach die drei, die sein Mandant wirklich hat. Der Cache
// macht den ersten Frame beim Wiederöffnen korrekt; beim allerersten Öffnen
// bleibt die Reiterleiste stattdessen leer, bis die Antwort da ist
// (`configPending` in ProjectScheduleCalendar) — lieber kurz nichts als kurz
// falsch.
//
// Der Slug hängt mit im Eintrag: wer sich im selben Browser an einem anderen
// Mandanten anmeldet, darf dessen Ansichten nicht erben.

interface CachedSchedulingConfig {
  slug: string
  config: SchedulingConfig
}

function currentSlug(): string {
  try {
    return window.localStorage.getItem(SK.TENANT_SLUG) || ''
  } catch {
    return ''
  }
}

export function readCachedSchedulingConfig(): SchedulingConfig | undefined {
  try {
    const raw = window.localStorage.getItem(SK.SCHEDULING_CONFIG)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as CachedSchedulingConfig
    if (!parsed?.config || parsed.slug !== currentSlug()) return undefined
    return parsed.config
  } catch {
    // Kaputter Eintrag, Private-Mode, fremdes Format: Cache ist optional.
    return undefined
  }
}

export function clearCachedSchedulingConfig(): void {
  try {
    window.localStorage.removeItem(SK.SCHEDULING_CONFIG)
  } catch { /* egal */ }
}

function writeCachedSchedulingConfig(config: SchedulingConfig): void {
  try {
    const entry: CachedSchedulingConfig = { slug: currentSlug(), config }
    window.localStorage.setItem(SK.SCHEDULING_CONFIG, JSON.stringify(entry))
  } catch { /* voller/gesperrter Storage darf den Kalender nicht stören */ }
}

/** Anzeige-Config gemergt laden und für den nächsten Aufruf zwischenspeichern. */
export async function loadSchedulingConfig(): Promise<SchedulingConfig> {
  const merged = mergeSchedulingConfig(await getSchedulingConfig())
  writeCachedSchedulingConfig(merged)
  return merged
}

// Fahrdistanzen (km) zwischen Objektadressen für die Plantafel — cache-first,
// fehlende Paare via Google (serverseitig gedeckelt); nicht auflösbare Paare
// fehlen in der Antwort. Antwort-Paare sind normalisiert (getrimmt, a <= b).
export interface ScheduleDistance {
  a: string
  b: string
  km: number
}

export async function resolveScheduleDistances(
  pairs: [string, string][],
): Promise<{ distances: ScheduleDistance[] }> {
  return apiFetch<{ distances: ScheduleDistance[] }>('/pwa/admin/schedule/distances', {
    method: 'POST',
    body: JSON.stringify({ pairs }),
  })
}

// ─── Tenant Feature-Flags (Workflows) ───────────────────────

export type FeatureFieldType = 'bool' | 'number' | 'select' | 'number_list' | 'key_list' | 'text'

export interface FeatureFieldSchema {
  key: string
  label: string
  type: FeatureFieldType
  help?: string
  min?: number
  max?: number
  step?: number
  /** Nur `text`: Zeichenobergrenze, gespiegelt aus feature_registry.validate_override. */
  max_length?: number
  options?: { value: string; label: string }[]
}

export interface FeatureRegistryEntry {
  key: string
  label: string
  description: string
  category: string
  default: Record<string, unknown>
  schema: FeatureFieldSchema[]
}

export interface TenantFeaturesResponse {
  registry: FeatureRegistryEntry[]
  categories: string[]
  overrides: Record<string, Record<string, unknown>>
  effective: Record<string, Record<string, unknown>>
}

export async function getTenantFeatures(): Promise<TenantFeaturesResponse> {
  return apiFetch<TenantFeaturesResponse>('/pwa/admin/tenant/features')
}

export async function updateTenantFeature(
  featureKey: string,
  value: Record<string, unknown>,
): Promise<{ feature_key: string; effective: Record<string, unknown> }> {
  return apiFetch<{ feature_key: string; effective: Record<string, unknown> }>('/pwa/admin/tenant/features', {
    method: 'PATCH',
    body: JSON.stringify({ feature_key: featureKey, value }),
  })
}

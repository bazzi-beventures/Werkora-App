// Mandanten-Konfiguration: Module, Fahrtkosten-Tabelle, Einsatzplanung-Anzeige, Feature-Flags.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

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
  return apiFetch<{ config: SchedulingConfig }>('/pwa/admin/tenant/scheduling', {
    method: 'PATCH',
    body: JSON.stringify({ config }),
  })
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

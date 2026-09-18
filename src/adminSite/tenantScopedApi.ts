/**
 * Eine Naht, zwei Aufrufer — dieselben Screens für beide Wege.
 *
 * Spec: docs/specs/admin-werkora-ch.md §5.1/§6.4, dazu diese Umsetzungsnotiz.
 *
 * Der Spec-Text sagt «verschieben» für Konfiguration, LLM-Kosten, Nutzung,
 * Materialdatenbereinigung und Werkora Bonus. Verschieben allein reicht aber
 * nicht: die Screens müssten ihre Aufrufe auf `/pwa/superadmin/tenants/{id}/…`
 * umstellen — und bis zum Rückbau (P4) hängt in der Mandanten-App weiterhin
 * «Admin-Tools» an genau denselben Screens, dort auf den **alten** Pfaden.
 * Würde man sie nur umhängen, wäre Admin-Tools zwischen P2 und P4 kaputt; das
 * widerspricht §10 («die Mandanten-App funktioniert bis P4 unverändert»).
 *
 * Deshalb die Naht: die Screens nehmen einen `tenantId` entgegen.
 *
 *     null       → eigener Mandant, alte Route  (Mandanten-App, bis P4)
 *     '<uuid>'   → Mandant aus dem Pfad         (Betreiber-Seite)
 *
 * Nicht dasselbe wie «zwei Implementierungen»: die Screens kennen nur diese
 * Funktionen, und der Unterschied steht an genau einer Stelle je Werkzeug.
 * **P4 löscht die `null`-Zweige** — dann bleibt der Plattform-Aufruf übrig und
 * diese Datei kann ganz verschwinden.
 */
// Über den Index, nicht über api/admin/tenant.ts: die bestehenden
// Tab-Tests mocken `api/admin` als Ganzes.
import * as adminTenant from '../api/admin'
import * as platform from '../api/platform'
import type { AuthUser } from '../api/admin/users'
import type { HelpDoc } from '../api/help'
import type { WerkoraBonusResponse } from '../api/admin/werkoraBonus'
import * as materials from '../api/admin/materials'
import * as suppliers from '../api/admin/suppliers'
import * as users from '../api/admin/users'
import * as werkoraBonus from '../api/admin/werkoraBonus'
import * as help from '../api/help'
import { fetchKpiView } from '../api/kpiViews'

// ─── Module ────────────────────────────────────────────────────────────────

export function getModules(tenantId: string | null) {
  return tenantId ? platform.getModules(tenantId) : adminTenant.getTenantModules()
}

export function setModules(tenantId: string | null, enabled: string[], beta: string[]) {
  return tenantId
    ? platform.setModules(tenantId, enabled, beta)
    : adminTenant.updateTenantModules(enabled, beta)
}

// ─── Feature-Flags ─────────────────────────────────────────────────────────

export function getFeatures(tenantId: string | null) {
  return tenantId ? platform.getFeatures(tenantId) : adminTenant.getTenantFeatures()
}

export function setFeature(
  tenantId: string | null, key: string, value: Record<string, unknown>,
) {
  return tenantId
    ? platform.setFeature(tenantId, key, value)
    : adminTenant.updateTenantFeature(key, value)
}

// ─── Fahrtkosten ───────────────────────────────────────────────────────────

export function getTravelCost(tenantId: string | null) {
  return tenantId ? platform.getTravelCost(tenantId) : adminTenant.getTenantTravelCost()
}

export function setTravelCost(tenantId: string | null, table: adminTenant.TravelCostRow[] | null) {
  return tenantId
    ? platform.setTravelCost(tenantId, table)
    : adminTenant.updateTenantTravelCost(table)
}

// ─── Einsatzplanung ────────────────────────────────────────────────────────

export function getScheduling(tenantId: string | null) {
  return tenantId ? platform.getScheduling(tenantId) : adminTenant.getSchedulingConfig()
}

export function setScheduling(tenantId: string | null, config: adminTenant.SchedulingConfig) {
  return tenantId
    ? platform.setScheduling(tenantId, config)
    : adminTenant.updateSchedulingConfig(config)
}

// ─── Konten / Beta-Häkchen ────────────────────────────────────────────────

export function listUsers(tenantId: string | null): Promise<AuthUser[]> {
  return tenantId ? platform.listUsers(tenantId) : users.listUsers()
}

export async function setBetaTester(
  tenantId: string | null, nutzer: AuthUser, wert: boolean,
): Promise<void> {
  if (tenantId) {
    await platform.setBetaTester(tenantId, nutzer.id, wert)
    return
  }
  // Mandanten-Weg: das Häkchen hängt am allgemeinen Konto-PATCH, der die
  // übrigen Felder mitschickt. Ab P4 lehnt `_assert_may_set_beta` dort jede
  // Rolle ab — dann bleibt nur der Zweig oben, und dieser hier fällt weg.
  await users.saveUser({
    email: nutzer.email, display_name: nutzer.display_name, role: nutzer.role,
    is_active: nutzer.is_active, beta_tester: wert,
  }, nutzer.id)
}

/** Passwort eines Kontos zurücksetzen. Beide Wege enden im selben Rumpf
 *  (`admin_users.set_user_password`), nur der Mandant kommt anders zustande. */
export async function setUserPassword(
  tenantId: string | null, userId: string, neuesPasswort: string,
): Promise<void> {
  if (tenantId) {
    await platform.setUserPassword(tenantId, userId, neuesPasswort)
    return
  }
  await users.setUserPassword(userId, neuesPasswort)
}

// ─── Hilfe-Dokumente ──────────────────────────────────────────────────────

export function listHelpDocs(tenantId: string | null): Promise<HelpDoc[]> {
  return tenantId ? platform.listHelpDocs(tenantId) : help.listHelpDocs()
}

export async function uploadHelpDoc(tenantId: string | null, file: File): Promise<void> {
  if (tenantId) await platform.uploadHelpDoc(tenantId, file)
  else await help.uploadHelpDoc(file)
}

export async function deleteHelpDoc(tenantId: string | null, name: string): Promise<void> {
  if (tenantId) await platform.deleteHelpDoc(tenantId, name)
  else await help.deleteHelpDoc(name)
}

export async function reindexHelp(tenantId: string | null): Promise<void> {
  if (tenantId) await platform.reindexHelp(tenantId)
  else await help.triggerHelpReindex()
}

export function getReindexStatus(tenantId: string | null): Promise<help.ReindexStatus> {
  return tenantId ? platform.getReindexStatus(tenantId) : help.getHelpReindexStatus()
}

// ─── Materialdatenbereinigung ─────────────────────────────────────────────

/** Kategorien/Einheiten für die Filter — aus dem GEWÄHLTEN Mandanten.
 *  `includeInactive`, weil das Werkzeug auf archivierten Artikeln arbeitet. */
export function getMaterialsMeta(tenantId: string | null) {
  return tenantId
    ? platform.materialsMeta(tenantId)
    : materials.getMaterialsMeta({ includeInactive: true })
}

/** Lieferanten für Filter und Lieferanten-Spalte — aus dem GEWÄHLTEN Mandanten.
 *  Über den Mandanten-Weg geladen, zeigte die Betreiber-Seite die Lieferanten
 *  des Betreiber-Kontos: leeres Dropdown, leere Spalte. */
export function listSuppliers(tenantId: string | null) {
  return tenantId ? platform.listSuppliers(tenantId) : suppliers.listSuppliers()
}

/** Dieselbe Signatur wie `api/admin/materials.scanMaterialCleanup`, nur mit
 *  Mandant davor — der Screen soll beim Umzug nichts umbauen müssen. */
export function scanMaterialCleanup(
  tenantId: string | null,
  p: {
    category?: string; supplier_id?: string; status?: string; szenario?: string
    search?: string
    page?: number; page_size?: number
  } = {},
): Promise<materials.MaterialCleanupScan> {
  if (!tenantId) return materials.scanMaterialCleanup(p)
  return platform.materialCleanupScan(
    tenantId, p as Record<string, string | number>,
  )
}

export function bulkSetMaterialStatus(
  tenantId: string | null, artNrs: string[], isActive: boolean,
): Promise<materials.BulkMaterialStatusResult> {
  if (!tenantId) return materials.bulkSetMaterialStatus(artNrs, isActive)
  return platform.materialCleanupBulkStatus(tenantId, {
    art_nrs: artNrs, is_active: isActive,
  })
}

export function bulkSetMaterialStatusAll(
  tenantId: string | null,
  filter: {
    category?: string; supplier_id?: string; status?: string; szenario?: string
    search?: string
  },
  isActive: boolean,
): Promise<materials.BulkMaterialStatusResult> {
  if (!tenantId) return materials.bulkSetMaterialStatusAll(filter, isActive)
  return platform.materialCleanupBulkStatus(tenantId, {
    all_filtered: true, is_active: isActive, ...filter,
  })
}

// ─── Werkora Bonus ────────────────────────────────────────────────────────

export function getWerkoraBonus(
  tenantId: string | null, von: string, bis: string,
): Promise<WerkoraBonusResponse> {
  return tenantId
    ? platform.getWerkoraBonus(tenantId, von, bis)
    : werkoraBonus.getWerkoraBonus(von, bis)
}

// ─── KPI-Views (LLM-Kosten, Nutzung) ──────────────────────────────────────

export function getKpiView<T = Record<string, unknown>>(
  tenantId: string | null, viewName: string, filters: Record<string, string> = {},
) {
  if (tenantId) return platform.getKpiView<T>(tenantId, viewName, filters)
  return fetchKpiView<T>(viewName, filters).then((rows) => ({
    view: viewName, rows, count: rows.length,
  }))
}

/**
 * Die Plattform-API in der Form, die die Screens brauchen.
 *
 * Spec: docs/specs/admin-werkora-ch.md §5.1/§6.4, Rückbau §6.5.
 *
 * **Bis P4 war das eine Naht.** Die Screens liefen an zwei Orten — hier auf der
 * Betreiber-Seite und, über den Container «Admin-Tools», auch in der
 * Mandanten-App. Sie nahmen deshalb `tenantId: string | null` entgegen: `null`
 * hiess «eigener Mandant, alte Route». Der Container ist mit P4 weg, die
 * Mandanten-App ruft nichts davon mehr auf, und mit ihr sind die `null`-Zweige
 * verschwunden. `tenantId` ist jetzt Pflicht.
 *
 * **Warum die Datei trotzdem bleibt**, obwohl §10.3/1 ihr Ende vorhersagte: Sie
 * war nie nur eine Weiche. Die Materialdatenbereinigung und das Beta-Häkchen
 * brauchen eine andere Aufrufform, als `api/platform` sie anbietet — ein
 * Parameter-Objekt statt einer Liste, ein `AuthUser` statt einer ID, ein
 * gebauter Body. Diese Anpassungen standen vorher neben der Weiche und wären
 * beim Löschen in die Screens gewandert, also in fünf Dateien statt in eine.
 *
 * Die durchgereichten Funktionen bleiben aus einem zweiten Grund: Ein Screen
 * importiert **ein** Modul, nicht je nach Werkzeug `api/platform` oder diese
 * Datei. Wer eine Plattform-Route ergänzt, hat genau einen Ort dafür.
 */
import * as platform from '../api/platform'
import type { AuthUser } from '../api/admin/users'
import type { HelpDoc } from '../api/help'
import type { WerkoraBonusResponse } from '../api/admin/werkoraBonus'
import type * as adminTenant from '../api/admin'
import type * as materials from '../api/admin/materials'

// ─── Module ────────────────────────────────────────────────────────────────

export function getModules(tenantId: string) {
  return platform.getModules(tenantId)
}

export function setModules(tenantId: string, enabled: string[], beta: string[]) {
  return platform.setModules(tenantId, enabled, beta)
}

// ─── Feature-Flags ─────────────────────────────────────────────────────────

export function getFeatures(tenantId: string) {
  return platform.getFeatures(tenantId)
}

export function setFeature(
  tenantId: string, key: string, value: Record<string, unknown>,
) {
  return platform.setFeature(tenantId, key, value)
}

// ─── Fahrtkosten ───────────────────────────────────────────────────────────

export function getTravelCost(tenantId: string) {
  return platform.getTravelCost(tenantId)
}

export function setTravelCost(tenantId: string, table: adminTenant.TravelCostRow[] | null) {
  return platform.setTravelCost(tenantId, table)
}

// ─── Einsatzplanung ────────────────────────────────────────────────────────

export function getScheduling(tenantId: string) {
  return platform.getScheduling(tenantId)
}

export function setScheduling(tenantId: string, config: adminTenant.SchedulingConfig) {
  return platform.setScheduling(tenantId, config)
}

// ─── Konten / Beta-Häkchen ────────────────────────────────────────────────

export function listUsers(tenantId: string): Promise<AuthUser[]> {
  return platform.listUsers(tenantId)
}

/** Nimmt den ganzen `AuthUser`, weil die Konten-Tabelle ihn ohnehin in der Hand
 *  hat — der Aufrufer soll nicht an jeder Stelle `.id` herausklauben. */
export async function setBetaTester(
  tenantId: string, nutzer: AuthUser, wert: boolean,
): Promise<void> {
  await platform.setBetaTester(tenantId, nutzer.id, wert)
}

/** Passwort eines Kontos zurücksetzen — derselbe Rumpf wie auf der
 *  Mandanten-Route (`admin_users.set_user_password`), nur kommt der Mandant
 *  aus dem Pfad statt aus der Sitzung. */
export async function setUserPassword(
  tenantId: string, userId: string, neuesPasswort: string,
): Promise<void> {
  await platform.setUserPassword(tenantId, userId, neuesPasswort)
}

// ─── Hilfe-Dokumente ──────────────────────────────────────────────────────

export function listHelpDocs(tenantId: string): Promise<HelpDoc[]> {
  return platform.listHelpDocs(tenantId)
}

export async function uploadHelpDoc(tenantId: string, file: File): Promise<void> {
  await platform.uploadHelpDoc(tenantId, file)
}

export async function deleteHelpDoc(tenantId: string, name: string): Promise<void> {
  await platform.deleteHelpDoc(tenantId, name)
}

export async function reindexHelp(tenantId: string): Promise<void> {
  await platform.reindexHelp(tenantId)
}

export function getReindexStatus(tenantId: string) {
  return platform.getReindexStatus(tenantId)
}

// ─── Materialdatenbereinigung ─────────────────────────────────────────────

/** Kategorien/Einheiten für die Filter — aus dem GEWÄHLTEN Mandanten.
 *  `includeInactive`, weil das Werkzeug auf archivierten Artikeln arbeitet. */
export function getMaterialsMeta(tenantId: string) {
  return platform.materialsMeta(tenantId)
}

/** Lieferanten für Filter und Lieferanten-Spalte — aus dem GEWÄHLTEN Mandanten.
 *  Über den Mandanten-Weg geladen, zeigte die Betreiber-Seite die Lieferanten
 *  des Betreiber-Kontos: leeres Dropdown, leere Spalte. */
export function listSuppliers(tenantId: string) {
  return platform.listSuppliers(tenantId)
}

/** Nimmt die Filter als benanntes Objekt statt als Positionsliste — so steht
 *  im Screen `{ status, szenario, search }` und nicht `(…, '', '', s, …)`. */
export function scanMaterialCleanup(
  tenantId: string,
  p: {
    category?: string; supplier_id?: string; status?: string; szenario?: string
    search?: string
    page?: number; page_size?: number
  } = {},
): Promise<materials.MaterialCleanupScan> {
  return platform.materialCleanupScan(
    tenantId, p as Record<string, string | number>,
  )
}

export function bulkSetMaterialStatus(
  tenantId: string, artNrs: string[], isActive: boolean,
): Promise<materials.BulkMaterialStatusResult> {
  return platform.materialCleanupBulkStatus(tenantId, {
    art_nrs: artNrs, is_active: isActive,
  })
}

/** Wirkt auf ALLE Artikel des Filters, über alle Seiten hinweg — die Ziel-Liste
 *  entsteht server-seitig. Deshalb `all_filtered` statt einer Artikelliste. */
export function bulkSetMaterialStatusAll(
  tenantId: string,
  filter: {
    category?: string; supplier_id?: string; status?: string; szenario?: string
    search?: string
  },
  isActive: boolean,
): Promise<materials.BulkMaterialStatusResult> {
  return platform.materialCleanupBulkStatus(tenantId, {
    all_filtered: true, is_active: isActive, ...filter,
  })
}

// ─── Werkora Bonus ────────────────────────────────────────────────────────

export function getWerkoraBonus(
  tenantId: string, von: string, bis: string,
): Promise<WerkoraBonusResponse> {
  return platform.getWerkoraBonus(tenantId, von, bis)
}

// ─── KPI-Views (LLM-Kosten, Nutzung) ──────────────────────────────────────

export function getKpiView<T = Record<string, unknown>>(
  tenantId: string, viewName: string, filters: Record<string, string> = {},
) {
  return platform.getKpiView<T>(tenantId, viewName, filters)
}

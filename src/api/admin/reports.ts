// Rapporte am Projekt: manuell erfassen, bearbeiten, zum Bearbeiten laden.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

/**
 * Ein Rapport zum Bearbeiten. Bewusst `unknown` als Rückgabe: die Nutzlast ist
 * die grosse, verschachtelte Rapport-Form (Stunden, Material, Fixpreise,
 * Massaufnahme …), die heute nur im ReportCreateForm vollständig beschrieben ist.
 * Sie wandert mit dem Umbau der Maske hierher — bis dahin wäre ein hier
 * abgeschriebener Typ genau die Art Vermutung, die dieser Umbau abschafft.
 */
export async function getProjectReport(projectId: string, reportId: number): Promise<unknown> {
  return apiFetch(`/pwa/admin/projects/${projectId}/reports/${reportId}`)
}

export interface SaveReportResult {
  report_id?: number
  // Erfolg mit Vorbehalt (z.B. Lager nicht abgebucht, unbekannte art_nr) — der
  // Aufrufer zeigt die Hinweise, der Rapport ist gespeichert.
  warnings?: unknown
}

/**
 * Ohne `reportId` anlegen (POST), mit `reportId` ersetzen (PUT) — das Backend
 * ersetzt beim Bearbeiten Stunden UND Material vollständig durch die Nutzlast.
 * Was nicht mitkommt, ist danach weg.
 */
export async function saveProjectReport(
  projectId: string, payload: unknown, reportId?: number,
): Promise<SaveReportResult | null> {
  return apiFetch<SaveReportResult | null>(
    reportId
      ? `/pwa/admin/projects/${projectId}/reports/${reportId}`
      : `/pwa/admin/projects/${projectId}/reports`,
    { method: reportId ? 'PUT' : 'POST', body: JSON.stringify(payload) },
  )
}

export interface DeleteReportResult {
  // Anzahl Materialpositionen, die ins Lager zurückgebucht wurden.
  stock_restored?: number
  // Rückbuchung unvollständig (z.B. unbekannte art_nr) — der Rapport ist trotzdem weg.
  warnings?: string[]
}

/**
 * Löscht einen Rapport samt Kindzeilen und bucht Material ins Lager zurück.
 * Abgerechnete Rapporte sperrt der Server mit 409 — ohne Löschmöglichkeit landen
 * die Stunden eines doppelt erfassten Rapports sonst auf der nächsten Rechnung.
 */
export async function deleteProjectReport(
  projectId: string, reportId: number,
): Promise<DeleteReportResult> {
  return apiFetch<DeleteReportResult>(`/pwa/admin/projects/${projectId}/reports/${reportId}`, {
    method: 'DELETE',
  })
}

/**
 * Erzeugt das fehlende PDF eines bestehenden Rapports nach.
 *
 * Beide PDF-Pfade (Unterschrift im Chat, manuelles Erfassen) sind best-effort:
 * schlägt der Storage-Upload fehl, steht der Rapport ohne Dokument da — und war
 * bisher nicht mehr zu öffnen, weil Nacherzeugen nur über die Bearbeiten-Maske
 * ging und die bei abgerechneten Rapporten gesperrt ist. Liegt bereits ein PDF
 * vor, antwortet der Server mit 409 statt einer zweiten Fassung.
 */
export async function regenerateReportPdf(
  projectId: string, reportId: number,
): Promise<{ status?: string }> {
  return apiFetch<{ status?: string }>(
    `/pwa/admin/projects/${projectId}/reports/${reportId}/pdf`, { method: 'POST' },
  )
}

/**
 * Bündelt Teilrapporte zu einem Gesamtrapport (docs/specs/teilrapport.md §5.5).
 *
 * Der Behälter entsteht ohne Unterschrift — die holt der Monteur in der App beim
 * Kunden. Bis dahin ist keiner der gebündelten Einsätze verrechenbar. Bündelt
 * jemand parallel dieselbe Baustelle, antwortet der Server mit 409 statt einem
 * halb gefüllten Gesamtrapport.
 */
export async function aggregateProjectReports(
  projectId: string, reportIds: number[],
): Promise<{ status: string; report_id: number }> {
  return apiFetch(`/pwa/admin/projects/${projectId}/reports/aggregate`, {
    method: 'POST',
    body: JSON.stringify({ report_ids: reportIds }),
  })
}

/**
 * Löst einen Gesamtrapport auf. Nur hier — nicht in der Monteur-App — lässt sich
 * auch ein bereits UNTERSCHRIEBENER auflösen: der bleibt dann samt PDF stehen und
 * wird als aufgelöst markiert (der Kunde hat den Beleg). Der unsignierte wird
 * gelöscht. Abgerechnet sperrt der Server mit 409.
 */
export async function dissolveAggregateReport(
  projectId: string, reportId: number,
): Promise<{ status: string; released: number; deleted: boolean }> {
  return apiFetch(`/pwa/admin/projects/${projectId}/reports/${reportId}/dissolve`, {
    method: 'POST',
  })
}

/**
 * Schliesst einen Gesamtrapport OHNE Kundenunterschrift ab (Migration 20260824d).
 *
 * Der Ausweg für die Baustelle, auf der niemand mehr unterschreibt: ohne ihn
 * blieben die erfassten Stunden dauerhaft unverrechenbar — der unsignierte
 * Behälter öffnet das Rechnungs-Tor nicht, und ein im Chat erfasster Teilrapport
 * lässt sich nicht nachträglich zum gewöhnlichen Rapport machen.
 *
 * Danach sind der Behälter und alle seine Teilrapporte verrechenbar. Das PDF trägt
 * «Abgeschlossen durch … — ohne Kundenunterschrift».
 */
/**
 * Nimmt einen bestehenden Rapport nachträglich in die Teilrapport-Serie auf — oder
 * wieder heraus. Gegenstück zur Monteur-Route, gleiche Prüfkette.
 *
 * Das Zurücknehmen (`isPartial: false`) ist der einzige Weg zurück, solange der
 * Rapport nicht gebündelt ist; danach führt er über «Auflösen». Was sich ändert, ist
 * genau eine Spalte — Stunden, Material, Text, PDF und eine bereits geholte
 * Unterschrift bleiben unangetastet. Was es kostet, ist die Verrechenbarkeit bis zur
 * Unterschrift auf dem Gesamtrapport.
 */
export async function markReportPartial(
  projectId: string, reportId: number, isPartial: boolean,
): Promise<{ status: string; changed: boolean; is_partial: boolean }> {
  return apiFetch(`/pwa/admin/projects/${projectId}/reports/${reportId}/partial`, {
    method: 'POST',
    body: JSON.stringify({ is_partial: isPartial }),
  })
}

export async function acceptAggregateReport(
  projectId: string, reportId: number,
): Promise<{ status: string; report_id: number; children: number }> {
  return apiFetch(`/pwa/admin/projects/${projectId}/reports/${reportId}/accept`, {
    method: 'POST',
  })
}

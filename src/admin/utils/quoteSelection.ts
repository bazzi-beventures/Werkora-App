// Offerten-Auswahl im Rechnung-Erstellen-Dialog: reine Entscheidungslogik,
// getrennt von der Checkbox-UI (QuoteCoverageSelect) — Geld-nahe Regeln gehören
// unit-getestet (quoteSelection.test.ts), nicht in JSX.

import type { InvoiceQuoteCoverage } from '../../api/admin/invoices'

/**
 * Ob der Dialog die Auswahl überhaupt zeigt: erst ab zwei wählbaren Offerten gibt
 * es etwas zu entscheiden — bei genau einer bleibt der Dialog wie bisher.
 */
export function showQuoteSelection(coverage: InvoiceQuoteCoverage | null): boolean {
  if (!coverage) return false
  return coverage.covered.length + coverage.additional.length > 1
}

/** Standard-Haken = exakt das, was die Automatik abdecken würde. */
export function defaultCheckedIds(coverage: InvoiceQuoteCoverage): number[] {
  return coverage.covered.map(q => q.id)
}

/**
 * Was geht als `quote_ids` an den Generate-Request?
 *
 * `undefined`, solange die Auswahl dem Standard (= covered) entspricht: dann läuft
 * das Backend über die unveränderte automatische Auflösung — der bewährte Pfad
 * bleibt der Normalfall, die explizite Auswahl ist die Ausnahme. Erst eine echte
 * Abweichung (Zusatz-Offerte angehakt oder Standard abgewählt) schickt die Liste.
 */
export function selectionPayload(
  coverage: InvoiceQuoteCoverage,
  checked: number[],
): number[] | undefined {
  const def = new Set(defaultCheckedIds(coverage))
  const cur = new Set(checked)
  if (def.size === cur.size && [...cur].every(id => def.has(id))) return undefined
  // Stabile Reihenfolge: erst covered, dann additional — wie im Dialog angezeigt.
  return [...coverage.covered, ...coverage.additional]
    .map(q => q.id)
    .filter(id => cur.has(id))
}

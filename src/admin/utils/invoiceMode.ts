// «Neue Version» oder «weitere Rechnung» im Rechnung-Erstellen-Dialog
// (Feature-Anfrage WW-39/WW-47, Spec docs/specs/weitere-rechnung.md).
//
// Bis dahin ersetzte jede neue Rechnung die jüngste des Projekts (nächste Version,
// offene Fassung archiviert). Wer einem Kunden zwei Rechnungen stellen wollte —
// Anzahlung und Schluss, zwei Liegenschaften, ein Nachtrag —, verlor dabei die erste.

export type InvoiceMode = 'replace' | 'additional'

// Status, in denen eine Rechnung noch gilt. Archivierte sind ersetzt oder annulliert:
// neben ihnen gibt es nichts zu ersetzen und nichts «weiteres» zu stellen.
const ACTIVE_STATUSES = new Set(['ausstehend', 'offen', 'gesendet', 'bezahlt'])

/** Hat das Projekt eine gültige Rechnung? Nur dann stellt sich die Frage. */
export function hasActiveInvoice(invoices: readonly { status: string }[]): boolean {
  return invoices.some(inv => ACTIVE_STATUSES.has(inv.status))
}

/** Feld `additional` für den Generate-Request; die Neufassung lässt es weg. */
export function invoiceModePayload(mode: InvoiceMode): { additional?: true } {
  return mode === 'additional' ? { additional: true } : {}
}

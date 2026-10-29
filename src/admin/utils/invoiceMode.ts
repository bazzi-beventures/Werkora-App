// Art der Rechnung im Erstellen-Dialog: neue Version, weitere Rechnung oder
// Anzahlung (Feature-Anfragen WW-39/WW-47, Specs docs/specs/weitere-rechnung.md
// und docs/specs/anzahlung-und-rapportauswahl.md). Dazu die Payload-Regeln der
// Rapport-Auswahl und des Anzahlungs-Abzugs — rein, damit beide Dialoge
// (Projekt und Rechnungen-Screen) dieselbe Regel benutzen.

import type { GeneralDeductionPayload } from './generalDeduction'

export type InvoiceMode = 'replace' | 'additional' | 'anzahlung'

// Status, in denen eine Rechnung noch gilt. Archivierte sind ersetzt oder annulliert:
// neben ihnen gibt es nichts zu ersetzen und nichts «weiteres» zu stellen.
const ACTIVE_STATUSES = new Set(['ausstehend', 'offen', 'gesendet', 'bezahlt'])

/** Hat das Projekt eine gültige Rechnung (keine Anzahlung)? Nur dann stellt sich
 *  die Frage «neue Version oder weitere Rechnung». */
export function hasActiveInvoice(
  invoices: readonly { status: string; invoice_kind?: string | null }[],
): boolean {
  return invoices.some(inv => ACTIVE_STATUSES.has(inv.status) && inv.invoice_kind !== 'anzahlung')
}

/** Welche Arten der Dialog anbietet. Ohne gültige Rechnung gibt es nichts zu
 *  ersetzen — dann heisst die gewöhnliche Rechnung schlicht «Rechnung». */
export function invoiceModeOptions(hasActive: boolean): InvoiceMode[] {
  return hasActive ? ['replace', 'additional', 'anzahlung'] : ['replace', 'anzahlung']
}

/** Felder `additional`/`kind` für den Generate-Request; die Neufassung lässt sie weg. */
export function invoiceModePayload(mode: InvoiceMode): { additional?: true; kind?: 'anzahlung' } {
  if (mode === 'additional') return { additional: true }
  if (mode === 'anzahlung') return { kind: 'anzahlung' }
  return {}
}

/** Eine weitere Rechnung lässt beim Vorschlagen aus, was auf offenen Rechnungen steht. */
export function isAdditional(mode: InvoiceMode): boolean {
  return mode === 'additional'
}

/** Rapport-Auswahl → `report_ids`. Sind alle angehakt, geht nichts mit — dann gilt
 *  die Automatik (alle verrechenbaren), wie bei der Offerten-Auswahl. */
export function reportSelectionPayload(
  allIds: readonly number[] | null, checked: readonly number[],
): number[] | undefined {
  if (!allIds || allIds.length === 0) return undefined
  if (allIds.every(id => checked.includes(id))) return undefined
  return allIds.filter(id => checked.includes(id))
}

/** Anzahlungs-Abzug → `anzahlung_ids`. Nicht geladen (null) → weglassen: der Server
 *  zieht dann alle offenen ab. Geladen → genau die angehakten, auch [] (= keine). */
export function anzahlungPayload(
  loaded: readonly { id: number }[] | null, checked: readonly number[],
): number[] | undefined {
  if (loaded === null) return undefined
  return loaded.filter(a => checked.includes(a.id)).map(a => a.id)
}

/** Prozentsatz der Anzahlung aus dem Eingabefeld; null = ungültig. */
export function parseAnzahlungPct(raw: string): number | null {
  const n = Number(raw.replace(',', '.').trim())
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null
}

/** Was der Erstellen-Dialog an den Aufrufer gibt (Projekt und Rechnungen-Screen). */
export interface GenerateInvoiceOptions {
  mode: InvoiceMode
  quoteIds?: number[]
  // Allg. Abzüge — die Felder des Generate-Requests, leer = keine.
  deduction?: GeneralDeductionPayload
  workDescription?: string
  reportIds?: number[]
  anzahlungIds?: number[]
  anzahlungPct?: number
  // Fahrzeitkosten verrechnen? Standard ja; nein = abgewählt (Teilrechnung).
  includeTravel?: boolean
}

/** Die Optionen als Felder des Generate-Requests. Eine Anzahlung trägt nur Offerten-
 *  Auswahl und Satz — Arbeitsbeschrieb, Rapporte, Abzüge gehören ihr nicht. */
export function generateOptionsPayload(o: GenerateInvoiceOptions) {
  if (o.mode === 'anzahlung') {
    return { quote_ids: o.quoteIds, kind: 'anzahlung' as const, anzahlung_pct: o.anzahlungPct }
  }
  return {
    quote_ids: o.quoteIds,
    // Das Backend unterscheidet `undefined` (= aus den Rapporten ableiten) von
    // `''` (= bewusst geleert). JSON.stringify lässt undefined weg.
    work_description: o.workDescription,
    report_ids: o.reportIds,
    anzahlung_ids: o.anzahlungIds,
    // Nur das Abwählen geht mit — sonst gilt die Vorgabe wie bisher.
    ...(o.includeTravel === false ? { include_travel: false } : {}),
    ...o.deduction,
    ...invoiceModePayload(o.mode),
  }
}

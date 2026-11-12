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

/** Vorbelegung der Rapport-Auswahl: alle — ausser Garantie-Rapporten (WW-33).
 *  Ein Garantie-Einsatz wird dem Kunden nicht verrechnet; vorher hakte der Dialog
 *  ihn trotzdem an, und nur die Warnung im Rechnungslauf erinnerte daran. Die
 *  Entscheidung bleibt beim Büro: der Rapport steht mit Abzeichen in der Liste
 *  und lässt sich wieder anhaken (Spec garantiefall.md §3.7).
 *
 *  Abgewählt wird nur, wo die Auswahl auch zu SEHEN ist (mehr als ein Rapport)
 *  und danach noch etwas angehakt bleibt — sonst schlösse der Dialog einen
 *  Rapport aus, den niemand sieht, bzw. stünde ohne Auswahl da. Dann gilt die
 *  Warnung im Rechnungslauf wie bisher. */
export function defaultCheckedReports(
  reports: readonly { id: number; is_warranty?: boolean }[] | null,
): number[] {
  const all = (reports ?? []).map(r => r.id)
  if (all.length <= 1) return all
  const ohneGarantie = (reports ?? []).filter(r => !r.is_warranty).map(r => r.id)
  return ohneGarantie.length > 0 ? ohneGarantie : all
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

/** Betrag der Anzahlung in CHF inkl. MWST (WS-41); null = ungültig. Nimmt die
 *  Schreibweisen, die man aus einer Kundenmail abtippt («9'953.30», «9953,30»,
 *  «9 953.30»). Muss auf 5 Rappen enden — ein anderer Betrag ist auf keiner
 *  Rechnung erreichbar (Rappenrundung); ob er unter dem Offerten-Total liegt,
 *  prüft der Server, der das Total kennt. */
export function parseAnzahlungBetrag(raw: string): number | null {
  const cleaned = raw.replace(/['’\s]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const rappen = Math.round(Number(cleaned) * 100)
  return rappen > 0 && rappen % 5 === 0 ? rappen / 100 : null
}

/** Eingabe der Anzahlung im Dialog: Prozent ODER Betrag (WS-41). Beide Felder
 *  bleiben beim Umschalten erhalten, gilt aber nur das gewählte. */
export interface AnzahlungEingabe {
  art: 'pct' | 'betrag'
  pct: string
  betrag: string
}

export const ANZAHLUNG_VORGABE: AnzahlungEingabe = { art: 'pct', pct: '50', betrag: '' }

/** Die gültige Anzahlung als Optionen für den Request; null = Eingabe ungültig. */
export function parseAnzahlung(e: AnzahlungEingabe): { anzahlungPct: number } | { anzahlungBetrag: number } | null {
  if (e.art === 'betrag') {
    const betrag = parseAnzahlungBetrag(e.betrag)
    return betrag === null ? null : { anzahlungBetrag: betrag }
  }
  const pct = parseAnzahlungPct(e.pct)
  return pct === null ? null : { anzahlungPct: pct }
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
  // Fester Betrag inkl. MWST statt Prozent (WS-41) — nie zusammen mit anzahlungPct.
  anzahlungBetrag?: number
  // Fahrzeitkosten verrechnen? Standard ja; nein = abgewählt (Teilrechnung).
  includeTravel?: boolean
}

/** Die Optionen als Felder des Generate-Requests. Eine Anzahlung trägt nur Offerten-
 *  Auswahl und Satz — Arbeitsbeschrieb, Rapporte, Abzüge gehören ihr nicht. */
export function generateOptionsPayload(o: GenerateInvoiceOptions) {
  if (o.mode === 'anzahlung') {
    return {
      quote_ids: o.quoteIds, kind: 'anzahlung' as const,
      anzahlung_pct: o.anzahlungPct, anzahlung_betrag: o.anzahlungBetrag,
    }
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

// Preis-Helfer für Offert-Positionen (frei erfasst oder aus Lieferanten-PDF).
// Reine Funktionen ohne React/DOM — direkt unit-testbar. Einzige Quelle der
// Kalkulation für QuotesScreen und das PDF-Review-Modal.

/**
 * Zahl aus einem Preis-Eingabefeld. Akzeptiert das Schweizer Dezimalkomma
 * („12,50"); leere oder unlesbare Eingabe wird zu 0.
 */
export function parseNum(v: string): number {
  return parseFloat(v.replace(',', '.')) || 0
}

/**
 * Verkaufspreis aus Einkaufspreis + Aufschlag:
 * `VK = EK × (1 + Aufschlag%)`, aufgerundet auf 0.05 (Schweizer Rappenrundung).
 *
 * Pendant zu `db.pricing.compute_material_vk` im Backend (dort via
 * `db.money.round_to_5_rappen`). Vorher rundete diese Funktion auf 0.50 auf,
 * das Backend dagegen auf den Rappen genau — derselbe Artikel kostete als freie
 * Position 449.00 und als Katalog-Artikel 448.94. Beide Wege liefern jetzt 448.95.
 *
 * Gerechnet wird über ganzzahlige Rappen: `Math.ceil(448.95 * 20) / 20` ergibt in
 * Float 449.00, weil 448.95 * 20 als 8979.000000000001 dasteht. Ganze Zahlen sind
 * exakt, also erst auf Rappen runden und dann in 5er-Schritten aufrunden.
 */
export function vkFromEk(ekPrice: number, marginPct: number): number {
  const rappen = Math.round(ekPrice * (1 + marginPct / 100) * 100)
  return (Math.ceil(rappen / 5) * 5) / 100
}

/**
 * Kaufmännische Rundung eines CHF-Betrags auf 2 Stellen (half-up, von 0 weg).
 *
 * Pendant zu `db.money.money_round` im Backend. Beide **müssen** dasselbe liefern:
 * `total_price` je Position wird im Formular gerechnet und vom Backend übernommen —
 * bei einer Divergenz steht auf der Offerte ein anderer Betrag als in der Rechnung.
 *
 * Gerundet wird über die **dezimale Schreibweise**, nicht über den Float:
 * `Math.round(2.675 * 100)` ergibt 267 (2.675 liegt binär knapp unter 267.5) und damit
 * 2.67, während das Backend via `Decimal("2.675")` auf 2.68 rundet. `${n}e2` lässt den
 * Parser die Verschiebung dezimal ausführen — 267.5 exakt.
 *
 * `Math.round` rundet die Hälfte Richtung +Unendlich (−267.5 → −267); Decimals
 * ROUND_HALF_UP rundet von der Null weg. Darum wird das Vorzeichen abgespalten.
 * Positionsbeträge sind in der Praxis nicht negativ — die Symmetrie kostet nichts.
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  const sign = n < 0 ? -1 : 1
  const abs = Math.abs(n)
  // Sehr kleine/grosse Zahlen stehen als "1e-7" da; dann ist "1e-7e2" kein
  // gueltiges Literal und Number(...) waere NaN. Fuer solche Werte reicht der
  // direkte Weg — im Rappenbereich gibt es dort ohnehin keinen Halb-Fall.
  const shifted = Number(`${abs}e2`)
  const rounded = Number.isFinite(shifted) ? Math.round(shifted) : Math.round(abs * 100)
  const back = Number(`${rounded}e-2`)
  return sign * (Number.isFinite(back) ? back : rounded / 100)
}

/**
 * Zeilentotal einer Position: `Menge × Preis`, kaufmännisch auf 2 Stellen.
 * Pendant zu `services.positions.line_total`.
 */
export function lineTotal(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice)
}

/**
 * Fahrspesen-Staffelung: `[[km_schwelle, chf], ...]`, aufsteigend nach km.
 *
 * `null` als Schwelle heisst „und darüber" — so serialisiert das Backend das
 * `float('inf')` der System-Default-Tabelle (JSON kennt kein Infinity).
 * Mandanten-Tabellen haben keine solche Zeile; dort gilt der letzte Preis
 * automatisch für alle grösseren Distanzen.
 */
export type TravelCostTable = [number | null, number][]

/**
 * Fahrspesen-Pauschale für eine Distanz.
 *
 * Pendant zu `db.invoices.compute_travel_cost_for_km`: `Math.ceil` rundet auf den
 * nächsten ganzen km auf (5.0 km → 20 CHF, 5.1 km → 30 CHF).
 *
 * Die Tabelle ist **Parameter, keine Konstante**. Vorher stand hier eine Kopie des
 * System-Defaults im QuotesScreen, die den Mandanten-Override nicht kannte — die
 * Vorschau zeigte CHF 40, offeriert wurden CHF 55. Die wirksame Tabelle kommt jetzt
 * vom Backend (`/pwa/admin/quote-travel-cost-table`).
 *
 * Leere Tabelle → 0 (nichts zu offerieren ist besser als eine erfundene Pauschale).
 */
export function computeTravelCost(km: number, table: TravelCostTable): number {
  if (!table.length) return 0
  const kmCeil = Math.ceil(km)
  for (const [threshold, price] of table) {
    if (threshold === null || kmCeil <= threshold) return price
  }
  return table[table.length - 1][1]
}

/** Aufschlag-Faktor (z. B. 1.75) → Prozent (75). */
export function factorToPct(factor: number): number {
  return Math.round((factor - 1) * 10000) / 100
}

/** Aufschlag-Prozent (75) → Faktor (1.75), auf 4 Nachkommastellen gerundet. */
export function pctToFactor(pct: number): number {
  return Math.round((1 + pct / 100) * 10000) / 10000
}

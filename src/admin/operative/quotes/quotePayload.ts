// Aus Formularzeilen wird das, was zum Server geht (Charge H2).
//
// Reine Funktionen, kein React: das ist der Geldpfad der Offerte. `total_price` je
// Position wird HIER gerechnet und vom Backend übernommen — weicht diese Rechnung
// von `db.money.money_round` / `services.positions.line_total` ab, steht auf der
// Offerte ein anderer Betrag als auf der Rechnung. Darum liegt sie ausserhalb der
// Masken und ist in quotePayload.test.ts je Zeilentyp abgedeckt.
//
// Erstellen und Bearbeiten schicken bewusst unterschiedliche Formen:
//   * Erstellen: Material als `art_nr` + Menge, der Server löst Preis/Bezeichnung auf.
//   * Bearbeiten: aufgelöste Zeilen mit eigenem `total_price`.
// Alles andere ist in beiden Masken dieselbe Rechnung und steht darum nur einmal hier.

import { parseNum, pctToFactor, round2 } from '../../utils/quotePricing'
import type {
  EditChargeRow, EditExtraRow, EditFreeRow, EditLaborRow, EditTravelRow,
  ExtraChargeRow, ExtraProductRow, InstallationRow, LaborRow, MaterialRow, SpecialRow,
} from './quoteTypes'

export type QuoteItem = Record<string, unknown>

// ─── Sonderpositionen (in beiden Masken gleich) ─────────────

/** Baut aus einer SpecialRow die Backend-Position
 *  {description, quantity, unit, unit_price, total_price}. */
export function buildSpecialItem(r: SpecialRow): QuoteItem {
  if (r.mode === 'stunden') {
    const h = parseNum(r.hours)
    const rate = parseNum(r.unit_price)
    return { description: r.description, quantity: h, unit: 'h', unit_price: rate, total_price: round2(h * rate) }
  }
  const p = parseNum(r.unit_price)
  return { description: r.description, quantity: 1, unit: 'Pau', unit_price: p, total_price: p }
}

export function specialRowValid(r: SpecialRow): boolean {
  if (!r.description) return false
  return r.mode === 'stunden'
    ? parseNum(r.hours) > 0 && parseNum(r.unit_price) > 0
    : parseNum(r.unit_price) > 0
}

export function specialItems(rows: SpecialRow[]): QuoteItem[] {
  return rows.filter(specialRowValid).map(buildSpecialItem)
}

/** Sonderaufwände / Fahrtkosten: freier Text + Betrag, kein Mengengerüst. */
export function descPriceItems(rows: (ExtraChargeRow | EditChargeRow | EditTravelRow)[]): QuoteItem[] {
  return rows
    .filter(r => r.description && parseNum(r.total_price) > 0)
    .map(r => ({
      description: r.description,
      total_price: parseNum(r.total_price),
      // Markierung der automatischen Endziffern-Aufrundung unverändert
      // durchreichen (siehe EditChargeRow) — nur setzen, wenn sie dran war,
      // damit gewöhnliche Zeilen unverändert wie bisher aussehen.
      ...('werkora_bonus' in r && r.werkora_bonus ? { werkora_bonus: true } : {}),
    }))
}

/** Montagepositionen: immer 1 × Pauschale, Betrag = Zeilentotal. */
export function installationItems(rows: InstallationRow[]): QuoteItem[] {
  return rows
    .filter(r => r.description && parseNum(r.unit_price) > 0)
    .map(r => ({
      description: r.description,
      quantity: 1,
      unit: 'Pau',
      unit_price: parseNum(r.unit_price),
      total_price: parseNum(r.unit_price),
    }))
}

// Kalkulations-Metadaten einer Produktzeile (EK, Aufschlag, Lieferant, Breakdown).
// Preisneutral, müssen aber ein Speichern überleben — sie sind die Nachkalkulation.
function withProductMeta(item: QuoteItem, r: ExtraProductRow | EditExtraRow): QuoteItem {
  if (r.ek !== undefined && r.ek.trim() !== '') item.ek_price = parseNum(r.ek)
  if (r.margin_pct !== undefined && r.margin_pct.trim() !== '') item.margin_factor = pctToFactor(parseNum(r.margin_pct))
  if (r.supplier_id) item.supplier_id = r.supplier_id
  if (r.category) item.category = r.category
  if (r.positions) item.positions = r.positions
  return item
}

// ─── Erstellen ──────────────────────────────────────────────

/** Lohnzeilen beim Erstellen: der Ansatz kommt aus der Funktionsauswahl (Zahl oder
 *  null), das Zeilentotal rechnet der Server. */
export function createLaborItems(rows: LaborRow[]): QuoteItem[] {
  return rows
    .filter(r => r.description && parseNum(r.quantity) > 0)
    .map(r => ({
      description: r.description,
      quantity: parseNum(r.quantity),
      unit_price: r.unit_price,
      hidden: !!r.hidden,
    }))
}

/** Material beim Erstellen: nur Artikelnummer + Menge — Bezeichnung und Preis
 *  löst der Server aus dem Katalog auf. */
export function createMaterialItems(rows: MaterialRow[]): QuoteItem[] {
  return rows
    .filter(r => r.art_nr && parseNum(r.quantity) > 0)
    .map(r => {
      const item: QuoteItem = { art_nr: r.art_nr, quantity: parseNum(r.quantity) }
      if (r.optional) item.optional = true  // Eventualposition (nur bei aktivem Feature serverseitig übernommen)
      return item
    })
}

export function createExtraProductItems(rows: ExtraProductRow[]): QuoteItem[] {
  return rows
    .filter(r => r.description)
    .map(r => {
      const qty = parseNum(r.quantity)
      const price = parseNum(r.unit_price)
      const item: QuoteItem = {
        description: r.description,
        quantity: qty,
        unit: r.unit,
        unit_price: price,
        total_price: round2(qty * price),
      }
      withProductMeta(item, r)
      if (r.optional) item.optional = true  // Eventualposition (nur bei aktivem Feature serverseitig übernommen)
      return item
    })
}

export interface CreateQuoteInput {
  projectName: string
  projectId: string | null
  laborRows: LaborRow[]
  materialRows: MaterialRow[]
  extraProducts: ExtraProductRow[]
  extraCharges: ExtraChargeRow[]
  installationRows: InstallationRow[]
  specialRows: SpecialRow[]
  includeTravelCost: boolean
  laborDiscount: string
  materialDiscount: string
  fixedPrice: string
  skontoActive: boolean
  skontoPct: string
  skontoDays: string
  notes: string
  productDescription: string
  quoteType: 'offerte' | 'richtofferte'
}

export function buildCreateQuotePayload(f: CreateQuoteInput): Record<string, unknown> {
  return {
    project_name: f.projectName,
    project_id: f.projectId,
    labor_items: createLaborItems(f.laborRows),
    material_items: createMaterialItems(f.materialRows),
    travel_items: [],
    include_travel_cost: f.includeTravelCost,
    extra_product_items: createExtraProductItems(f.extraProducts),
    extra_charge_items: descPriceItems(f.extraCharges),
    installation_items: installationItems(f.installationRows),
    special_items: specialItems(f.specialRows),
    labor_discount_pct: parseNum(f.laborDiscount),
    material_discount_pct: parseNum(f.materialDiscount),
    // Leeres Feld => null, damit ein bestehender Fixpreis beim Bearbeiten auch
    // wieder entfernt werden kann (0 wäre für das Backend dasselbe, null ist
    // die ehrlichere Aussage "keiner").
    fixed_price: f.fixedPrice.trim() ? parseNum(f.fixedPrice) : null,
    // Ohne Häkchen kein Skonto — die Felder dürfen dabei gefüllt bleiben,
    // damit ein erneutes Anhaken die Werte zurückbringt.
    skonto_active: f.skontoActive,
    skonto_pct: f.skontoActive && f.skontoPct.trim() ? parseNum(f.skontoPct) : null,
    skonto_days: f.skontoActive && f.skontoDays.trim() ? parseNum(f.skontoDays) : null,
    notes: f.notes || null,
    product_description: f.productDescription.trim() || null,
    quote_type: f.quoteType,
  }
}

// ─── Bearbeiten ─────────────────────────────────────────────

/** Lohnzeilen beim Bearbeiten: Ansatz ist ein Eingabefeld, das Zeilentotal
 *  rechnet das Formular (die gespeicherte Offerte kennt keine Funktionen mehr). */
export function editLaborItems(rows: EditLaborRow[]): QuoteItem[] {
  return rows
    .filter(r => r.description && parseNum(r.quantity) > 0)
    .map(r => ({
      description: r.description,
      quantity: parseNum(r.quantity),
      unit: 'h',
      unit_price: parseNum(r.unit_price),
      total_price: round2(parseNum(r.quantity) * parseNum(r.unit_price)),
      hidden: !!r.hidden,
    }))
}

/** Material beim Bearbeiten: aufgelöste Zeile mit eigenem Zeilentotal. */
export function editMaterialItems(rows: EditFreeRow[]): QuoteItem[] {
  return rows
    .filter(r => r.description && parseNum(r.quantity) > 0)
    .map(r => ({
      description: r.description,
      quantity: parseNum(r.quantity),
      unit: r.unit,
      unit_price: parseNum(r.unit_price),
      total_price: round2(parseNum(r.quantity) * parseNum(r.unit_price)),
      optional: !!r.optional,
    }))
}

export function editExtraProductItems(rows: EditExtraRow[]): QuoteItem[] {
  return rows
    .filter(r => r.description)
    .map(r => {
      const item: QuoteItem = {
        description: r.description,
        quantity: parseNum(r.quantity),
        unit: r.unit,
        unit_price: parseNum(r.unit_price),
        total_price: round2(parseNum(r.quantity) * parseNum(r.unit_price)),
        optional: !!r.optional,
      }
      // EK/Marge/Lieferant/Positions erhalten — preisneutral, gingen aber bisher
      // beim Bearbeiten der Offerte verloren.
      return withProductMeta(item, r)
    })
}

/** Fahrtkosten gibt es nur beim Bearbeiten als eigene Zeilen — beim Erstellen
 *  kommen sie aus der Projektdistanz (include_travel_cost). */
export function editTravelItems(rows: EditTravelRow[]): QuoteItem[] {
  return rows
    .filter(r => parseNum(r.total_price) > 0)
    .map(r => ({ description: r.description, total_price: parseNum(r.total_price) }))
}

export interface EditQuoteInput {
  laborRows: EditLaborRow[]
  materialRows: EditFreeRow[]
  extraProducts: EditExtraRow[]
  extraCharges: EditChargeRow[]
  travelRows: EditTravelRow[]
  installationRows: InstallationRow[]
  specialRows: SpecialRow[]
  laborDiscount: string
  materialDiscount: string
  fixedPrice: string
  skontoActive: boolean
  skontoPct: string
  skontoDays: string
  notes: string
  productDescription: string
  customerId: string
}

export function buildEditQuotePayload(f: EditQuoteInput): Record<string, unknown> {
  return {
    labor_items: editLaborItems(f.laborRows),
    material_items: editMaterialItems(f.materialRows),
    travel_items: editTravelItems(f.travelRows),
    extra_product_items: editExtraProductItems(f.extraProducts),
    extra_charge_items: descPriceItems(f.extraCharges),
    installation_items: installationItems(f.installationRows),
    special_items: specialItems(f.specialRows),
    labor_discount_pct: parseNum(f.laborDiscount),
    material_discount_pct: parseNum(f.materialDiscount),
    // Leeres Feld => null, damit ein bestehender Fixpreis beim Bearbeiten auch
    // wieder entfernt werden kann (0 wäre für das Backend dasselbe, null ist
    // die ehrlichere Aussage "keiner").
    fixed_price: f.fixedPrice.trim() ? parseNum(f.fixedPrice) : null,
    skonto_active: f.skontoActive,
    skonto_pct: f.skontoActive && f.skontoPct.trim() ? parseNum(f.skontoPct) : null,
    skonto_days: f.skontoActive && f.skontoDays.trim() ? parseNum(f.skontoDays) : null,
    notes: f.notes || null,
    product_description: f.productDescription.trim() || null,
    // Immer mitschicken: das Backend vergleicht gegen die gespeicherte ID und
    // fasst Kunde und PDF nur bei echter Änderung an. '' = Zuordnung aufheben.
    customer_id: f.customerId,
  }
}

import { describe, it, expect } from 'vitest'
import { lineTotal, parseNum, pctToFactor } from '../../utils/quotePricing'
import {
  buildCreateQuotePayload, buildEditQuotePayload, buildSpecialItem, createExtraProductItems,
  createLaborItems, createMaterialItems, descPriceItems, editExtraProductItems,
  editLaborItems, editMaterialItems, editTravelItems, installationItems, specialItems,
  specialRowValid,
} from './quotePayload'
import type { CreateQuoteInput, EditQuoteInput } from './quotePayload'

// Netz vor dem Umbau der Offert-Formulare (Charge H2, Spec §3): das Zeilentotal je
// Zeilentyp. Geprüft wird nicht gegen abgetippte Zahlen, sondern gegen `lineTotal`
// aus quotePricing.ts — driftet eine der beiden Rechnungen, wird der Test rot statt
// beide still auseinanderlaufen zu lassen. `lineTotal` selbst ist gegen das Backend
// (db.money.money_round) in quotePricing.test.ts abgesichert.

// Zeilentotal-Fälle, die im Rappenbereich wehtun: Schweizer Dezimalkomma,
// ein Halb-Fall (2.675 → 2.68, nicht 2.67) und eine krumme Menge.
const CASES: { quantity: string; price: string }[] = [
  { quantity: '1', price: '100' },
  { quantity: '3', price: '2,675' },
  { quantity: '2,5', price: '19.90' },
  { quantity: '7', price: '0,05' },
  { quantity: '1,333', price: '99,99' },
]

const EMPTY_CREATE: CreateQuoteInput = {
  projectName: 'Haus Meier', projectId: 'p1',
  laborRows: [], materialRows: [], extraProducts: [], extraCharges: [],
  installationRows: [], specialRows: [], includeTravelCost: false,
  laborDiscount: '', materialDiscount: '', fixedPrice: '',
  skontoActive: false, skontoPct: '', skontoDays: '',
  notes: '', productDescription: '', quoteType: 'offerte',
}

const EMPTY_EDIT: EditQuoteInput = {
  laborRows: [], materialRows: [], extraProducts: [], extraCharges: [], travelRows: [],
  installationRows: [], specialRows: [],
  laborDiscount: '', materialDiscount: '', fixedPrice: '',
  skontoActive: false, skontoPct: '', skontoDays: '',
  notes: '', productDescription: '', customerId: '',
}

describe('Zeilentotale je Zeilentyp', () => {
  it.each(CASES)('freie Position beim Erstellen: $quantity × $price', ({ quantity, price }) => {
    const [item] = createExtraProductItems([{ description: 'Storen', quantity, unit: 'Stk', unit_price: price }])
    expect(item.quantity).toBe(parseNum(quantity))
    expect(item.unit_price).toBe(parseNum(price))
    expect(item.total_price).toBe(lineTotal(parseNum(quantity), parseNum(price)))
  })

  it.each(CASES)('freie Position beim Bearbeiten: $quantity × $price', ({ quantity, price }) => {
    const [item] = editExtraProductItems([{ description: 'Storen', quantity, unit: 'Stk', unit_price: price }])
    expect(item.total_price).toBe(lineTotal(parseNum(quantity), parseNum(price)))
  })

  it.each(CASES)('Materialzeile beim Bearbeiten: $quantity × $price', ({ quantity, price }) => {
    const [item] = editMaterialItems([{ description: 'Rollo', quantity, unit: 'Stk', unit_price: price }])
    expect(item.total_price).toBe(lineTotal(parseNum(quantity), parseNum(price)))
  })

  it.each(CASES)('Lohnzeile beim Bearbeiten: $quantity h × $price', ({ quantity, price }) => {
    const [item] = editLaborItems([{ description: 'Monteur', quantity, unit_price: price }])
    expect(item.unit).toBe('h')
    expect(item.total_price).toBe(lineTotal(parseNum(quantity), parseNum(price)))
  })

  it.each(CASES)('Sonderposition nach Stunden: $quantity h × $price', ({ quantity, price }) => {
    const item = buildSpecialItem({ description: 'Entsorgung', mode: 'stunden', unit_price: price, hours: quantity })
    expect(item).toMatchObject({ quantity: parseNum(quantity), unit: 'h', unit_price: parseNum(price) })
    expect(item.total_price).toBe(lineTotal(parseNum(quantity), parseNum(price)))
  })

  it('Sonderposition pauschal: Betrag ist das Zeilentotal', () => {
    const item = buildSpecialItem({ description: 'Demontage', mode: 'pauschal', unit_price: '450,50', hours: '' })
    expect(item).toMatchObject({ quantity: 1, unit: 'Pau', unit_price: 450.5, total_price: 450.5 })
  })

  it('Montageposition: 1 × Pauschale, Betrag doppelt geführt', () => {
    const [item] = installationItems([{ description: 'Montage', unit_price: '1200,50' }])
    expect(item).toEqual({ description: 'Montage', quantity: 1, unit: 'Pau', unit_price: 1200.5, total_price: 1200.5 })
  })

  it('Sonderaufwand/Fahrtkosten: nur Betrag, kein Mengengerüst', () => {
    expect(descPriceItems([{ description: 'Kranmiete', total_price: '250,25' }]))
      .toEqual([{ description: 'Kranmiete', total_price: 250.25 }])
  })

  it('Lohnzeile beim Erstellen trägt den Ansatz roh — das Total rechnet der Server', () => {
    const [item] = createLaborItems([{ description: 'Monteur', quantity: '2,5', unit_price: 95, hidden: true }])
    expect(item).toEqual({ description: 'Monteur', quantity: 2.5, unit_price: 95, hidden: true })
  })

  it('Materialzeile beim Erstellen trägt nur art_nr und Menge — der Katalog liefert den Preis', () => {
    expect(createMaterialItems([{ art_nr: 'A-1', quantity: '3' }]))
      .toEqual([{ art_nr: 'A-1', quantity: 3 }])
  })
})

describe('Was in keine Position gehört', () => {
  it('lässt unvollständige Zeilen weg', () => {
    expect(createLaborItems([{ description: '', quantity: '5', unit_price: 95 }])).toEqual([])
    expect(createLaborItems([{ description: 'Monteur', quantity: '0', unit_price: 95 }])).toEqual([])
    expect(createMaterialItems([{ art_nr: '', quantity: '3' }])).toEqual([])
    expect(createMaterialItems([{ art_nr: 'A-1', quantity: '' }])).toEqual([])
    expect(editMaterialItems([{ description: 'Rollo', quantity: '0', unit: 'Stk', unit_price: '10' }])).toEqual([])
    expect(installationItems([{ description: 'Montage', unit_price: '0' }])).toEqual([])
    expect(descPriceItems([{ description: '', total_price: '100' }])).toEqual([])
    expect(descPriceItems([{ description: 'Kranmiete', total_price: '0' }])).toEqual([])
    // Fahrtkosten beim Bearbeiten: Betrag entscheidet, die Beschreibung darf leer sein.
    expect(editTravelItems([{ description: '', total_price: '80' }]))
      .toEqual([{ description: '', total_price: 80 }])
    expect(editTravelItems([{ description: 'Fahrtpauschale', total_price: '0' }])).toEqual([])
  })

  it('Sonderposition braucht Beschreibung und Betrag, nach Stunden zusätzlich die Stunden', () => {
    expect(specialRowValid({ description: '', mode: 'pauschal', unit_price: '100', hours: '' })).toBe(false)
    expect(specialRowValid({ description: 'X', mode: 'pauschal', unit_price: '0', hours: '' })).toBe(false)
    expect(specialRowValid({ description: 'X', mode: 'stunden', unit_price: '95', hours: '' })).toBe(false)
    expect(specialRowValid({ description: 'X', mode: 'stunden', unit_price: '0', hours: '2' })).toBe(false)
    expect(specialRowValid({ description: 'X', mode: 'stunden', unit_price: '95', hours: '2' })).toBe(true)
    expect(specialItems([
      { description: 'X', mode: 'pauschal', unit_price: '100', hours: '' },
      { description: '', mode: 'pauschal', unit_price: '100', hours: '' },
    ])).toHaveLength(1)
  })
})

describe('Kalkulations-Metadaten der Produktzeilen', () => {
  const row = {
    description: 'Storen', quantity: '2', unit: 'Stk', unit_price: '448.95',
    ek: '250', margin_pct: '75', supplier_id: 's1', category: 'Storen',
    positions: [{ label: 'Antrieb', price: 100 }] as never,
  }

  it('überleben das Erstellen', () => {
    const [item] = createExtraProductItems([row])
    expect(item).toMatchObject({
      ek_price: 250, margin_factor: pctToFactor(75), supplier_id: 's1', category: 'Storen',
    })
    expect(item.positions).toEqual(row.positions)
  })

  it('überleben das Bearbeiten', () => {
    const [item] = editExtraProductItems([row])
    expect(item).toMatchObject({ ek_price: 250, margin_factor: pctToFactor(75), supplier_id: 's1' })
  })

  it('bleiben weg, solange die Felder leer sind', () => {
    const [item] = createExtraProductItems([{ description: 'Frei', quantity: '1', unit: 'Stk', unit_price: '50', ek: '', margin_pct: '  ' }])
    expect(item).not.toHaveProperty('ek_price')
    expect(item).not.toHaveProperty('margin_factor')
    expect(item).not.toHaveProperty('supplier_id')
  })

  it('Eventualposition: beim Erstellen nur wenn gesetzt, beim Bearbeiten immer explizit', () => {
    const plain = { description: 'Frei', quantity: '1', unit: 'Stk', unit_price: '50' }
    expect(createExtraProductItems([plain])[0]).not.toHaveProperty('optional')
    expect(createExtraProductItems([{ ...plain, optional: true }])[0].optional).toBe(true)
    // Bearbeiten muss ein abgewähltes Häkchen mitschicken können — sonst bliebe die
    // Position auf dem Server für immer eine Eventualposition.
    expect(editExtraProductItems([plain])[0].optional).toBe(false)
    expect(editMaterialItems([{ ...plain, optional: true }])[0].optional).toBe(true)
    expect(createMaterialItems([{ art_nr: 'A-1', quantity: '1', optional: true }])[0].optional).toBe(true)
  })
})

describe('Fixpreis und Skonto im Payload', () => {
  it('leerer Fixpreis wird null (ein gesetzter lässt sich so wieder entfernen)', () => {
    expect(buildCreateQuotePayload({ ...EMPTY_CREATE, fixedPrice: '  ' }).fixed_price).toBeNull()
    expect(buildCreateQuotePayload({ ...EMPTY_CREATE, fixedPrice: '5500' }).fixed_price).toBe(5500)
    expect(buildEditQuotePayload({ ...EMPTY_EDIT, fixedPrice: '' }).fixed_price).toBeNull()
    expect(buildEditQuotePayload({ ...EMPTY_EDIT, fixedPrice: '5500,50' }).fixed_price).toBe(5500.5)
  })

  it('ohne Häkchen kein Skonto — die Felder dürfen gefüllt bleiben', () => {
    const p = buildCreateQuotePayload({ ...EMPTY_CREATE, skontoActive: false, skontoPct: '2', skontoDays: '10' })
    expect(p).toMatchObject({ skonto_active: false, skonto_pct: null, skonto_days: null })
    const e = buildEditQuotePayload({ ...EMPTY_EDIT, skontoActive: true, skontoPct: '2', skontoDays: '10' })
    expect(e).toMatchObject({ skonto_active: true, skonto_pct: 2, skonto_days: 10 })
  })

  it('leere Texte werden null, der Offerten-Typ geht mit', () => {
    const p = buildCreateQuotePayload({ ...EMPTY_CREATE, notes: '', productDescription: '   ', quoteType: 'richtofferte' })
    expect(p).toMatchObject({ notes: null, product_description: null, quote_type: 'richtofferte' })
  })

  it('Erstellen schickt keine Fahrtzeilen, sondern das Häkchen zur Projektdistanz', () => {
    const p = buildCreateQuotePayload({ ...EMPTY_CREATE, includeTravelCost: true })
    expect(p.travel_items).toEqual([])
    expect(p.include_travel_cost).toBe(true)
  })

  it('Bearbeiten schickt die Kundenzuordnung immer mit ("" = aufheben)', () => {
    expect(buildEditQuotePayload({ ...EMPTY_EDIT, customerId: '' }).customer_id).toBe('')
    expect(buildEditQuotePayload({ ...EMPTY_EDIT, customerId: 'c1' }).customer_id).toBe('c1')
  })
})

import { describe, it, expect } from 'vitest'
import { buildConfirmedRow, cardOfferTotal, RowState, PositionState } from './PdfExtractionReviewModal'

function row(patch: Partial<RowState> = {}): RowState {
  return {
    name: 'Rolpac III',
    description: '',
    quantity: '1',
    unit: 'Stk',
    ek_price: '',
    category: '',
    margin_pct: '0',
    positions: [],
    ...patch,
  }
}

function pos(patch: Partial<PositionState> = {}): PositionState {
  return { label: 'Küche 1570×965', ek_price: '100', selected: true, separate: false, ...patch }
}

describe('buildConfirmedRow — Preisbildung', () => {
  it('rechnet VK = EK × (1 + Aufschlag), aufgerundet auf 0.05', () => {
    // Werte aus dem echten Griesser-Review: 513.18 × 1.75 = 898.065 → 898.10
    const out = buildConfirmedRow(row({ ek_price: '513.18', margin_pct: '75' }), null)

    expect(out).toHaveLength(1)
    expect(out[0].ek_price).toBe(513.18)
    expect(out[0].unit_price).toBe('898.1')
    expect(out[0].margin_factor).toBe(1.75)
  })

  it('akzeptiert Komma als Dezimaltrennzeichen', () => {
    const out = buildConfirmedRow(row({ ek_price: '10,50', margin_pct: '0' }), null)

    expect(out[0].ek_price).toBe(10.5)
    expect(out[0].unit_price).toBe('10.5')
  })

  it('fällt auf Menge 1 / Einheit Stk zurück, wenn leer', () => {
    const out = buildConfirmedRow(row({ ek_price: '20', quantity: '', unit: '' }), null)

    expect(out[0].quantity).toBe('1')
    expect(out[0].unit).toBe('Stk')
  })

  it('reicht supplier_id durch und macht aus leerer Warengruppe null', () => {
    const out = buildConfirmedRow(row({ ek_price: '20', category: '' }), 'sup-1')

    expect(out[0].supplier_id).toBe('sup-1')
    expect(out[0].category).toBeNull()
  })
})

describe('buildConfirmedRow — Positionen und „separat"', () => {
  it('rechnet nicht-separate Positionen in den EK der Produktzeile ein', () => {
    const out = buildConfirmedRow(
      row({ margin_pct: '50', positions: [pos({ ek_price: '100' }), pos({ label: 'Bad', ek_price: '40' })] }),
      null,
    )

    expect(out).toHaveLength(1)
    expect(out[0].ek_price).toBe(140)
    expect(out[0].unit_price).toBe('210') // 140 × 1.5
  })

  it('macht aus einer separaten Position eine eigene Offert-Zeile', () => {
    const out = buildConfirmedRow(
      row({
        margin_pct: '50',
        positions: [pos({ ek_price: '100' }), pos({ label: 'Motor', ek_price: '50', separate: true })],
      }),
      null,
    )

    expect(out).toHaveLength(2)
    // Produktzeile: nur die nicht-separate Position
    expect(out[0].ek_price).toBe(100)
    expect(out[0].unit_price).toBe('150')
    // Separate Zeile: Produktname als Kontext vorangestellt
    expect(out[1].description).toBe('Rolpac III — Motor')
    expect(out[1].ek_price).toBe(50)
    expect(out[1].unit_price).toBe('75')
    expect(out[1].quantity).toBe('1')
  })

  it('lässt die Produktzeile weg, wenn alle Positionen separat sind (Griesser)', () => {
    const out = buildConfirmedRow(
      row({
        margin_pct: '75',
        positions: [
          pos({ label: 'Küche', ek_price: '513.18', separate: true }),
          pos({ label: 'Bad', ek_price: '200', separate: true }),
        ],
      }),
      null,
    )

    expect(out).toHaveLength(2)
    expect(out.map(o => o.description)).toEqual(['Rolpac III — Küche', 'Rolpac III — Bad'])
  })

  it('ignoriert abgewählte Positionen — auch separate', () => {
    const out = buildConfirmedRow(
      row({
        margin_pct: '0',
        positions: [
          pos({ ek_price: '100' }),
          pos({ label: 'Rabatt', ek_price: '-30', selected: false }),
          pos({ label: 'Motor', ek_price: '50', selected: false, separate: true }),
        ],
      }),
      null,
    )

    expect(out).toHaveLength(1)
    expect(out[0].ek_price).toBe(100)
  })

  it('trägt den Positions-Breakdown als Metadaten an der Produktzeile mit', () => {
    const out = buildConfirmedRow(row({ ek_price: '0', positions: [pos({ ek_price: '100' })] }), null)

    expect(out[0].positions).toEqual([
      { label: 'Küche 1570×965', ek_price: 100, selected: true, separate: false },
    ])
  })

  it('hängt keine Positions-Metadaten an eine Karte ohne Positionen', () => {
    const out = buildConfirmedRow(row({ ek_price: '20' }), null)

    expect(out[0].positions).toBeUndefined()
  })
})

describe('cardOfferTotal — Betrag, der in die Offerte wandert', () => {
  it('multipliziert die Produktzeile mit der Menge', () => {
    const t = cardOfferTotal(row({ ek_price: '100', margin_pct: '50', quantity: '3' }), null)

    expect(t).toEqual({ ek: 300, vk: 450, lines: 1 }) // 3 × 100 EK, 3 × 150 VK
  })

  it('zählt Menge nur an der Produktzeile, separate Positionen bleiben 1-Stk-Zeilen', () => {
    // Der Mischfall: Menge 3 + eine separat ausgewiesene Position.
    // Produktzeile 3 × VK(100) = 450, separate Zeile 1 × VK(50) = 75.
    const t = cardOfferTotal(
      row({
        quantity: '3',
        margin_pct: '50',
        positions: [pos({ ek_price: '100' }), pos({ label: 'Motor', ek_price: '50', separate: true })],
      }),
      null,
    )

    expect(t).toEqual({ ek: 350, vk: 525, lines: 2 })
  })

  it('summiert bei Griesser schlicht die separaten Zeilen', () => {
    const t = cardOfferTotal(
      row({
        margin_pct: '0',
        positions: [
          pos({ label: 'Küche', ek_price: '500', separate: true }),
          pos({ label: 'Bad', ek_price: '200', separate: true }),
        ],
      }),
      null,
    )

    expect(t).toEqual({ ek: 700, vk: 700, lines: 2 })
  })

  it('behandelt leere Menge als 1', () => {
    const t = cardOfferTotal(row({ ek_price: '80', margin_pct: '0', quantity: '' }), null)

    expect(t).toEqual({ ek: 80, vk: 80, lines: 1 })
  })

  it('liefert 0 / keine Zeilen für eine leere Karte', () => {
    const t = cardOfferTotal(row({ name: '', description: '', ek_price: '100' }), null)

    expect(t).toEqual({ ek: 0, vk: 0, lines: 0 })
  })
})

describe('buildConfirmedRow — leere Zeilen', () => {
  it('erzeugt keine Zeile ohne Bezeichnung', () => {
    const out = buildConfirmedRow(row({ name: '', description: '', ek_price: '100' }), null)

    expect(out).toEqual([])
  })

  it('überspringt separate Positionen ohne Bezeichnung', () => {
    const out = buildConfirmedRow(
      row({ name: '', positions: [pos({ label: '  ', ek_price: '50', separate: true })] }),
      null,
    )

    expect(out).toEqual([])
  })

  it('nutzt allein den Artikeltext, wenn kein Produktname gesetzt ist', () => {
    const out = buildConfirmedRow(row({ name: '', description: 'Sonderanfertigung', ek_price: '80' }), null)

    expect(out).toHaveLength(1)
    expect(out[0].description).toBe('Sonderanfertigung')
  })

  it('verbindet Produktname und Artikeltext mit Gedankenstrich', () => {
    const out = buildConfirmedRow(row({ description: '1810×1280 (Gelenkkurbel)', ek_price: '80' }), null)

    expect(out[0].description).toBe('Rolpac III — 1810×1280 (Gelenkkurbel)')
  })
})

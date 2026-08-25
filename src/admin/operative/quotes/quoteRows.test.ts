import { describe, it, expect } from 'vitest'
import { applyEkMargin } from './quoteRows'
import { vkFromEk } from '../../utils/quotePricing'

// Die EK-Regel stand vorher zweimal inline (Erstellen und Bearbeiten) — der Test
// hält fest, wann sie greift und wann der Preis in der Hand des Anwenders bleibt.
describe('applyEkMargin', () => {
  const row = { description: 'Storen', quantity: '1', unit: 'Stk', unit_price: '', ek: '', margin_pct: '' }

  it('rechnet den VK, sobald EK oder Aufschlag angefasst werden', () => {
    const next = applyEkMargin({ ...row, ek: '250', margin_pct: '75' }, { ek: '250' })
    expect(next.unit_price).toBe(String(vkFromEk(250, 75)))
  })

  it('lässt den Preis in Ruhe, solange kein EK gesetzt ist', () => {
    expect(applyEkMargin({ ...row, unit_price: '99', ek: '   ' }, { margin_pct: '20' }).unit_price).toBe('99')
    expect(applyEkMargin({ ...row, unit_price: '99' }, { margin_pct: '20' }).unit_price).toBe('99')
  })

  it('greift nicht, wenn ein anderes Feld geändert wird — auch nicht mit EK', () => {
    const next = applyEkMargin({ ...row, unit_price: '10', ek: '250', margin_pct: '75' }, { quantity: '3' })
    expect(next.unit_price).toBe('10')
  })

  it('rechnet auch, wenn nur der Aufschlag getippt wird (EK steht schon)', () => {
    const next = applyEkMargin({ ...row, ek: '100', margin_pct: '20' }, { margin_pct: '20' })
    expect(next.unit_price).toBe(String(vkFromEk(100, 20)))
  })
})

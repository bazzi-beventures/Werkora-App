import { describe, expect, it } from 'vitest'
import type { InvoiceQuoteCoverage } from '../../api/admin/invoices'
import { defaultCheckedIds, selectionPayload, showQuoteSelection } from './quoteSelection'

function coverage(coveredIds: number[], additionalIds: number[]): InvoiceQuoteCoverage {
  const row = (id: number, accepted: boolean) => ({
    id, quote_number: `OFF-${id}`, total: id * 100, accepted,
  })
  return {
    covered: coveredIds.map(id => row(id, true)),
    additional: additionalIds.map(id => row(id, true)),
    blocker: null,
  }
}

describe('showQuoteSelection', () => {
  it('zeigt nichts ohne Coverage oder bei nur einer Offerte', () => {
    expect(showQuoteSelection(null)).toBe(false)
    expect(showQuoteSelection(coverage([1], []))).toBe(false)
  })

  it('zeigt die Auswahl ab zwei wählbaren Offerten — auch wenn covered leer ist (all_billed)', () => {
    expect(showQuoteSelection(coverage([1], [2]))).toBe(true)
    expect(showQuoteSelection(coverage([], [2, 3]))).toBe(true)
  })
})

describe('selectionPayload', () => {
  it('Standard-Auswahl → undefined (Automatik-Pfad bleibt der Normalfall)', () => {
    const c = coverage([1, 2], [3])
    expect(selectionPayload(c, defaultCheckedIds(c))).toBeUndefined()
    // Reihenfolge der Haken ist egal — verglichen wird die Menge.
    expect(selectionPayload(c, [2, 1])).toBeUndefined()
  })

  it('Zusatz-Offerte angehakt → explizite Liste in Anzeige-Reihenfolge', () => {
    const c = coverage([1, 2], [3])
    expect(selectionPayload(c, [3, 1, 2])).toEqual([1, 2, 3])
  })

  it('Standard abgewählt (Etappe) → explizite Liste', () => {
    const c = coverage([1, 2], [])
    expect(selectionPayload(c, [2])).toEqual([2])
  })

  it('covered leer (all_billed), Zusatz angehakt → Liste, nie undefined', () => {
    const c = coverage([], [3])
    expect(selectionPayload(c, [3])).toEqual([3])
  })
})

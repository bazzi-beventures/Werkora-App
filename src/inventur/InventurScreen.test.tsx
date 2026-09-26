import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InventurScreen from './InventurScreen'
import { listMyStockCounts } from '../api/inventory'
import type { StockCount } from '../api/inventory'

// Spec docs/specs/rollierende-inventur.md §10.5.
//
// Der Screen ist der Grund, warum ein Lagerist ohne Admin-Rolle überhaupt
// zählen kann (E8). Ohne ihn bekäme genau der Empfänger, für den die Tranche
// gedacht ist, eine Meldung über eine Arbeit, die er nirgends tun kann.

vi.mock('../api/inventory', () => ({
  listMyStockCounts: vi.fn(),
  getStockCount: vi.fn().mockResolvedValue({
    count: {
      id: 'c1', kind: 'rollierend', status: 'offen', title: 'Inventur KW 39', scope: {},
      started_at: '', started_by: '', closed_at: null, closed_by: null, note: null,
      diff_value_ek: null, due_on: null,
    },
    items: [{
      id: 'i1', count_id: 'c1', material_id: 'm1', art_nr: 'A-1', name: 'Schraube 4x40',
      unit: 'Stk', kategorie: null, expected_at_start: 100, counted_qty: null,
      counted_at: null, counted_by: null, expected_at_count: null, diff: null,
      cost_price_snapshot: null, cost_price: null, note: null, image_url: null,
    }],
    progress: { gezaehlt: 0, gesamt: 1 },
  }),
  recordCountItem: vi.fn(),
  closeStockCount: vi.fn(),
}))

const mockListe = vi.mocked(listMyStockCounts)

function count(over: Partial<StockCount> = {}): StockCount {
  return {
    id: 'c1', kind: 'rollierend', status: 'offen', title: 'Inventur KW 39',
    scope: {}, started_at: '2026-09-21T06:30:00Z', started_by: 'Werkora',
    closed_at: null, closed_by: null, note: null, diff_value_ek: null,
    due_on: '2026-09-27', assigned_to: 'u1',
    progress: { gezaehlt: 8, gesamt: 20 },
    ...over,
  }
}

beforeEach(() => {
  mockListe.mockReset()
  mockListe.mockResolvedValue({ rows: [count()] })
})

describe('Inventur in der Monteur-App', () => {
  it('nennt Zählung, Restmenge und Frist', async () => {
    render(<InventurScreen onBack={vi.fn()} />)
    expect(await screen.findByText('Inventur KW 39')).toBeTruthy()
    expect(screen.getByText(/12 von 20 noch zu zählen/)).toBeTruthy()
    expect(screen.getByText(/fällig/)).toBeTruthy()
  })

  it('sagt es, wenn nichts offen ist — statt einer leeren Fläche', async () => {
    mockListe.mockResolvedValue({ rows: [] })
    render(<InventurScreen onBack={vi.fn()} />)
    expect(await screen.findByText(/keine Zählung offen/)).toBeTruthy()
  })

  it('markiert eine überfällige Tranche als solche', async () => {
    mockListe.mockResolvedValue({ rows: [count({ due_on: '2020-01-01' })] })
    render(<InventurScreen onBack={vi.fn()} />)
    expect(await screen.findByText(/überfällig seit/)).toBeTruthy()
  })

  it('öffnet den Zählmodus mit einem Tipp', async () => {
    render(<InventurScreen onBack={vi.fn()} />)
    fireEvent.click(await screen.findByText('Inventur KW 39'))
    // Der Wizard übernimmt: derselbe Titel, aber mit Fortschrittszeile.
    expect(await screen.findByText(/0 von 1 gezählt/)).toBeTruthy()
  })

  it('springt mit initialCountId direkt in die Zählung', async () => {
    // Der Weg aus einer Push (#/inventur/<id>) — ohne Umweg über die Liste.
    render(<InventurScreen onBack={vi.fn()} initialCountId="c1" />)
    expect(await screen.findByText(/0 von 1 gezählt/)).toBeTruthy()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CountDetail from './CountDetail'
import { getStockCount as getAdmin } from '../../api/admin/inventory'
import { getStockCount as getGeteilt } from '../../api/inventory'
import type { StockCountDetail, StockCountItem } from '../../api/inventory'

// Spec docs/specs/rollierende-inventur.md §10.3.
//
// Am Schreibtisch gleicht man ab, im Lager zählt man — dieselbe Zählung,
// zwei Aufgaben. Deshalb ist der Zählmodus ein Umschalter und keine
// Einbahnstrasse: Wer am Tablet im Regal steht, will ihn auch dort, und wer
// am Handy nur nachsehen will, kommt zurück auf die Liste.
//
// Die Vorauswahl am Handy prüft dieser Test nicht — `useIsMobile` hängt an
// `matchMedia`, und was hier zählt, ist der Umschalter selbst.

vi.mock('../../api/admin/inventory', () => ({
  getStockCount: vi.fn(),
  recordCountItem: vi.fn(),
  closeStockCount: vi.fn(),
  abortStockCount: vi.fn(),
  downloadStockCountCsv: vi.fn(),
}))

vi.mock('../../api/inventory', () => ({
  getStockCount: vi.fn(),
  recordCountItem: vi.fn(),
  closeStockCount: vi.fn(),
}))

const mockAdmin = vi.mocked(getAdmin)
const mockGeteilt = vi.mocked(getGeteilt)

function position(over: Partial<StockCountItem> = {}): StockCountItem {
  return {
    id: 'i1', count_id: 'c1', material_id: 'm1', art_nr: 'A-1', name: 'Endkappe',
    unit: 'Stk', kategorie: 'Storen', expected_at_start: 10,
    counted_qty: null, counted_at: null, counted_by: null,
    expected_at_count: null, diff: null, cost_price_snapshot: null, cost_price: 4,
    note: null, image_url: null, ...over,
  }
}

function detail(status: 'offen' | 'abgeschlossen' = 'offen'): StockCountDetail {
  return {
    count: {
      id: 'c1', kind: 'rollierend', status, title: 'Inventur KW 39', scope: {},
      started_at: '2026-09-21T06:30:00Z', started_by: 'Werkora',
      closed_at: null, closed_by: null, note: null, diff_value_ek: null, due_on: null,
    },
    items: [position()],
    progress: { gezaehlt: 0, gesamt: 1 },
  }
}

beforeEach(() => {
  mockAdmin.mockReset()
  mockGeteilt.mockReset()
  mockAdmin.mockResolvedValue(detail())
  mockGeteilt.mockResolvedValue(detail())
})

describe('Zählmodus im Admin', () => {
  it('schaltet zwischen Tabelle und Zählmodus hin und her', async () => {
    render(<CountDetail countId="c1" onBack={vi.fn()} />)

    // Tabelle: der Umschalter «Soll anzeigen» gibt es nur dort.
    expect(await screen.findByText('Soll anzeigen')).toBeTruthy()

    fireEvent.click(screen.getByText('Zählmodus'))
    expect(await screen.findByText('Als Liste')).toBeTruthy()
    expect(screen.queryByText('Soll anzeigen')).toBeNull()
    // Der Zählmodus holt die Bilder — die Tabelle zahlt nicht dafür.
    expect(mockGeteilt).toHaveBeenCalledWith('c1', { images: true })
    expect(mockAdmin).toHaveBeenCalledWith('c1')

    fireEvent.click(screen.getByText('Als Liste'))
    expect(await screen.findByText('Soll anzeigen')).toBeTruthy()
  })

  it('bietet den Zählmodus bei einer abgeschlossenen Zählung nicht an', async () => {
    // Dort gibt es nichts mehr einzutragen — der Knopf führte in eine Maske,
    // deren «Abschliessen» am Server scheitern müsste.
    mockAdmin.mockResolvedValue(detail('abgeschlossen'))
    render(<CountDetail countId="c1" onBack={vi.fn()} />)

    expect(await screen.findByText('Soll anzeigen')).toBeTruthy()
    expect(screen.queryByText('Zählmodus')).toBeNull()
  })
})

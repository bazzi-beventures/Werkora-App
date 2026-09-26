import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CountWizard, { parseMenge } from './CountWizard'
import { closeStockCount, getStockCount, recordCountItem } from '../../api/inventory'
import type { StockCountDetail, StockCountItem } from '../../api/inventory'

// Spec docs/specs/rollierende-inventur.md §10.3.
//
// Die Regeln, die diese Datei festhält — jede eine, an der es im Lager scheitert:
//
// 1. Gespeichert wird bei jedem «Weiter», nicht am Ende. Ein Handy, das im
//    Regal ausgeht, kostet sonst die ganze Zählung.
// 2. Ein Speicherfehler bleibt auf der Position stehen. Springt die Maske
//    weiter, ist die Position ungezählt und niemand hat es gesehen.
// 3. «Überspringen» lässt die Menge auf `null` — es behauptet nichts über Ware,
//    die niemand angesehen hat.
// 4. Eingestiegen wird an der ersten ungezählten Position, nicht bei eins.

vi.mock('../../api/inventory', () => ({
  getStockCount: vi.fn(),
  recordCountItem: vi.fn(),
  closeStockCount: vi.fn(),
}))

const mockGet = vi.mocked(getStockCount)
const mockRecord = vi.mocked(recordCountItem)
const mockClose = vi.mocked(closeStockCount)

function item(over: Partial<StockCountItem> = {}): StockCountItem {
  return {
    id: 'i1', count_id: 'c1', material_id: 'm1', art_nr: 'A-1', name: 'Schraube 4x40',
    unit: 'Stk', kategorie: 'Befestigung', expected_at_start: 100,
    counted_qty: null, counted_at: null, counted_by: null,
    expected_at_count: null, diff: null, cost_price_snapshot: null, cost_price: null,
    note: null, image_url: null,
    ...over,
  }
}

function detail(items: StockCountItem[], over: Partial<StockCountDetail['count']> = {}): StockCountDetail {
  return {
    count: {
      id: 'c1', kind: 'rollierend', status: 'offen', title: 'Inventur KW 39',
      scope: {}, started_at: '2026-09-21T06:30:00Z', started_by: 'Werkora',
      closed_at: null, closed_by: null, note: null, diff_value_ek: null,
      due_on: '2026-09-27', assigned_to: 'u1',
      ...over,
    },
    items,
    progress: { gezaehlt: items.filter(i => i.counted_qty != null).length, gesamt: items.length },
  }
}

beforeEach(() => {
  mockGet.mockReset()
  mockRecord.mockReset()
  mockClose.mockReset()
})

describe('parseMenge', () => {
  it('nimmt das Komma als Dezimaltrenner', () => {
    // Auf der Schweizer Handytastatur liegt es näher als der Punkt, und
    // `parseFloat('2,5')` wäre stillschweigend 2 — eine halbe Rolle Kabel.
    expect(parseMenge('2,5')).toBe(2.5)
    expect(parseMenge('2.5')).toBe(2.5)
  })

  it('lehnt ab, was keine Menge ist', () => {
    expect(parseMenge('')).toBeNull()
    expect(parseMenge('  ')).toBeNull()
    expect(parseMenge('-1')).toBeNull()
    expect(parseMenge('viele')).toBeNull()
  })

  it('lässt die Null durch', () => {
    // «Nichts mehr da» ist eine Zählung, kein fehlender Wert.
    expect(parseMenge('0')).toBe(0)
  })
})

describe('Zählmodus', () => {
  it('zeigt einen Artikel und den Fortschritt', async () => {
    mockGet.mockResolvedValue(detail([item(), item({ id: 'i2', name: 'Dübel 8' })]))
    render(<CountWizard countId="c1" onBack={vi.fn()} />)

    expect(await screen.findByText('Schraube 4x40')).toBeTruthy()
    expect(screen.getByText(/0 von 2 gezählt/)).toBeTruthy()
    expect(screen.getByText(/Position 1 von 2/)).toBeTruthy()
    // Bilder brauchen einen eigenen Signier-Request — der Zählmodus fragt danach.
    expect(mockGet).toHaveBeenCalledWith('c1', { images: true })
  })

  it('speichert bei «Weiter» und geht zur nächsten Position', async () => {
    mockGet.mockResolvedValue(detail([item(), item({ id: 'i2', name: 'Dübel 8' })]))
    mockRecord.mockResolvedValue({ status: 'ok', item: item({ counted_qty: 42 }) })
    render(<CountWizard countId="c1" onBack={vi.fn()} />)

    fireEvent.change(await screen.findByLabelText(/Gezählte Menge/), { target: { value: '42' } })
    fireEvent.click(screen.getByText('Weiter'))

    await waitFor(() => expect(mockRecord).toHaveBeenCalledWith('c1', 'i1', 42, null))
    expect(await screen.findByText('Dübel 8')).toBeTruthy()
  })

  it('bleibt bei einem Speicherfehler auf der Position stehen', async () => {
    mockGet.mockResolvedValue(detail([item(), item({ id: 'i2', name: 'Dübel 8' })]))
    mockRecord.mockRejectedValue(new Error('Serverfehler'))
    render(<CountWizard countId="c1" onBack={vi.fn()} />)

    fireEvent.change(await screen.findByLabelText(/Gezählte Menge/), { target: { value: '7' } })
    fireEvent.click(screen.getByText('Weiter'))

    expect(await screen.findByText('Serverfehler')).toBeTruthy()
    // Immer noch Position 1 — ein stiller Sprung liesse sie ungezählt zurück.
    expect(screen.getByText('Schraube 4x40')).toBeTruthy()
    expect(screen.getByText(/Position 1 von 2/)).toBeTruthy()
  })

  it('verlangt eine Menge, bevor es weitergeht', async () => {
    mockGet.mockResolvedValue(detail([item(), item({ id: 'i2' })]))
    render(<CountWizard countId="c1" onBack={vi.fn()} />)

    fireEvent.click(await screen.findByText('Weiter'))
    expect(await screen.findByText(/Menge von 0 oder mehr/)).toBeTruthy()
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('überspringt ohne zu speichern', async () => {
    mockGet.mockResolvedValue(detail([item(), item({ id: 'i2', name: 'Dübel 8' })]))
    render(<CountWizard countId="c1" onBack={vi.fn()} />)

    fireEvent.click(await screen.findByText('Überspringen'))
    expect(await screen.findByText('Dübel 8')).toBeTruthy()
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('steigt an der ersten ungezählten Position ein', async () => {
    mockGet.mockResolvedValue(detail([
      item({ counted_qty: 10 }),
      item({ id: 'i2', name: 'Dübel 8' }),
    ]))
    render(<CountWizard countId="c1" onBack={vi.fn()} />)

    // Nicht bei «Schraube»: Wer fortsetzt, will nicht an Erledigtem vorbeitippen.
    expect(await screen.findByText('Dübel 8')).toBeTruthy()
  })

  it('zeigt am Ende die Zusammenfassung und schliesst ab', async () => {
    mockGet.mockResolvedValue(detail([item({ counted_qty: 10 }), item({ id: 'i2' })]))
    mockClose.mockResolvedValue({
      status: 'ok',
      summary: { positionen: 2, gezaehlt: 1, offen: 1, mit_differenz: 1, diff_value_ek: -12.5, ohne_ek: 0 },
    })
    render(<CountWizard countId="c1" onBack={vi.fn()} />)

    fireEvent.click(await screen.findByText('Überspringen'))
    expect(await screen.findByText('1 gezählt')).toBeTruthy()
    expect(screen.getByText(/1 übersprungen/)).toBeTruthy()

    fireEvent.click(screen.getByText('Abschliessen'))
    fireEvent.click(await screen.findByText('Abschliessen und buchen'))
    await waitFor(() => expect(mockClose).toHaveBeenCalledWith('c1'))
    expect(await screen.findByText('Abgeschlossen')).toBeTruthy()
  })

  it('kennzeichnet übernommene Positionen', async () => {
    // Sie standen schon auf der letzten Liste — das gehört zur Zählung dazu
    // (Spec E4).
    mockGet.mockResolvedValue(detail([item()], { scope: { carried_material_ids: ['m1'] } }))
    render(<CountWizard countId="c1" onBack={vi.fn()} />)
    expect(await screen.findByText('übernommen')).toBeTruthy()
  })

  it('zeigt den Umschalter nur, wenn es eine Liste gibt', async () => {
    mockGet.mockResolvedValue(detail([item()]))
    const { rerender } = render(<CountWizard countId="c1" onBack={vi.fn()} />)
    expect(await screen.findByText('Schraube 4x40')).toBeTruthy()
    expect(screen.queryByText('Als Liste')).toBeNull()

    rerender(<CountWizard countId="c1" onBack={vi.fn()} onSwitchToList={vi.fn()} />)
    expect(await screen.findByText('Als Liste')).toBeTruthy()
  })
})

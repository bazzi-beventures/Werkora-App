import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CountDetail from './CountDetail'
import { closeStockCount, getStockCount, recordCountItem } from '../../api/admin/inventory'
import type { StockCountDetail, StockCountItem } from '../../api/admin/inventory'

// Spec docs/specs/lager-bestandsfuehrung.md §8, §11.
//
// Die zwei Regeln, die diese Datei festhält:
// 1. Verdeckt zählen — der Soll-Bestand ist ausgeblendet. Wer die Zahl sieht,
//    zählt sie ab statt nach, und eine Inventur, die das Erwartete bestätigt,
//    hat nichts geprüft.
// 2. Ungezählte Positionen werden nicht stillschweigend als «stimmt» gebucht.

vi.mock('../../api/admin/inventory', () => ({
  getStockCount: vi.fn(),
  recordCountItem: vi.fn(),
  closeStockCount: vi.fn(),
  abortStockCount: vi.fn(),
  downloadStockCountCsv: vi.fn(),
}))

const mockLaden = vi.mocked(getStockCount)
const mockSchreiben = vi.mocked(recordCountItem)
const mockAbschluss = vi.mocked(closeStockCount)

function position(over: Partial<StockCountItem> = {}): StockCountItem {
  return {
    id: 'i1', count_id: 'c1', material_id: 'm1', art_nr: 'A-1', name: 'Endkappe',
    unit: 'Stk', kategorie: 'Storen', expected_at_start: 10,
    counted_qty: null, counted_at: null, counted_by: null,
    expected_at_count: null, diff: null, cost_price_snapshot: null, cost_price: 4,
    note: null, ...over,
  }
}

function detail(items: StockCountItem[], over: Partial<StockCountDetail['count']> = {}): StockCountDetail {
  return {
    count: {
      id: 'c1', kind: 'voll', status: 'offen', title: 'Jahresinventur 2026', scope: {},
      started_at: '2026-09-19T06:00:00+00:00', started_by: 'Chef',
      closed_at: null, closed_by: null, note: null, diff_value_ek: null, ...over,
    },
    items,
    progress: { gezaehlt: items.filter(i => i.counted_qty != null).length, gesamt: items.length },
  }
}

beforeEach(() => {
  mockLaden.mockReset()
  mockSchreiben.mockReset()
  mockAbschluss.mockReset()
  mockLaden.mockResolvedValue(detail([position()]))
  mockSchreiben.mockImplementation(async (_c, _i, qty) => ({
    status: 'success', item: position({ counted_qty: qty }),
  }))
})

describe('Zählmaske', () => {
  it('blendet den Soll-Bestand aus, bis jemand ihn ausdrücklich sehen will', async () => {
    render(<CountDetail countId="c1" onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Endkappe')).toBeInTheDocument())

    expect(screen.queryByText('10 Stk')).not.toBeInTheDocument()
    expect(screen.getByText(/zählt sie ab statt nach/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Soll anzeigen'))
    expect(screen.getByText('10 Stk')).toBeInTheDocument()
  })

  it('speichert die gezählte Menge beim Verlassen des Feldes', async () => {
    render(<CountDetail countId="c1" onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Endkappe')).toBeInTheDocument())

    const feld = screen.getByLabelText('Gezählte Menge Endkappe')
    fireEvent.change(feld, { target: { value: '8' } })
    fireEvent.blur(feld)

    await waitFor(() => expect(mockSchreiben).toHaveBeenCalledWith('c1', 'i1', 8))
  })

  it('springt mit Enter zur nächsten Position — im Lager tippt man einhändig', async () => {
    mockLaden.mockResolvedValue(detail([
      position(),
      position({ id: 'i2', material_id: 'm2', art_nr: 'A-2', name: 'Kurbel' }),
    ]))
    render(<CountDetail countId="c1" onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Kurbel')).toBeInTheDocument())

    const erstes = screen.getByLabelText('Gezählte Menge Endkappe')
    fireEvent.change(erstes, { target: { value: '8' } })
    fireEvent.keyDown(erstes, { key: 'Enter' })

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Gezählte Menge Kurbel')))
  })

  it('leeres Feld macht die Position wieder ungezählt', async () => {
    mockLaden.mockResolvedValue(detail([position({ counted_qty: 8 })]))
    render(<CountDetail countId="c1" onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Endkappe')).toBeInTheDocument())

    const feld = screen.getByLabelText('Gezählte Menge Endkappe')
    fireEvent.change(feld, { target: { value: '' } })
    fireEvent.blur(feld)

    await waitFor(() => expect(mockSchreiben).toHaveBeenCalledWith('c1', 'i1', null))
  })

  it('nennt im Abschluss-Dialog die ungezählten Positionen', async () => {
    mockLaden.mockResolvedValue(detail([
      position({ counted_qty: 8 }),
      position({ id: 'i2', material_id: 'm2', art_nr: 'A-2', name: 'Kurbel' }),
    ]))
    render(<CountDetail countId="c1" onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Kurbel')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Abschliessen' }))
    expect(screen.getByText(/1 Position\(en\) hat niemand angesehen/)).toBeInTheDocument()
    expect(mockAbschluss).not.toHaveBeenCalled()
  })

  it('sperrt den Abschluss, solange nichts gezählt wurde', async () => {
    render(<CountDetail countId="c1" onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Endkappe')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Abschliessen' })).toBeDisabled()
  })

  it('sagt nach dem Abschluss, wie viele Positionen ohne Einkaufspreis fehlen', async () => {
    mockLaden.mockResolvedValue(detail([position({ counted_qty: 8 })]))
    mockAbschluss.mockResolvedValue({
      status: 'success',
      summary: { positionen: 1, gezaehlt: 1, offen: 0, mit_differenz: 1, diff_value_ek: -8, ohne_ek: 1 },
    })
    render(<CountDetail countId="c1" onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Endkappe')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Abschliessen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abschliessen und buchen' }))

    await waitFor(() =>
      expect(screen.getByText(/keinen Einkaufspreis/)).toBeInTheDocument())
  })

  it('zeigt bei abgeschlossener Zählung die Abweichung statt Eingabefeldern', async () => {
    mockLaden.mockResolvedValue(detail(
      [position({ counted_qty: 8, expected_at_count: 10, diff: -2 })],
      { status: 'abgeschlossen', diff_value_ek: -8 },
    ))
    render(<CountDetail countId="c1" onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Endkappe')).toBeInTheDocument())

    expect(screen.queryByLabelText('Gezählte Menge Endkappe')).not.toBeInTheDocument()
    expect(screen.getByText('-2 Stk')).toBeInTheDocument()
    expect(screen.getByText(/Differenz CHF -8.00/)).toBeInTheDocument()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AnomalyList from './AnomalyList'
import { createStockCount, ignoreAnomaly, listAnomalies } from '../../api/admin/inventory'
import type { StockAnomaly, StockCount } from '../../api/admin/inventory'

// Spec docs/specs/lager-bestandsfuehrung.md §9, §10.
//
// Zwei Regeln halten diese Datei fest:
// 1. Jeder Befund trägt seine Empfehlung. Ein Befund ohne Handlungsanweisung
//    wird zur Kenntnis genommen und vergessen.
// 2. Der Systemfehler «Drift» ist nicht durch Zählen zu beheben — er braucht
//    einen Fix, keine Nachzählung.

vi.mock('../../api/admin/inventory', () => ({
  listAnomalies: vi.fn(),
  ignoreAnomaly: vi.fn(),
  createStockCount: vi.fn(),
}))

const mockListe = vi.mocked(listAnomalies)
const mockIgnorieren = vi.mocked(ignoreAnomaly)
const mockZaehlung = vi.mocked(createStockCount)

function befund(over: Partial<StockAnomaly> = {}): StockAnomaly {
  return {
    id: 'a1', material_id: 'm1', art_nr: 'A-1', name: 'Endkappe', unit: 'Stk',
    kind: 'negativ', severity: 'hoch', detail: { qty: -3 },
    detected_at: '2026-09-19T02:00:00+00:00', count_id: null,
    text: 'Bestand im Minus — Rapport prüfen oder fehlende Lieferung buchen.',
    ...over,
  }
}

/** Minimaler Zählungs-Kopf — hier zählt nur die id, an der die Maske weiterspringt. */
function zaehlung(id: string): StockCount {
  return {
    id, kind: 'stich', status: 'offen', title: 'Nachzählung', scope: {},
    started_at: '2026-09-19T12:00:00+00:00', started_by: 'Chef',
    closed_at: null, closed_by: null, note: null, diff_value_ek: null,
  }
}

function antwort(rows: StockAnomaly[]) {
  return { rows, summary: { hoch: rows.filter(r => r.severity === 'hoch').length, gesamt: rows.length } }
}

beforeEach(() => {
  mockListe.mockReset()
  mockIgnorieren.mockReset()
  mockZaehlung.mockReset()
  mockListe.mockResolvedValue(antwort([befund()]))
  mockIgnorieren.mockResolvedValue(undefined)
})

describe('Auffälligkeiten', () => {
  it('zeigt zu jedem Befund, was zu tun ist', async () => {
    render(<AnomalyList />)
    await waitFor(() => expect(screen.getByText('Endkappe')).toBeInTheDocument())
    expect(screen.getByText(/Rapport prüfen oder fehlende Lieferung buchen/)).toBeInTheDocument()
  })

  it('bietet für einen Systemfehler keine Nachzählung an', async () => {
    mockListe.mockResolvedValue(antwort([
      befund({ kind: 'drift', text: 'Bestand weicht vom Journal ab — an Werkora melden.' }),
    ]))
    render(<AnomalyList />)
    await waitFor(() => expect(screen.getByText('Systemfehler')).toBeInTheDocument())
    expect(screen.queryByLabelText('Endkappe nachzählen')).not.toBeInTheDocument()
  })

  it('legt aus der Auswahl eine Stichzählung an', async () => {
    mockListe.mockResolvedValue(antwort([
      befund(),
      befund({ id: 'a2', material_id: 'm2', name: 'Kurbel', kind: 'ausreisser', severity: 'mittel' }),
    ]))
    mockZaehlung.mockResolvedValue({
      status: 'success', positionen: 2, count: zaehlung('c1'),
    })
    render(<AnomalyList />)
    await waitFor(() => expect(screen.getByText('Kurbel')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Endkappe nachzählen'))
    fireEvent.click(screen.getByLabelText('Kurbel nachzählen'))
    fireEvent.click(screen.getByRole('button', { name: '2 Artikel nachzählen' }))

    await waitFor(() => expect(mockZaehlung).toHaveBeenCalled())
    expect(mockZaehlung.mock.calls[0][0].anomaly_ids).toEqual(['a1', 'a2'])
    expect(mockZaehlung.mock.calls[0][0].kind).toBe('stich')
  })

  it('verlangt beim Stilllegen eine Begründung', async () => {
    render(<AnomalyList />)
    await waitFor(() => expect(screen.getByText('Endkappe')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Stilllegen' }))
    const bestaetigen = screen.getAllByRole('button', { name: 'Stilllegen' })
      .find(b => b.classList.contains('admin-btn-primary')
        || b.closest('.admin-confirm-overlay, .admin-modal') !== null)
    expect(bestaetigen).toBeDefined()
    expect(bestaetigen).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Begründung'), { target: { value: 'Rest wird verbaut' } })
    expect(bestaetigen).toBeEnabled()

    fireEvent.click(bestaetigen as HTMLElement)
    await waitFor(() => expect(mockIgnorieren).toHaveBeenCalledWith('a1', 'Rest wird verbaut'))
  })

  it('sagt es, wenn nichts auffällig ist', async () => {
    mockListe.mockResolvedValue(antwort([]))
    render(<AnomalyList />)
    await waitFor(() => expect(screen.getByText(/Nichts Auffälliges/)).toBeInTheDocument())
  })
})

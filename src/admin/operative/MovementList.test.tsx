import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MovementList from './MovementList'
import { listStockMovements } from '../../api/admin/inventory'
import type { StockMovement } from '../../api/admin/inventory'

// Spec docs/specs/lager-bestandsfuehrung.md §4.1, §10.
//
// Der Punkt dieser Datei: Bewegungen von vor dem 19.09.2026 tragen keinen
// Bestand. Er ist nicht rekonstruierbar, weil die damals still verlorenen
// Korrekturen fehlen. Die Liste muss dort «—» zeigen. Eine gerechnete Zahl
// wäre eine Behauptung — und ausgerechnet beim Nachzählen die falsche.

vi.mock('../../api/admin/inventory', () => ({ listStockMovements: vi.fn() }))

const mockListe = vi.mocked(listStockMovements)

function bewegung(over: Partial<StockMovement> = {}): StockMovement {
  return {
    id: 'm1',
    created_at: '2026-09-19T08:30:00+00:00',
    movement_type: 'usage',
    movement_label: 'Verbrauch',
    quantity_delta: -3,
    balance_after: 7,
    note: null,
    created_by: 'Max',
    reference: { kind: 'report', id: '12', label: 'Rapport #12' },
    ...over,
  }
}

function antwort(rows: StockMovement[], total = rows.length) {
  return { rows, total, page: 1, page_size: 20 }
}

beforeEach(() => { mockListe.mockReset() })

describe('Bewegungsjournal', () => {
  it('zeigt «—» statt eines gerechneten Bestands, wenn keiner überliefert ist', async () => {
    mockListe.mockResolvedValue(antwort([
      bewegung({ id: 'alt', balance_after: null, movement_label: 'Korrektur', reference: null }),
    ]))
    render(<MovementList artNr="A-1" unit="Stk" />)
    await waitFor(() => expect(screen.getByText(/Bestand: —/)).toBeInTheDocument())
  })

  it('zeigt den Bestand nach der Buchung, wenn er überliefert ist', async () => {
    mockListe.mockResolvedValue(antwort([bewegung()]))
    render(<MovementList artNr="A-1" unit="Stk" />)
    await waitFor(() => expect(screen.getByText(/Bestand: 7/)).toBeInTheDocument())
  })

  it('zeigt Zugänge mit Pluszeichen, Abgänge ohne', async () => {
    mockListe.mockResolvedValue(antwort([
      bewegung({ id: 'a', quantity_delta: 10, movement_label: 'Lieferung' }),
      bewegung({ id: 'b', quantity_delta: -3 }),
    ]))
    render(<MovementList artNr="A-1" unit="Stk" />)
    await waitFor(() => expect(screen.getByText('+10')).toBeInTheDocument())
    expect(screen.getByText('-3')).toBeInTheDocument()
  })

  it('nennt den Beleg, damit die Buchung nachvollziehbar bleibt', async () => {
    mockListe.mockResolvedValue(antwort([bewegung()]))
    render(<MovementList artNr="A-1" unit="Stk" />)
    await waitFor(() => expect(screen.getByText(/Rapport #12/)).toBeInTheDocument())
  })

  it('sagt es, wenn noch nichts gebucht wurde', async () => {
    mockListe.mockResolvedValue(antwort([]))
    render(<MovementList artNr="A-1" unit="Stk" />)
    await waitFor(() => expect(screen.getByText(/Noch keine Bewegungen/)).toBeInTheDocument())
  })

  it('meldet einen Ladefehler, statt eine leere Liste vorzutäuschen', async () => {
    mockListe.mockRejectedValue(new Error('Netz weg'))
    render(<MovementList artNr="A-1" unit="Stk" />)
    await waitFor(() => expect(screen.getByText(/Netz weg/)).toBeInTheDocument())
  })
})

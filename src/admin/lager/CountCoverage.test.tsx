import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CountCoverageTabelle, { abdeckungFarbe, alterAusserhalb } from './CountCoverage'
import { createStockCount, getCountCoverage } from '../../api/admin/inventory'
import type { CountCoverage } from '../../api/admin/inventory'

// Spec docs/specs/rollierende-inventur.md §9 Punkt 2.
//
// Die Regel, die diese Datei festhält: Neben jeder Zahl steht eine Handlung.
// Eine Kennzahl, aus der nichts folgt, wird beim dritten Mal nicht mehr
// gelesen — und «Motoren: 0 % Abdeckung» ohne den Weg zu «Motoren: 5 pro
// Woche» ist genau so eine.
//
// Die zweite Regel ist die unscheinbarere: «Kategorie zählen» nimmt nur die
// ungezählten und nicht gesperrten Artikel. Eine Stichzählung über die ganze
// Kategorie zählte noch einmal, was letzte Woche dran war.

vi.mock('../../api/admin/inventory', () => ({
  getCountCoverage: vi.fn(),
  createStockCount: vi.fn(),
}))

const mockStand = vi.mocked(getCountCoverage)
const mockAnlegen = vi.mocked(createStockCount)

function stand(over: Partial<CountCoverage> = {}): CountCoverage {
  return {
    fenster_tage: 365,
    gesamt: {
      artikel: 3, nie_gezaehlt: 1, aelter_als_fenster: 1, in_offener_zaehlung: 0,
      gezaehlt_im_fenster: 1, abdeckung_pct: 33.3, aeltester: '2024-01-01T00:00:00+00:00',
      lagerwert_ungezaehlt: 820,
    },
    kategorien: [
      {
        kategorie: 'Motoren', artikel: 2, nie_gezaehlt: 1, aelter_als_fenster: 1,
        in_offener_zaehlung: 0, gezaehlt_im_fenster: 0, abdeckung_pct: 0,
        aeltester: '2024-01-01T00:00:00+00:00', lagerwert_ungezaehlt: 820,
        plan_id: null, eigener_plan: false,
      },
      {
        kategorie: 'Storen', artikel: 1, nie_gezaehlt: 0, aelter_als_fenster: 0,
        in_offener_zaehlung: 0, gezaehlt_im_fenster: 1, abdeckung_pct: 100,
        aeltester: '2026-09-20T00:00:00+00:00', lagerwert_ungezaehlt: 0,
        plan_id: 'p1', eigener_plan: true,
      },
    ],
    artikel: [
      {
        material_id: 'm1', art_nr: 'A-1', name: 'Rohrmotor 30Nm', kategorie: 'Motoren',
        unit: 'Stk', quantity: 4, lagerwert: 800, last_counted_at: null,
        in_offener_zaehlung: false,
      },
      {
        material_id: 'm2', art_nr: 'A-2', name: 'Altmotor', kategorie: 'Motoren',
        unit: 'Stk', quantity: 1, lagerwert: 20,
        last_counted_at: '2024-01-01T00:00:00+00:00', in_offener_zaehlung: false,
      },
      {
        material_id: 'm3', art_nr: 'A-3', name: 'Endkappe', kategorie: 'Storen',
        unit: 'Stk', quantity: 9, lagerwert: 10,
        last_counted_at: '2026-09-20T00:00:00+00:00', in_offener_zaehlung: false,
      },
    ],
    ...over,
  }
}

beforeEach(() => {
  mockStand.mockReset()
  mockAnlegen.mockReset()
  mockStand.mockResolvedValue(stand())
})

describe('abdeckungFarbe', () => {
  it('folgt den Stufen aus der Spec', () => {
    expect(abdeckungFarbe(20)).toBe('var(--danger)')
    expect(abdeckungFarbe(70)).toBe('var(--warning, #b45309)')
    expect(abdeckungFarbe(95)).toBe('var(--success, #16a34a)')
  })

  it('ist grau, wenn es nichts zu zählen gibt', () => {
    // `null` heisst «keine Artikel» — nicht «0 % gezählt».
    expect(abdeckungFarbe(null)).toBe('var(--muted)')
  })
})

describe('alterAusserhalb', () => {
  const heute = new Date('2026-09-22T00:00:00Z')

  it('zieht die Grenze bei genau 365 Tagen', () => {
    expect(alterAusserhalb('2025-09-22T00:00:00Z', 365, heute)).toBe(false)
    expect(alterAusserhalb('2025-09-21T00:00:00Z', 365, heute)).toBe(true)
  })

  it('behandelt ein unlesbares Datum wie «nie»', () => {
    expect(alterAusserhalb('irgendwann', 365, heute)).toBe(true)
  })
})

describe('Zählstand nach Kategorie', () => {
  it('nennt Abdeckung, Rückstand und ungezählten Lagerwert', async () => {
    render(<CountCoverageTabelle onOeffnen={vi.fn()} onPlanAnlegen={vi.fn()} />)
    expect(await screen.findByText('▸ Motoren')).toBeTruthy()
    expect(screen.getByText(/33 %/)).toBeTruthy()          // Gesamt
    expect(screen.getByText(/CHF 820.00 ungezählter Lagerwert/)).toBeTruthy()
  })

  it('klappt die Artikel einer Kategorie auf', async () => {
    // Ohne das müsste man für «welche Motoren?» in den Reiter Lager wechseln
    // und dort erneut suchen.
    render(<CountCoverageTabelle onOeffnen={vi.fn()} onPlanAnlegen={vi.fn()} />)
    fireEvent.click(await screen.findByText('▸ Motoren'))
    expect(await screen.findByText('Rohrmotor 30Nm')).toBeTruthy()
    expect(screen.queryByText('Endkappe')).toBeNull()
  })

  it('bietet «Plan anlegen» nur ohne eigenen Plan an', async () => {
    const onPlanAnlegen = vi.fn()
    render(<CountCoverageTabelle onOeffnen={vi.fn()} onPlanAnlegen={onPlanAnlegen} />)
    const knoepfe = await screen.findAllByText('Plan anlegen')
    expect(knoepfe).toHaveLength(1)      // Storen hat schon einen
    fireEvent.click(knoepfe[0])
    expect(onPlanAnlegen).toHaveBeenCalledWith('Motoren')
  })

  it('zählt nur die ungezählten Artikel einer Kategorie nach', async () => {
    mockAnlegen.mockResolvedValue({ status: 'ok', count: { id: 'c9' } as never, positionen: 2 })
    const onOeffnen = vi.fn()
    render(<CountCoverageTabelle onOeffnen={onOeffnen} onPlanAnlegen={vi.fn()} />)

    fireEvent.click((await screen.findAllByText('Kategorie zählen'))[0])
    await waitFor(() => expect(mockAnlegen).toHaveBeenCalled())
    const arg = mockAnlegen.mock.calls[0][0]
    expect(arg.kind).toBe('stich')
    expect(arg.material_ids).toEqual(['m1', 'm2'])   // nie + älter als ein Jahr
    expect(onOeffnen).toHaveBeenCalledWith('c9')
  })

  it('sagt es, wenn in der Kategorie nichts offen ist', async () => {
    // Sonst entstünde eine leere Zählung, und der Fehler käme vom Server.
    render(<CountCoverageTabelle onOeffnen={vi.fn()} onPlanAnlegen={vi.fn()} />)
    fireEvent.click((await screen.findAllByText('Kategorie zählen'))[1])   // Storen
    expect(await screen.findByText(/ist nichts offen/)).toBeTruthy()
    expect(mockAnlegen).not.toHaveBeenCalled()
  })

  it('lässt Artikel über alle Kategorien hinweg suchen', async () => {
    render(<CountCoverageTabelle onOeffnen={vi.fn()} onPlanAnlegen={vi.fn()} />)
    await screen.findByText('▸ Motoren')
    fireEvent.change(screen.getByPlaceholderText(/Artikel suchen/), { target: { value: 'kappe' } })
    expect(await screen.findByText('Endkappe')).toBeTruthy()
  })

  it('sagt es, wenn es gar keine Artikel gibt', async () => {
    mockStand.mockResolvedValue(stand({
      kategorien: [], artikel: [],
      gesamt: {
        artikel: 0, nie_gezaehlt: 0, aelter_als_fenster: 0, in_offener_zaehlung: 0,
        gezaehlt_im_fenster: 0, abdeckung_pct: null, aeltester: null,
        lagerwert_ungezaehlt: 0,
      },
    }))
    render(<CountCoverageTabelle onOeffnen={vi.fn()} onPlanAnlegen={vi.fn()} />)
    expect(await screen.findByText(/Noch keine aktiven Artikel/)).toBeTruthy()
  })
})

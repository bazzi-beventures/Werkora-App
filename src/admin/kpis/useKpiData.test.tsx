import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Kein beforeEach in dieser Datei: mit einem Hook davor meldet Vitest die
// abgelehnte Promise als unbehandelten Fehler, obwohl useKpiData sie fängt —
// der Test scheiterte dann an der Testumgebung statt am Code.
vi.mock('../../api/kpiViews', () => ({
  fetchKpiView: (view: string, filters?: unknown) => fetchKpiView(view, filters),
}))
const fetchKpiView = vi.fn()

import { useKpiData } from './useKpiData'

function Probe({ view, filters }: { view: string; filters?: Record<string, string> }) {
  const { data, loading, error } = useKpiData<{ id: string }>(view, filters)
  if (loading) return <div>laedt</div>
  if (error) return <div>{error}</div>
  return <div>{(data ?? []).map(r => r.id).join(',') || 'leer'}</div>
}

describe('useKpiData', () => {
  it('zeigt eine Meldung statt einer leeren Tabelle, wenn die Abfrage scheitert', async () => {
    // Der Unterschied, auf den es dem Benutzer ankommt: "keine Daten" und
    // "Abfrage kaputt" sähen sonst identisch aus.
    fetchKpiView.mockImplementation(async () => { throw new Error('boom') })
    render(<Probe view="vw_kpi_nutzung_aktion" />)
    expect(await screen.findByText(/konnten nicht geladen werden/)).toBeTruthy()
  })

  it('unterscheidet leer von kaputt', async () => {
    fetchKpiView.mockImplementation(async () => [])
    render(<Probe view="vw_kpi_nutzung_adoption" />)
    expect(await screen.findByText('leer')).toBeTruthy()
  })

  it('gibt den Datumsfilter an die Abfrage weiter', async () => {
    fetchKpiView.mockImplementation(async () => [{ id: 'a' }])
    const filters = { and: '(datum.gte.2026-08-01,datum.lte.2026-08-22)' }
    render(<Probe view="vw_kpi_nutzung_aktion" filters={filters} />)
    await screen.findByText('a')
    expect(fetchKpiView).toHaveBeenCalledWith('vw_kpi_nutzung_aktion', filters)
  })
})

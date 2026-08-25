import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { PipelineProjektRow } from '../types'

// Recharts in jsdom vermeiden (misst 0-Grösse, verrauscht die Tests).
vi.mock('../components/BiBarChart', () => ({ default: () => null }))

const fetchProjektPipeline = vi.fn()
vi.mock('../../../api/kpiViews', () => ({ fetchProjektPipeline: () => fetchProjektPipeline() }))

import PipelineTab from './PipelineTab'

const jahr = new Date().getFullYear()

function row(over: Partial<PipelineProjektRow> = {}): PipelineProjektRow {
  return {
    project_id: 'p-1',
    projekt_nummer: '2600100',
    projekt_name: 'Projekt A',
    projekt_status: 'offen',
    is_closed: false,
    kunde_name: 'Kunde AG',
    customer_id: 'c-1',
    projektleiter_id: 's-1',
    projektleiter_name: 'Hans Muster',
    offerten: [{ status: 'gesendet', betrag: 1200, datum: `${jahr}-05-10` }],
    rapporte: [`${jahr}-05-15`],
    rechnungen: [],
    ...over,
  }
}

const ROWS: PipelineProjektRow[] = [
  row(),
  row({
    project_id: 'p-2',
    projekt_nummer: '2600200',
    projekt_name: 'Projekt B',
    projektleiter_id: 's-2',
    projektleiter_name: 'Vera Beispiel',
    offerten: [{ status: 'akzeptiert', betrag: 800, datum: `${jahr}-06-01` }],
    rapporte: [],
  }),
]

function tables(): HTMLTableElement[] {
  return Array.from(document.querySelectorAll<HTMLTableElement>('table.kpi-bi-table'))
}

function lastTable(): HTMLTableElement {
  const t = tables()
  return t[t.length - 1]
}

beforeEach(() => {
  fetchProjektPipeline.mockReset()
  fetchProjektPipeline.mockResolvedValue(ROWS)
})

describe('PipelineTab — Interaktion', () => {
  it('öffnet beim Klick auf ein Projekt das Drill-down und schliesst es wieder', async () => {
    render(<PipelineTab />)
    await screen.findByText('Projekt A')

    // Projekt-Zeile ist die zweite Tabelle (perProjekt)
    const projektTable = lastTable()
    fireEvent.click(within(projektTable).getByText('Projekt A'))

    // Modal-Detail erscheint — Assertions auf den Dialog scopen (CHF-Beträge
    // tauchen sonst auch in den KPI-Karten auf).
    await screen.findByText('Offerten (1)')
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Kunde AG · Hans Muster/)).toBeInTheDocument()
    expect(within(dialog).getByText("CHF 1'200")).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Schliessen'))
    await waitFor(() => expect(screen.queryByText('Offerten (1)')).not.toBeInTheDocument())
  })

  it('filtert beim Klick auf eine Projektleiter-Zeile — Datumsfilter bleibt intakt', async () => {
    render(<PipelineTab />)
    await screen.findByText('Projekt A')

    // Vorher: beide Projekte sichtbar
    expect(screen.getByText(/2 Projektleiter · 2 Projekte/)).toBeInTheDocument()
    // Default-Datumsfilter "Dieses Jahr" ist aktiv
    const jahrBtn = screen.getByRole('button', { name: 'Dieses Jahr' })
    expect(jahrBtn.className).toContain('active')

    // Klick auf die Projektleiter-Zeile "Vera Beispiel" (erste Tabelle = perLeiter)
    const leiterTable = tables()[0]
    fireEvent.click(within(leiterTable).getByText('Vera Beispiel'))

    // Nur noch Veras Projekt
    await waitFor(() => expect(screen.getByText(/1 Projektleiter · 1 Projekte/)).toBeInTheDocument())
    const projektTable = lastTable()
    expect(within(projektTable).queryByText('Projekt A')).not.toBeInTheDocument()
    expect(within(projektTable).getByText('Projekt B')).toBeInTheDocument()

    // Datumsfilter unverändert aktiv
    expect(screen.getByRole('button', { name: 'Dieses Jahr' }).className).toContain('active')

    // Nochmal klicken hebt den Filter wieder auf
    fireEvent.click(within(tables()[0]).getByText('Vera Beispiel'))
    await waitFor(() => expect(screen.getByText(/2 Projektleiter · 2 Projekte/)).toBeInTheDocument())
  })
})

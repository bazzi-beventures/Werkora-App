import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjekteScreen from './ProjekteScreen'
import { apiFetch, apiFormFetch } from '../api/client'

// Reiter «Aktuell» / «Bearbeitet» über der Kachelliste — für jeden Mandanten, ohne
// Feature. Gemeldet (26.10.2026, Gehlhaar): ein Projekt ohne Termin, auf dem der
// Monteur rapportiert hatte, war unauffindbar und Fotos liessen sich nicht mehr
// nachreichen. Der Server setzt `bearbeitet`, die PWA teilt danach.

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  apiFormFetch: vi.fn(),
  apiUrl: (p: string) => p,
  isNetworkError: () => false,
  ApiError: class ApiError extends Error {
    status: number
    constructor(status = 500, msg = '') { super(msg); this.status = status }
  },
}))

const mockFetch = vi.mocked(apiFetch)

function project(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'MFH Sonnhalde',
    project_id_text: null,
    kind: 'project',
    art_der_arbeit: ['Montage'],
    customer_id: null,
    customer: null,
    object_name: null,
    object_address: null,
    start_date: null,
    end_date: null,
    start_time: null,
    end_time: null,
    kontakte: [],
    bemerkung: null,
    geruestfaecher: [],
    ...over,
  }
}

const PROJEKTE = [
  project({ id: 'p1', name: 'Müller Kleinandelfingen', project_id_text: '2600559', bearbeitet: false }),
  project({ id: 'p2', name: 'Schneider Dachsen', project_id_text: '2600240', bearbeitet: true }),
  // Snapshot von vor den Reitern: ohne Feld gilt es als aktuell.
  project({ id: 'p3', name: 'Walch Seuzach', project_id_text: '2612004' }),
]

const NOOP = {
  user: null,
  onNavHome: () => {},
  onNavRapport: () => {},
  onNavArbeitszeit: () => {},
  onNavProfile: () => {},
  onStartRapport: () => {},
  onLoggedOut: () => {},
}

async function renderListe(projects: Record<string, unknown>[] = PROJEKTE) {
  const user = userEvent.setup()
  mockFetch.mockImplementation((path: string) =>
    Promise.resolve(path === '/pwa/projects' ? projects : []))
  render(<ProjekteScreen {...NOOP} user={null} />)
  await waitFor(() => expect(screen.getByText('Müller Kleinandelfingen')).toBeInTheDocument())
  return user
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.mocked(apiFormFetch).mockReset()
})

describe('ProjekteScreen — Reiter Aktuell / Bearbeitet', () => {
  it('startet in «Aktuell» und zeigt Bearbeitetes erst im zweiten Reiter', async () => {
    const user = await renderListe()
    expect(screen.getByRole('tab', { name: /Aktuell/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Walch Seuzach')).toBeInTheDocument()
    expect(screen.queryByText('Schneider Dachsen')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Bearbeitet/ }))
    expect(screen.getByText('Schneider Dachsen')).toBeInTheDocument()
    expect(screen.queryByText('Müller Kleinandelfingen')).not.toBeInTheDocument()
  })

  it('zählt je Reiter', async () => {
    await renderListe()
    expect(screen.getByRole('tab', { name: /Aktuell/ })).toHaveTextContent('2')
    expect(screen.getByRole('tab', { name: /Bearbeitet/ })).toHaveTextContent('1')
  })

  it('weist bei der Suche auf den anderen Reiter hin', async () => {
    const user = await renderListe()
    await user.type(screen.getByLabelText('Projekt oder Nummer suchen'), 'schneider')

    expect(screen.getByText(/Kein Projekt gefunden/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '1 unter «Bearbeitet» zeigen' }))
    expect(screen.getByText('Schneider Dachsen')).toBeInTheDocument()
  })

  it('erklärt einen leeren Reiter, statt «nicht zugewiesen» zu sagen', async () => {
    await renderListe([PROJEKTE[0]])
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: /Bearbeitet/ }))
    expect(screen.getByText('Noch keine bearbeiteten offenen Projekte.')).toBeInTheDocument()
    expect(screen.queryByText(/keinem Projekt zugewiesen/)).not.toBeInTheDocument()
  })
})

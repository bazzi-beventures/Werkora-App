import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjekteScreen from './ProjekteScreen'
import { apiFetch, apiFormFetch } from '../api/client'
import type { UserInfo } from '../api/auth'

// Suchfeld über der Kachelliste. Bewusst KEIN Tenant-Feature: es steht bei jedem
// Mandanten da. Das Tenant-Feature `projects_show_all_to_staff` ist die andere
// Hälfte — es füllt die Liste mit allen offenen Projekten und macht das Suchen
// damit erst nötig; hier hängt nur die Beschriftung daran.

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
    geruestfach: null,
    ...over,
  }
}

const PROJEKTE = [
  project({ id: 'p1', name: 'Müller Kleinandelfingen', project_id_text: '2600559' }),
  project({ id: 'p2', name: 'Siegrist Wiesendangen', project_id_text: '2600712' }),
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

function userWith(flags: Record<string, unknown>): UserInfo {
  return {
    display_name: 'Max Muster',
    role: 'user',
    enabled_modules: [],
    feature_flags: flags,
  } as unknown as UserInfo
}

async function renderListe(
  projects: Record<string, unknown>[] = PROJEKTE,
  userInfo: UserInfo | null = null,
) {
  const user = userEvent.setup()
  mockFetch.mockImplementation((path: string) =>
    Promise.resolve(path === '/pwa/projects' ? projects : []))
  render(<ProjekteScreen {...NOOP} user={userInfo} />)
  await waitFor(() => expect(screen.getByText('Müller Kleinandelfingen')).toBeInTheDocument())
  return user
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.mocked(apiFormFetch).mockReset()
})

describe('ProjekteScreen — Suche über Name und Nummer', () => {
  it('filtert die Kacheln nach dem Projektnamen', async () => {
    const user = await renderListe()
    await user.type(screen.getByLabelText('Projekt oder Nummer suchen'), 'siegrist')

    expect(screen.getByText('Siegrist Wiesendangen')).toBeInTheDocument()
    expect(screen.queryByText('Müller Kleinandelfingen')).not.toBeInTheDocument()
    expect(screen.queryByText('Walch Seuzach')).not.toBeInTheDocument()
  })

  it('filtert die Kacheln nach der Projektnummer', async () => {
    const user = await renderListe()
    await user.type(screen.getByLabelText('Projekt oder Nummer suchen'), '2612')

    expect(screen.getByText('Walch Seuzach')).toBeInTheDocument()
    expect(screen.queryByText('Siegrist Wiesendangen')).not.toBeInTheDocument()
  })

  it('zeigt während der Suche die Nummer an der Kachel', async () => {
    // Sonst steht sie nur bei doppelten Namen da. Wer nach einer Nummer sucht,
    // will an der Kachel sehen, dass es die richtige ist.
    const user = await renderListe()
    expect(screen.queryByText('Nr. 2600559')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Projekt oder Nummer suchen'), 'müller')
    expect(screen.getByText('Nr. 2600559')).toBeInTheDocument()
  })

  it('erklärt einen leeren Treffer und bietet das Zurücksetzen an', async () => {
    const user = await renderListe()
    await user.type(screen.getByLabelText('Projekt oder Nummer suchen'), 'gibtsnicht')

    expect(screen.getByText(/Kein Projekt gefunden/)).toBeInTheDocument()
    // Nicht der Leer-Text der Liste: die Projekte sind da, nur der Begriff passt nicht.
    expect(screen.queryByText(/keinem Projekt zugewiesen/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Suche zurücksetzen' }))
    expect(screen.getByText('Müller Kleinandelfingen')).toBeInTheDocument()
  })

  it('steht ohne Tenant-Feature zur Verfügung', async () => {
    await renderListe(PROJEKTE, userWith({}))
    expect(screen.getByLabelText('Projekt oder Nummer suchen')).toBeInTheDocument()
  })

  it('bleibt weg, solange die Liste leer ist', async () => {
    mockFetch.mockImplementation(() => Promise.resolve([]))
    render(<ProjekteScreen {...NOOP} user={null} />)
    await waitFor(() =>
      expect(screen.getByText('Du bist keinem Projekt zugewiesen.')).toBeInTheDocument())
    expect(screen.queryByLabelText('Projekt oder Nummer suchen')).not.toBeInTheDocument()
  })
})

describe('ProjekteScreen — Beschriftung mit projects_show_all_to_staff', () => {
  it('heisst ohne Feature "Meine Projekte"', async () => {
    await renderListe(PROJEKTE, userWith({}))
    expect(document.querySelector('.inner-title')?.textContent).toBe('Meine Projekte')
  })

  it('heisst mit Feature nur noch "Projekte"', async () => {
    await renderListe(PROJEKTE, userWith({ projects_show_all_to_staff: { enabled: true } }))
    // Gezielt die Überschrift: "Projekte" steht auch in der Navigationsleiste.
    expect(document.querySelector('.inner-title')?.textContent).toBe('Projekte')
  })

  it('erklärt die leere Liste mit Feature anders — "zugewiesen" wäre dann falsch', async () => {
    mockFetch.mockImplementation(() => Promise.resolve([]))
    render(<ProjekteScreen {...NOOP}
      user={userWith({ projects_show_all_to_staff: { enabled: true } })} />)
    await waitFor(() =>
      expect(screen.getByText('Zurzeit gibt es keine offenen Projekte.')).toBeInTheDocument())
  })
})

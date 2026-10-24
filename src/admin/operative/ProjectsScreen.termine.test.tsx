import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ProjectsScreen from './ProjectsScreen'
import { listProjects, type Project, type ProjectUpcomingAppointment } from '../../api/admin/projects'
import { PROJEKTLISTE_SPALTEN_KEY, readSpalten } from './projektlisteSpalten'
import { termineTitle } from './ProjectTermine'

// Spec: docs/specs/projektliste-termine-team.md — Spalte «Termine» mit
// Kürzel-Chips, Schalter «Termine» (gemerkt pro Browser), Klick → Einsatzplanung.

vi.mock('../../api/admin/projects', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/admin/projects')>()
  return { ...actual, listProjects: vi.fn(), getProject: vi.fn(), listProjectLocalities: vi.fn().mockResolvedValue([]) }
})
vi.mock('../../api/admin/staff', () => ({
  getAdminStaff: vi.fn().mockResolvedValue([
    { id: 's-mw', name: 'Marvin Walser', kuerzel: 'MW', projektleiter: false },
    { id: 's-bb', name: 'Beat Bühler', kuerzel: null, projektleiter: false },
  ]),
}))
vi.mock('../../api/auth', () => ({ getMe: vi.fn().mockResolvedValue({}) }))
vi.mock('../../api/modules', () => ({ isFeatureEnabled: () => false, getFeature: () => null }))
vi.mock('../useIsMobile', () => ({ useIsMobile: () => false }))

const mockList = vi.mocked(listProjects)

function termin(over: Partial<ProjectUpcomingAppointment>): ProjectUpcomingAppointment {
  return {
    id: 't', start_date: '2026-10-27', end_date: null, start_time: null, end_time: null,
    kind: 'montage', label: null, monteur_ids: ['s-mw', 's-bb'], own_team: false, ...over,
  }
}

const PROJEKT = {
  id: 'p-1', name: 'Dreher Dach', project_id_text: '261301', status: 'offen', is_closed: false,
  created_at: '2026-09-01T08:00:00Z', monteur_ids: ['s-mw', 's-bb'],
  upcoming_appointments: [
    termin({ id: 't1', start_date: '2026-10-27' }),
    termin({ id: 't2', start_date: '2026-10-28', monteur_ids: ['s-bb'], own_team: true }),
    termin({ id: 't3', start_date: '2026-10-29' }),
  ],
  upcoming_appointments_total: 5,
} as unknown as Project

function page(rows: Project[]) {
  return { rows, total: rows.length, open_count: rows.length, closed_count: 0, archived_count: 0, page: 1, page_size: 50 }
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  mockList.mockReset()
  mockList.mockResolvedValue(page([PROJEKT]))
})

describe('ProjectsScreen — Spalte «Termine»', () => {
  it('fragt die Termine mit an und zeigt drei samt «+N» und Kürzel', async () => {
    render(<ProjectsScreen />)
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    expect(mockList.mock.calls[0][0]).toMatchObject({ withAppointments: true })
    expect(await screen.findByRole('columnheader', { name: 'Termine' })).not.toBeNull()
    expect(screen.getByText('+2')).not.toBeNull()
    // Gepflegtes Kürzel bzw. Initialen — dieselbe Regel wie in der Einsatzplanung.
    expect((await screen.findAllByText('MW')).length).toBe(2)
    expect(screen.getAllByText('BB').length).toBe(3)
  })

  it('der Klick auf einen Termin öffnet die Einsatzplanung, nicht die Projektmaske', async () => {
    const onOpenSchedule = vi.fn()
    render(<ProjectsScreen onOpenSchedule={onOpenSchedule} />)
    const knoepfe = await screen.findAllByRole('button', { name: /in der Einsatzplanung zeigen/ })
    fireEvent.click(knoepfe[1])
    expect(onOpenSchedule).toHaveBeenCalledWith('2026-10-28')
    // Die Maske hätte einen «Zurück»-Knopf; die Liste steht noch da.
    expect(screen.getByRole('columnheader', { name: 'Termine' })).not.toBeNull()
  })

  it('der Schalter blendet die Spalte aus, spart den Fetch und überlebt einen Remount', async () => {
    render(<ProjectsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: /Termine/, pressed: true }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'Termine' })).toBeNull())
    await waitFor(() => expect(mockList.mock.calls[mockList.mock.calls.length - 1][0])
      .toMatchObject({ withAppointments: false }))
    expect(readSpalten()).toEqual({ termine: false })
    cleanup()
    render(<ProjectsScreen />)
    expect(await screen.findByRole('button', { name: /Termine/, pressed: false })).not.toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Termine' })).toBeNull()
  })

  it('die Leerzeile spannt über alle Spalten, mit und ohne «Termine»', async () => {
    mockList.mockResolvedValue(page([]))
    render(<ProjectsScreen />)
    const leer = await screen.findByText('Keine Projekte gefunden.')
    const spalten = screen.getAllByRole('columnheader').length
    expect(Number(leer.getAttribute('colspan'))).toBe(spalten)
    fireEvent.click(screen.getByRole('button', { name: /Termine/, pressed: true }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'Termine' })).toBeNull())
    expect(Number(screen.getByText('Keine Projekte gefunden.').getAttribute('colspan')))
      .toBe(screen.getAllByRole('columnheader').length)
  })
})

describe('projektlisteSpalten', () => {
  it('Default an, kaputter Wert fällt auf den Default zurück', () => {
    expect(readSpalten()).toEqual({ termine: true })
    localStorage.setItem(PROJEKTLISTE_SPALTEN_KEY, '{kaputt')
    expect(readSpalten()).toEqual({ termine: true })
  })
})

describe('termineTitle', () => {
  it('nennt im Tooltip die vollen Namen und den Rest', () => {
    const staff = [{ id: 's-mw', name: 'Marvin Walser', kuerzel: 'MW' }]
    const t = termineTitle([termin({ monteur_ids: ['s-mw'] })], staff, 3)
    expect(t).toContain('Marvin Walser')
    expect(t).toContain('… und 2 weitere')
  })
})

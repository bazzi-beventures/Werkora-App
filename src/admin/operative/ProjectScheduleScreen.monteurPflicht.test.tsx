import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import {
  listAppointments, createAppointment, updateAppointment,
  loadSchedulingConfig, upsertProject,
} from '../../api/admin'
import { apiFetch } from '../../api/client'

// Monteur-Pflicht im Planungs-Panel: ein Kundenprojekt-Termin ohne jeden
// Monteur (weder eigenes Team noch Projekt-Team) fehlt nach dem Speichern in
// der Mitarbeiteransicht, im Wochenplan und in der App — er «verschwindet».

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  apiBlobFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}))

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return {
    ...actual,
    listAppointments: vi.fn(),
    createAppointment: vi.fn(),
    updateAppointment: vi.fn(),
    deleteAppointment: vi.fn(),
    loadSchedulingConfig: vi.fn(),
    upsertProject: vi.fn(),
    resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }),
  }
})

// Kundenprojekt OHNE Projekt-Team — der Fall, in dem ein Termin ohne eigene
// Auswahl niemanden hätte.
const PROJECT = {
  id: 'p1', project_id_text: null, name: 'Sanierung Bad', kind: 'project',
  customer_id: null, customer: null, monteur_ids: [] as string[], projektleiter_id: null,
  start_date: null, end_date: null, start_time: null, end_time: null,
}

const DEFAULTS = {
  fields: {}, colors: {},
  views: { month: true, week: true, staff: true, plantafel: true, gantt: true },
  show_distances: false, grey_after: '', grey_until: '', day_capacity_hours: 8,
}

function mockLoad(project = PROJECT, appointments: unknown[] = []) {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/pwa/admin/projects/schedule')) return Promise.resolve([project])
    if (path.startsWith('/pwa/admin/staff')) {
      return Promise.resolve([{ id: 's1', name: 'Anna Muster', projektleiter: false }])
    }
    if (path.startsWith('/pwa/admin/customers')) return Promise.resolve([])
    return Promise.resolve(project)
  })
  vi.mocked(listAppointments).mockResolvedValue(appointments as never)
  vi.mocked(loadSchedulingConfig).mockResolvedValue(DEFAULTS as never)
  vi.mocked(upsertProject).mockResolvedValue({ project: { id: 'p1' } } as never)
  vi.mocked(createAppointment).mockResolvedValue({ id: 'a-neu' } as never)
  vi.mocked(updateAppointment).mockResolvedValue({ id: 'a-1' } as never)
}

async function openProject(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '+ Einsatz planen' }))
  await user.click(screen.getByPlaceholderText('Projekt suchen oder auswählen…'))
  await user.click(await screen.findByText('Sanierung Bad'))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Termin ohne Monteur', () => {
  it('wird abgelehnt, wenn weder der Termin noch das Projekt einen Monteur hat', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: '+ Termin' }))
    await user.type(screen.getByLabelText('Start'), '2026-10-05')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByText(/Kein Monteur eingeplant/)).toBeTruthy()
    expect(upsertProject).not.toHaveBeenCalled()
    expect(createAppointment).not.toHaveBeenCalled()
  })

  it('geht durch, sobald beim Termin ein Monteur gewählt ist', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: '+ Termin' }))
    await user.type(screen.getByLabelText('Start'), '2026-10-05')
    const chips = screen.getAllByRole('button', { name: 'Anna Muster' })
    await user.click(chips[chips.length - 1])
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect(vi.mocked(createAppointment).mock.calls[0][1].monteur_ids).toEqual(['s1'])
  })

  it('gilt nicht für interne Einsätze — dort ist «noch niemand» ein gültiger Stand', async () => {
    // Teamsitzung mit Termin, aber ohne Teilnehmer — beim Wählen steht der
    // Termin im Editor, ein geänderter Beginn wird gespeichert.
    mockLoad({ ...PROJECT, kind: 'teamsitzung' }, [{
      id: 'a-1', project_id: 'p1', start_date: '2026-10-05', end_date: null,
      start_time: '07:00:00', end_time: '08:00:00', kind: 'sonstiges', label: null,
      monteur_ids: null, series_id: null,
    }])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.clear(screen.getByLabelText('Startzeit'))
    await user.type(screen.getByLabelText('Startzeit'), '07:30')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(updateAppointment).toHaveBeenCalled())
    expect(screen.queryByText(/Kein Monteur eingeplant/)).toBeNull()
  })
})

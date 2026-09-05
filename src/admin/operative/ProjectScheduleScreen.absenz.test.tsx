import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import {
  listAppointments, createAppointment, updateAppointment, deleteAppointment,
  getSchedulingConfig, upsertProject, listScheduleAbsences,
} from '../../api/admin'
import { apiFetch, ApiError } from '../../api/client'

// Absenz-Rückfrage: der Server lehnt einen Einsatz in einer genehmigten Absenz
// mit 409 ab (code 'absence_conflict'), die Sperre ist aber überstimmbar. Hier
// wird das geprüft, was der Screen dazu beitragen muss — dass die Rückfrage
// überhaupt kommt, dass «Trotzdem einplanen» denselben Request mit Override
// wiederholt, und dass beim Neuanlegen kein zweites Projekt entsteht.

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  apiBlobFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message) }
  },
}))

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return {
    ...actual,
    listAppointments: vi.fn(),
    listScheduleAbsences: vi.fn(),
    createAppointment: vi.fn(),
    updateAppointment: vi.fn(),
    deleteAppointment: vi.fn(),
    getSchedulingConfig: vi.fn(),
    upsertProject: vi.fn(),
    resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }),
  }
})

const CONFLICT_MESSAGE = 'Absenz im Einsatzzeitraum — Anna Muster: Ferien 07.09.–11.09.2026.'

function absenceConflict() {
  return new ApiError(409, CONFLICT_MESSAGE, 'absence_conflict')
}

const PROJECT = {
  id: 'p1', project_id_text: null, name: 'Sanierung Bad', kind: 'project',
  customer_id: null, customer: null, monteur_ids: ['s1'], projektleiter_id: null,
  start_date: '2026-09-07', end_date: '2026-09-07', start_time: '08:00', end_time: '09:00',
}

const APPT = {
  id: 'a1', project_id: 'p1',
  start_date: '2026-09-07', end_date: null,
  start_time: '08:00:00', end_time: '09:00:00',
  kind: 'montage' as const, label: null, monteur_ids: null, series_id: null,
}

const DEFAULTS = {
  fields: {}, colors: {},
  views: { month: true, week: true, staff: true, plantafel: true, gantt: true },
  show_distances: false, grey_after: '', grey_until: '', day_capacity_hours: 8,
}

function mockLoad(appointments: unknown[] = [APPT]) {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/pwa/admin/projects/schedule')) return Promise.resolve([PROJECT])
    if (path.startsWith('/pwa/admin/staff')) {
      return Promise.resolve([{ id: 's1', name: 'Anna Muster', projektleiter: false }])
    }
    if (path.startsWith('/pwa/admin/customers')) return Promise.resolve([])
    return Promise.resolve(PROJECT)
  })
  vi.mocked(listAppointments).mockResolvedValue(appointments as never)
  vi.mocked(listScheduleAbsences).mockResolvedValue([] as never)
  vi.mocked(getSchedulingConfig).mockResolvedValue({ config: {}, defaults: DEFAULTS } as never)
  vi.mocked(upsertProject).mockResolvedValue({ project: { id: 'p1' } } as never)
  vi.mocked(createAppointment).mockResolvedValue({ ...APPT, series_count: 1 } as never)
  vi.mocked(updateAppointment).mockResolvedValue(APPT as never)
  vi.mocked(deleteAppointment).mockResolvedValue(undefined as never)
}

async function openProject(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '+ Einsatz planen' }))
  await user.click(screen.getByPlaceholderText('Projekt suchen oder auswählen…'))
  await user.click(await screen.findByText('Sanierung Bad'))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Absenz-Rückfrage beim Speichern', () => {
  it('zeigt den Grund im Klartext statt einer Fehlermeldung', async () => {
    mockLoad([])
    vi.mocked(createAppointment).mockRejectedValueOnce(absenceConflict())
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: '+ Termin' }))
    await user.type(screen.getByLabelText('Start'), '2026-09-07')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByText(CONFLICT_MESSAGE)).toBeTruthy()
    expect(screen.queryByText('Speichern fehlgeschlagen.')).toBeNull()
  })

  it('«Trotzdem einplanen» wiederholt denselben Termin mit Override', async () => {
    mockLoad([])
    vi.mocked(createAppointment).mockRejectedValueOnce(absenceConflict())
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: '+ Termin' }))
    await user.type(screen.getByLabelText('Start'), '2026-09-07')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await user.click(await screen.findByRole('button', { name: 'Trotzdem einplanen' }))

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(2))
    const second = vi.mocked(createAppointment).mock.calls[1][1]
    expect(second.ignore_absence_conflicts).toBe(true)
    expect(second.start_date).toBe('2026-09-07')
  })

  it('legt das Projekt beim zweiten Anlauf nicht ein zweites Mal an', async () => {
    mockLoad([])
    vi.mocked(createAppointment).mockRejectedValueOnce(absenceConflict())
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: '+ Termin' }))
    await user.type(screen.getByLabelText('Start'), '2026-09-07')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await user.click(await screen.findByRole('button', { name: 'Trotzdem einplanen' }))

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(2))
    // Der Projekt-Teil war im ersten Anlauf schon durch — ein zweiter Aufruf
    // hätte beim Neuanlegen ein Doppel-Projekt erzeugt.
    expect(upsertProject).toHaveBeenCalledTimes(1)
  })

  it('«Abbrechen» schreibt nichts', async () => {
    mockLoad([])
    vi.mocked(createAppointment).mockRejectedValueOnce(absenceConflict())
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: '+ Termin' }))
    await user.type(screen.getByLabelText('Start'), '2026-09-07')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }))

    expect(createAppointment).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(CONFLICT_MESSAGE)).toBeNull()
  })

  it('ein anderer Fehler bleibt eine Fehlermeldung, keine Rückfrage', async () => {
    mockLoad([])
    vi.mocked(createAppointment).mockRejectedValueOnce(new ApiError(409, 'duplicate'))
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: '+ Termin' }))
    await user.type(screen.getByLabelText('Start'), '2026-09-07')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByText('Speichern fehlgeschlagen.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Trotzdem einplanen' })).toBeNull()
  })
})

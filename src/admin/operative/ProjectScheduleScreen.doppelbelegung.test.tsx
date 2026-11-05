import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import {
  listAppointments, createAppointment, updateAppointment, getSchedulingConfig, upsertProject,
  listScheduleAbsences,
} from '../../api/admin'
import { apiFetch } from '../../api/client'

// WW-70: «Warnung, wenn ein zusätzlicher Termin eingetragen wird, wo bereits
// besetzt ist (analog Ferien)». Vor dem Speichern prüft der Screen die geladenen
// Termine der gewählten Monteure und fragt mit demselben Dialog wie bei Ferien.

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

const BAD = {
  id: 'p1', project_id_text: null, name: 'Sanierung Bad', kind: 'project',
  customer_id: null, customer: null, monteur_ids: ['s1'], projektleiter_id: null,
}
const DACH = { ...BAD, id: 'p2', name: 'Dach Meier' }

const TERMIN_BAD = {
  id: 'a1', project_id: 'p1', start_date: '2026-09-07', end_date: null,
  start_time: '08:00:00', end_time: '09:00:00', kind: 'montage' as const, label: null,
  monteur_ids: null, series_id: null,
}
const TERMIN_DACH = { ...TERMIN_BAD, id: 'a2', project_id: 'p2', start_time: '09:00:00', end_time: '10:00:00' }

const DEFAULTS = {
  fields: {}, colors: {},
  views: { month: true, week: true, staff: true, plantafel: true, gantt: true },
  show_distances: false, grey_after: '', grey_until: '', day_capacity_hours: 8,
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/pwa/admin/projects/schedule')) return Promise.resolve([BAD, DACH])
    if (path.startsWith('/pwa/admin/staff')) {
      return Promise.resolve([{ id: 's1', name: 'Anna Muster', projektleiter: false }])
    }
    if (path.startsWith('/pwa/admin/customers')) return Promise.resolve([])
    return Promise.resolve(BAD)
  })
  vi.mocked(listAppointments).mockResolvedValue([TERMIN_BAD, TERMIN_DACH] as never)
  vi.mocked(listScheduleAbsences).mockResolvedValue([] as never)
  vi.mocked(getSchedulingConfig).mockResolvedValue({ config: {}, defaults: DEFAULTS } as never)
  vi.mocked(upsertProject).mockResolvedValue({ project: { id: 'p1' } } as never)
  vi.mocked(createAppointment).mockResolvedValue({ ...TERMIN_BAD, series_count: 1 } as never)
  vi.mocked(updateAppointment).mockResolvedValue(TERMIN_BAD as never)
})

async function oeffneBad(user: ReturnType<typeof userEvent.setup>) {
  render(<ProjectScheduleScreen />)
  await user.click(await screen.findByRole('button', { name: '+ Einsatz planen' }))
  await user.click(screen.getByPlaceholderText('Projekt suchen oder auswählen…'))
  await user.click(await screen.findByText('Sanierung Bad'))
}

async function verlaengereBis(user: ReturnType<typeof userEvent.setup>, ende: string) {
  await user.clear(screen.getByLabelText('Endzeit'))
  await user.type(screen.getByLabelText('Endzeit'), ende)
  await user.click(screen.getByRole('button', { name: 'Speichern' }))
}

describe('Doppelbelegung beim Speichern', () => {
  it('fragt nach, wenn der Monteur zur selben Zeit schon eingeplant ist', async () => {
    const user = userEvent.setup()
    await oeffneBad(user)
    await verlaengereBis(user, '09:30')

    expect(await screen.findByText('Mitarbeiter bereits eingeplant')).toBeTruthy()
    expect(screen.getByText(/Anna Muster: Dach Meier/)).toBeTruthy()
    expect(updateAppointment).not.toHaveBeenCalled()
  })

  it('«Trotzdem speichern» speichert den Termin wie gewünscht', async () => {
    const user = userEvent.setup()
    await oeffneBad(user)
    await verlaengereBis(user, '09:30')
    await user.click(await screen.findByRole('button', { name: 'Trotzdem speichern' }))

    await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateAppointment).mock.calls[0][1].end_time).toBe('09:30')
  })

  it('«Abbrechen» speichert nichts', async () => {
    const user = userEvent.setup()
    await oeffneBad(user)
    await verlaengereBis(user, '09:30')
    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }))

    expect(updateAppointment).not.toHaveBeenCalled()
  })

  it('fragt nicht, wenn sich die Termine nicht überschneiden', async () => {
    const user = userEvent.setup()
    await oeffneBad(user)
    await verlaengereBis(user, '08:45')

    await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Mitarbeiter bereits eingeplant')).toBeNull()
  })
})

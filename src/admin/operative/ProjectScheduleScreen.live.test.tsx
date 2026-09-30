import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import { deleteAppointment, listAppointments, loadSchedulingConfig } from '../../api/admin'
import { apiFetch } from '../../api/client'
import { toDateStr } from '../utils/calendarHelpers'

// Live-Aktualisierung der Einsatzplanung: ein Termin, der anderswo entsteht
// (Projektmaske, Kollege), erschien früher erst nach Verlassen und Wiederöffnen
// der Ansicht. Jetzt holt sie alle 2 s Projekte und Termine nach — still, und
// ohne eigene Änderungen zu überfahren.

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
    deleteAppointment: vi.fn(),
    loadSchedulingConfig: vi.fn(),
    readCachedSchedulingConfig: vi.fn(() => undefined),
    resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }),
  }
})

const PROJECT = {
  id: 'p1', project_id_text: null, name: 'Sanierung Bad', kind: 'project',
  customer_id: null, customer: null, monteur_ids: ['s1'], projektleiter_id: null,
}

const TODAY = toDateStr(new Date())
const APPT = {
  id: 'a1', project_id: 'p1', start_date: TODAY, end_date: null,
  start_time: '08:00:00', end_time: '09:00:00',
  kind: 'montage' as const, label: null, monteur_ids: null, series_id: null,
}

const DEFAULTS = {
  fields: {}, colors: {},
  views: { month: true, week: true, staff: true, plantafel: true, gantt: true },
  show_distances: false, grey_after: '', grey_until: '', day_capacity_hours: 8,
}

function mockLoad(appointments: unknown[]) {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/pwa/admin/projects/schedule')) return Promise.resolve([PROJECT])
    if (path.startsWith('/pwa/admin/staff')) {
      return Promise.resolve([{ id: 's1', name: 'Anna Muster', projektleiter: false }])
    }
    if (path.startsWith('/pwa/admin/customers')) return Promise.resolve([])
    if (path.startsWith('/pwa/admin/schedule/absences')) return Promise.resolve([])
    return Promise.resolve(PROJECT)
  })
  vi.mocked(listAppointments).mockResolvedValue(appointments as never)
  vi.mocked(loadSchedulingConfig).mockResolvedValue(DEFAULTS as never)
}

async function tick(ms = 2100) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Einsatzplanung: Live-Aktualisierung', () => {
  it('zeigt einen anderswo angelegten Termin ohne Neuöffnen der Ansicht', async () => {
    mockLoad([])
    render(<ProjectScheduleScreen />)
    expect(await screen.findByText(/^0 geplante Einsätze/)).toBeInTheDocument()

    // Derweil in der Projektmaske gespeichert:
    vi.mocked(listAppointments).mockResolvedValue([APPT] as never)
    await tick()

    expect(await screen.findByText(/^1 geplante Einsätze/)).toBeInTheDocument()
  })

  it('ein fehlgeschlagener Hintergrund-Abruf leert die Tafel nicht', async () => {
    mockLoad([APPT])
    render(<ProjectScheduleScreen />)
    expect(await screen.findByText(/^1 geplante Einsätze/)).toBeInTheDocument()

    vi.mocked(listAppointments).mockRejectedValue(new Error('offline'))
    await tick()
    await tick()

    expect(screen.getByText(/^1 geplante Einsätze/)).toBeInTheDocument()
  })

  it('pausiert, solange ein eigener Schreibvorgang läuft — kein Zurückspringen', async () => {
    mockLoad([APPT])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ProjectScheduleScreen />)
    await user.click(await screen.findByRole('button', { name: '+ Einsatz planen' }))
    await user.click(screen.getByPlaceholderText('Projekt suchen oder auswählen…'))
    await user.click(await screen.findByText('Sanierung Bad'))

    // Termin entfernen, der Server antwortet noch nicht.
    let finishDelete!: () => void
    vi.mocked(deleteAppointment).mockImplementation(
      () => new Promise<void>(r => { finishDelete = r }) as never,
    )
    await user.click(screen.getByTitle('Termin entfernen'))
    const callsBefore = vi.mocked(listAppointments).mock.calls.length

    await tick(4200)
    expect(vi.mocked(listAppointments).mock.calls.length).toBe(callsBefore)

    // Server fertig: ab jetzt wieder Abrufe, und die liefern den neuen Stand.
    vi.mocked(listAppointments).mockResolvedValue([] as never)
    await act(async () => { finishDelete() })
    await tick()
    expect(vi.mocked(listAppointments).mock.calls.length).toBeGreaterThan(callsBefore)
    expect(await screen.findByText(/^0 geplante Einsätze/)).toBeInTheDocument()
  })
})

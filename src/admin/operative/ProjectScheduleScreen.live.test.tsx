import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import { deleteAppointment, listAppointments, loadSchedulingConfig } from '../../api/admin'
import { apiFetch } from '../../api/client'
import { toDateStr } from '../utils/calendarHelpers'

// Live-Aktualisierung der Einsatzplanung: ein Termin, der anderswo entsteht
// (Projektmaske, Kollege), erschien früher erst nach Verlassen und Wiederöffnen
// der Ansicht. Jetzt fragt sie alle 2 s nach — still, und ohne eigene
// Änderungen zu überfahren.
//
// Seit 20261106 fragt der Takt nur den Fingerabdruck (/admin/schedule/stand)
// und holt eine Liste erst, wenn sich ihr Wert geändert hat. Vorher kamen bei
// jedem Takt alle Projekte und das volle Terminfenster — rund 4 MB alle 2 s,
// 159 GB Railway-Egress in zehn Tagen. `stand` unten spielt den Server: wer
// eine Änderung «anderswo» simuliert, dreht auch den Fingerabdruck weiter.

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

let stand: { projekte: string; termine: string } | null = { projekte: 'p1', termine: 't1' }
let projectAppointments: unknown[] = []

function mockLoad(appointments: unknown[]) {
  stand = { projekte: 'p1', termine: 't1' }
  projectAppointments = appointments
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/pwa/admin/schedule/stand')) {
      return stand ? Promise.resolve({ ...stand }) : Promise.reject(new Error('503'))
    }
    if (path.startsWith('/pwa/admin/projects/p1/appointments')) return Promise.resolve(projectAppointments)
    // Minutentakt: Skills nachladen (sonst landete die Projekt-Attrappe in der Matrix).
    if (path.startsWith('/pwa/admin/skill-matrix')) return Promise.resolve({ skills: [], cells: [] })
    if (path.startsWith('/pwa/admin/project-skills')) return Promise.resolve({ project_skills: [] })
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
    stand = { projekte: 'p1', termine: 't2' }
    await tick()

    expect(await screen.findByText(/^1 geplante Einsätze/)).toBeInTheDocument()
  })

  it('ein fehlgeschlagener Hintergrund-Abruf leert die Tafel nicht', async () => {
    mockLoad([APPT])
    render(<ProjectScheduleScreen />)
    expect(await screen.findByText(/^1 geplante Einsätze/)).toBeInTheDocument()

    vi.mocked(listAppointments).mockRejectedValue(new Error('offline'))
    stand = { projekte: 'p1', termine: 't2' }
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
    stand = { projekte: 'p1', termine: 't2' }
    await act(async () => { finishDelete() })
    await tick()
    expect(vi.mocked(listAppointments).mock.calls.length).toBeGreaterThan(callsBefore)
    expect(await screen.findByText(/^0 geplante Einsätze/)).toBeInTheDocument()
  })

  it('holt bei unverändertem Fingerabdruck keine Listen nach', async () => {
    mockLoad([APPT])
    render(<ProjectScheduleScreen />)
    expect(await screen.findByText(/^1 geplante Einsätze/)).toBeInTheDocument()
    await tick()  // volles Fenster ist da, Basis gesetzt
    const termine = vi.mocked(listAppointments).mock.calls.length
    const projekte = () => vi.mocked(apiFetch).mock.calls
      .filter(([path]) => String(path).startsWith('/pwa/admin/projects/schedule')).length
    const projekteVorher = projekte()
    const standAbrufe = () => vi.mocked(apiFetch).mock.calls
      .filter(([path]) => String(path).startsWith('/pwa/admin/schedule/stand')).length
    const standVorher = standAbrufe()

    await tick()
    await tick()
    await tick()

    expect(standAbrufe()).toBeGreaterThanOrEqual(standVorher + 3)
    expect(vi.mocked(listAppointments).mock.calls.length).toBe(termine)
    expect(projekte()).toBe(projekteVorher)
  })

  it('holt nur die Liste nach, deren Fingerabdruck sich geändert hat', async () => {
    mockLoad([APPT])
    render(<ProjectScheduleScreen />)
    expect(await screen.findByText(/^1 geplante Einsätze/)).toBeInTheDocument()
    await tick()
    const termine = vi.mocked(listAppointments).mock.calls.length
    const projekte = () => vi.mocked(apiFetch).mock.calls
      .filter(([path]) => String(path).startsWith('/pwa/admin/projects/schedule')).length
    const projekteVorher = projekte()

    stand = { projekte: 'p2', termine: 't1' }
    await tick()

    expect(projekte()).toBe(projekteVorher + 1)
    expect(vi.mocked(listAppointments).mock.calls.length).toBe(termine)
  })

  it('ohne Fingerabdruck gleicht er nur noch im Minutentakt voll ab', async () => {
    mockLoad([APPT])
    stand = null
    render(<ProjectScheduleScreen />)
    expect(await screen.findByText(/^1 geplante Einsätze/)).toBeInTheDocument()
    await tick()
    const termine = vi.mocked(listAppointments).mock.calls.length

    await tick()
    await tick()
    expect(vi.mocked(listAppointments).mock.calls.length).toBe(termine)

    await tick(61_000)
    expect(vi.mocked(listAppointments).mock.calls.length).toBeGreaterThan(termine)
  })

  it('lädt beim Öffnen erst das nahe Fenster und parallel das volle', async () => {
    const FERN = { ...APPT, id: 'a-fern', start_date: shift(TODAY, 300) }
    mockLoad([])
    vi.mocked(listAppointments).mockImplementation(((from: string, to: string) => {
      const voll = from <= shift(TODAY, -400) && to >= shift(TODAY, 600)
      return Promise.resolve(voll ? [APPT, FERN] : [APPT])
    }) as never)
    render(<ProjectScheduleScreen />)

    expect(await screen.findByText(/^2 geplante Einsätze/)).toBeInTheDocument()
    const fenster = vi.mocked(listAppointments).mock.calls.map(([from, to]) => [from, to])
    expect(fenster).toContainEqual([shift(TODAY, -14), shift(TODAY, 100)])
    expect(fenster).toContainEqual([shift(TODAY, -400), shift(TODAY, 600)])
  })

  it('«Termine entfernen» nimmt die Termine vom Server, nicht aus dem nahen Fenster', async () => {
    // Das volle Fenster kommt nicht an — der Kalender kennt nur den nahen Termin.
    const FERN = { ...APPT, id: 'a-fern', start_date: shift(TODAY, 300) }
    const GESCHICHTE = { ...APPT, id: 'a-alt', start_date: shift(TODAY, -500) }
    mockLoad([APPT])
    projectAppointments = [GESCHICHTE, APPT, FERN]
    vi.mocked(listAppointments).mockImplementation(((from: string) =>
      from <= shift(TODAY, -400) ? Promise.reject(new Error('langsam')) : Promise.resolve([APPT])
    ) as never)
    vi.mocked(deleteAppointment).mockResolvedValue(undefined as never)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ProjectScheduleScreen />)
    await user.click(await screen.findByRole('button', { name: '+ Einsatz planen' }))
    await user.click(screen.getByPlaceholderText('Projekt suchen oder auswählen…'))
    await user.click(await screen.findByText('Sanierung Bad'))

    await user.click(screen.getByRole('button', { name: 'Termine entfernen' }))

    const geloescht = vi.mocked(deleteAppointment).mock.calls.map(([id]) => id)
    expect(geloescht).toEqual(['a1', 'a-fern'])  // was vor dem Fenster liegt, bleibt
  })
})

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

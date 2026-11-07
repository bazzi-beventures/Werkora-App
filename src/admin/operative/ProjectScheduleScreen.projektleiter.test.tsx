import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import {
  listAppointments, createAppointment, updateAppointment,
  loadSchedulingConfig, upsertProject,
} from '../../api/admin'
import { apiFetch } from '../../api/client'
import { kindHasProjektleiter } from '../utils/project'

// Projektleiter in der Einsatzplanung (Gehlhaar 20261106: «Büro» trug einen
// Projektleiter, und «— kein Projektleiter —» liess sich nicht speichern).
//
// - Interne Einsätze ohne Zuständigen (Teamsitzung, Lager, «Büro» …) zeigen das
//   Feld nicht und leeren einen alten Eintrag beim Speichern.
// - Leeren kommt beim PATCH als `''` an — `null` filtert der Server weg.
// - Im Projektleiter-Filter bleiben solche Einsätze stehen: sie zeigen, dass der
//   Monteur belegt ist, und gehören keinem Portfolio.

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

const BUERO = {
  id: 'p-buero', project_id_text: null, name: 'Büro', kind: 'sonstiges',
  customer_id: null, customer: null, monteur_ids: ['s-mw'], projektleiter_id: 's-iz',
  bemerkung: null, start_date: null, end_date: null, start_time: null, end_time: null,
}

const KUNDENPROJEKT = {
  id: 'p-kunde', project_id_text: '2601753', name: 'Natale Insektenschutz', kind: 'project',
  customer_id: null, customer: null, monteur_ids: ['s-mw'], projektleiter_id: 's-iz',
  bemerkung: 'Hund im Garten', start_date: null, end_date: null, start_time: null, end_time: null,
}

const STAFF = [
  { id: 's-mw', name: 'Marco Weber', projektleiter: false },
  { id: 's-iz', name: 'Isabelle Zecchini', projektleiter: true },
  { id: 's-ab', name: 'Andrea Brunner', projektleiter: true },
]

const DEFAULTS = {
  fields: {}, colors: {},
  views: { month: true, week: true, staff: true, plantafel: true, gantt: true },
  show_distances: false, grey_after: '', grey_until: '', day_capacity_hours: 8,
}

function termin(id: string, projectId: string) {
  return {
    id, project_id: projectId, start_date: '2026-10-05', end_date: null,
    start_time: '07:00:00', end_time: '12:00:00', kind: 'montage', label: null,
    monteur_ids: null, series_id: null,
  }
}

function mockLoad(projects: unknown[], appointments: unknown[] = []) {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/pwa/admin/projects/schedule')) return Promise.resolve(projects)
    if (path.startsWith('/pwa/admin/staff')) return Promise.resolve(STAFF)
    if (path.startsWith('/pwa/admin/customers')) return Promise.resolve([])
    return Promise.resolve(projects[0])
  })
  vi.mocked(listAppointments).mockResolvedValue(appointments as never)
  vi.mocked(loadSchedulingConfig).mockResolvedValue(DEFAULTS as never)
  vi.mocked(upsertProject).mockResolvedValue({ project: { id: 'p-x' } } as never)
  vi.mocked(createAppointment).mockResolvedValue({ id: 'a-neu' } as never)
  vi.mocked(updateAppointment).mockResolvedValue({ id: 'a-1' } as never)
}

async function openProject(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: '+ Einsatz planen' }))
  await user.click(screen.getByPlaceholderText('Projekt suchen oder auswählen…'))
  await user.click(await screen.findByText(name))
}

function projectPayload() {
  return vi.mocked(upsertProject).mock.calls[0][0] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('kindHasProjektleiter', () => {
  it('kennt den Projektleiter beim Kundenprojekt, Blocker und der Reservation', () => {
    for (const kind of ['project', 'blocker', 'reservation', null, undefined] as const) {
      expect(kindHasProjektleiter(kind)).toBe(true)
    }
  })

  it('nicht bei Einsätzen, die niemandem gehören', () => {
    for (const kind of ['teamsitzung', 'lagerarbeit', 'werkstatt', 'weiterbildung', 'sonstiges'] as const) {
      expect(kindHasProjektleiter(kind)).toBe(false)
    }
  })
})

describe('Projektleiter-Feld im Planungs-Panel', () => {
  it('fehlt bei «Büro» (Sonstiges) — ein alter Eintrag wird beim Speichern geleert', async () => {
    mockLoad([BUERO])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user, 'Büro')

    expect(screen.queryByText('— kein Projektleiter —')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(upsertProject).toHaveBeenCalled())
    expect(projectPayload().projektleiter_id).toBe('')
  })

  it('steht beim Kundenprojekt, und «— kein Projektleiter —» kommt als Leerwert an', async () => {
    mockLoad([KUNDENPROJEKT])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user, '2601753 Natale Insektenschutz')

    const select = screen.getByRole('option', { name: '— kein Projektleiter —' })
      .closest('select') as HTMLSelectElement
    expect(select.value).toBe('s-iz')
    await user.selectOptions(select, '')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(upsertProject).toHaveBeenCalled())
    // `null` filterte der PATCH weg — Isabelle blieb eingetragen, die Planung
    // meldete trotzdem «Eintrag aktualisiert».
    expect(projectPayload().projektleiter_id).toBe('')
    // Die geladene Bemerkung geht unverändert zurück, sie wird nicht geleert.
    expect(projectPayload().bemerkung).toBe('Hund im Garten')
  })

  it('beim Anlegen geht ein leeres Feld als null, nicht als Leerwert', async () => {
    mockLoad([KUNDENPROJEKT])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await user.click(await screen.findByRole('button', { name: '+ Interner Einsatz' }))
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(upsertProject).toHaveBeenCalled())
    expect(projectPayload().id).toBeUndefined()
    expect(projectPayload().projektleiter_id).toBeNull()
    expect(projectPayload().bemerkung).toBeNull()
  })
})

describe('Projektleiter-Filter', () => {
  it('blendet fremde Kundenprojekte aus, lässt «Büro» aber stehen', async () => {
    mockLoad([BUERO, KUNDENPROJEKT], [termin('a-buero', 'p-buero'), termin('a-kunde', 'p-kunde')])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)

    expect(await screen.findByText(/^2 geplante Einsätze/)).toBeTruthy()
    // Andrea Brunner leitet keins der beiden: das Kundenprojekt fällt weg, der
    // Büro-Block von Marco bleibt — sonst sähe sie ihn an dem Morgen als frei.
    await user.selectOptions(screen.getByTitle('Nach Projektleiter filtern'), 's-ab')
    expect(await screen.findByText(/^1 geplante Einsätze/)).toBeTruthy()
  })
})

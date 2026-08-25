import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import {
  listAppointments, getSchedulingConfig, upsertProject,
} from '../../api/admin'
import {
  listAdminProjectTasks, addAdminProjectTask, updateAdminProjectTask, deleteAdminProjectTask,
} from '../../api/projectTasks'
import { apiFetch } from '../../api/client'

// Aufgaben-Checkliste im Planungs-Panel. Geprüft wird, dass die Liste zum
// GEÖFFNETEN Projekt gehört (Projekt-ID im Call) — ein Vertipper dort schriebe
// Aufgaben stumm auf die falsche Baustelle.

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  apiBlobFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}))

vi.mock('../../api/projectTasks', () => ({
  listAdminProjectTasks: vi.fn(),
  addAdminProjectTask: vi.fn(),
  updateAdminProjectTask: vi.fn(),
  deleteAdminProjectTask: vi.fn(),
}))

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return {
    ...actual,
    listAppointments: vi.fn(),
    createAppointment: vi.fn(),
    updateAppointment: vi.fn(),
    deleteAppointment: vi.fn(),
    getSchedulingConfig: vi.fn(),
    upsertProject: vi.fn(),
    resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }),
  }
})

const PROJECT = {
  id: 'p1', project_id_text: null, name: 'Sanierung Bad', kind: 'project',
  customer_id: null, customer: null, monteur_ids: ['s1'], projektleiter_id: null,
  start_date: '2026-09-07', end_date: '2026-09-07', start_time: '08:00', end_time: '09:00',
}

const TASK = {
  id: 't1', text: 'Schlüssel abholen', is_done: false,
  done_at: null, done_by_name: null, created_at: '2026-09-01T08:00:00Z',
}

const DEFAULTS = {
  fields: {}, colors: {},
  views: { month: true, week: true, staff: true, plantafel: true, gantt: true },
  show_distances: false, grey_after: '', grey_until: '', day_capacity_hours: 8,
}

function mockLoad(tasks: unknown[] = [TASK]) {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/pwa/admin/projects/schedule')) return Promise.resolve([PROJECT])
    if (path.startsWith('/pwa/admin/staff')) {
      return Promise.resolve([{ id: 's1', name: 'Anna Muster', projektleiter: false }])
    }
    if (path.startsWith('/pwa/admin/customers')) return Promise.resolve([])
    return Promise.resolve(PROJECT)
  })
  vi.mocked(listAppointments).mockResolvedValue([] as never)
  vi.mocked(getSchedulingConfig).mockResolvedValue({ config: {}, defaults: DEFAULTS } as never)
  vi.mocked(upsertProject).mockResolvedValue({ project: { id: 'p1' } } as never)
  vi.mocked(listAdminProjectTasks).mockResolvedValue(tasks as never)
  vi.mocked(addAdminProjectTask).mockResolvedValue(undefined as never)
  vi.mocked(updateAdminProjectTask).mockResolvedValue(undefined as never)
  vi.mocked(deleteAdminProjectTask).mockResolvedValue(undefined as never)
}

async function openProject(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '+ Einsatz planen' }))
  await user.click(screen.getByPlaceholderText('Projekt suchen oder auswählen…'))
  await user.click(await screen.findByText('Sanierung Bad'))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Aufgaben im Planungs-Panel', () => {
  it('lädt die Checkliste des gewählten Projekts', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    expect(await screen.findByText('Schlüssel abholen')).toBeTruthy()
    expect(listAdminProjectTasks).toHaveBeenCalledWith('p1')
  })

  it('legt eine neue Aufgabe am geöffneten Projekt an und lädt neu', async () => {
    mockLoad([])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.type(await screen.findByPlaceholderText(/Neue Aufgabe/), 'Gerüst bestellen')
    await user.click(screen.getByRole('button', { name: '+ Aufgabe' }))

    await waitFor(() => expect(addAdminProjectTask).toHaveBeenCalledWith('p1', 'Gerüst bestellen'))
    // Nach dem Anlegen kommt die Liste vom Server — sonst fehlte die neue ID.
    expect(vi.mocked(listAdminProjectTasks).mock.calls.length).toBeGreaterThan(1)
  })

  it('bearbeitet den Text einer bestehenden Aufgabe', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }))
    const input = screen.getByDisplayValue('Schlüssel abholen')
    await user.clear(input)
    await user.type(input, 'Schlüssel beim Hauswart abholen')
    await user.click(screen.getByRole('button', { name: 'Übernehmen' }))

    await waitFor(() => expect(updateAdminProjectTask)
      .toHaveBeenCalledWith('p1', 't1', 'Schlüssel beim Hauswart abholen'))
  })

  it('löscht nur nach Rückfrage', async () => {
    mockLoad()
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(await screen.findByTitle('Aufgabe löschen'))
    expect(deleteAdminProjectTask).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    await user.click(screen.getByTitle('Aufgabe löschen'))
    await waitFor(() => expect(deleteAdminProjectTask).toHaveBeenCalledWith('p1', 't1'))
    expect(screen.queryByText('Schlüssel abholen')).toBeNull()

    confirmSpy.mockRestore()
  })
})

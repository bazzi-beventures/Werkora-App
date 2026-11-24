import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import { loadSchedulingConfig, listAppointments, upsertProject } from '../../api/admin'
import { apiFetch } from '../../api/client'

// Kunde im Planungs-Panel: tippbare Suche statt <select> (Gehlhaar ~7000 Kunden),
// der Stamm kommt aus dem gemeinsamen Speicher (ladeKundenstamm).

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

const PROJEKT = {
  id: 'p-1', project_id_text: '2601800', name: 'Sanierung Bad', kind: 'project',
  customer_id: null, customer: null, monteur_ids: ['s1'], projektleiter_id: null,
  bemerkung: null, start_date: null, end_date: null, start_time: null, end_time: null,
}

const KUNDEN = [
  { id: 'c-1', name: 'Muster Hans', address: 'Seuzach', phone: '079 111 22 33' },
  { id: 'c-2', name: 'Meier Anna', address: 'Winterthur', phone: null },
]

const DEFAULTS = {
  fields: {}, colors: {},
  views: { month: true, week: true, staff: true, plantafel: true, gantt: true },
  show_distances: false, grey_after: '', grey_until: '', day_capacity_hours: 8,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/pwa/admin/projects/schedule')) return Promise.resolve([PROJEKT])
    if (path.startsWith('/pwa/admin/staff')) return Promise.resolve([{ id: 's1', name: 'Marco Weber' }])
    if (path.startsWith('/pwa/admin/customers')) return Promise.resolve(KUNDEN)
    return Promise.resolve(PROJEKT)
  })
  vi.mocked(listAppointments).mockResolvedValue([] as never)
  vi.mocked(loadSchedulingConfig).mockResolvedValue(DEFAULTS as never)
  vi.mocked(upsertProject).mockResolvedValue({ project: { id: 'p-1' } } as never)
})

describe('Kunde im Planungs-Panel', () => {
  it('findet den Kunden per Suche und speichert ihn am Projekt', async () => {
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await user.click(await screen.findByRole('button', { name: '+ Einsatz planen' }))
    await user.click(screen.getByPlaceholderText('Projekt suchen oder auswählen…'))
    await user.click(await screen.findByText('2601800 Sanierung Bad'))

    // Wie in CustomerCombobox.test: das Menü hängt im Portal, gewählt wird per mouseDown.
    const feld = await screen.findByPlaceholderText('Kunde wählen oder suchen…')
    fireEvent.focus(feld)
    fireEvent.change(feld, { target: { value: 'meier' } })
    expect(screen.queryByText(/Muster Hans/)).toBeNull()
    fireEvent.mouseDown(await screen.findByText(/Meier Anna/))

    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(upsertProject).toHaveBeenCalled())
    expect((vi.mocked(upsertProject).mock.calls[0][0] as Record<string, unknown>).customer_id).toBe('c-2')
    // Der Stamm kam genau einmal über die Leitung.
    expect(vi.mocked(apiFetch).mock.calls.filter(([p]) => String(p) === '/pwa/admin/customers')).toHaveLength(1)
  })
})

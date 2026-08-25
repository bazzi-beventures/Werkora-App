import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import {
  listAppointments, createAppointment, updateAppointment, deleteAppointment,
  getSchedulingConfig, upsertProject,
} from '../../api/admin'
import { apiFetch } from '../../api/client'

// Serientermine im Planungs-Panel. Geprüft wird vor allem das, was schiefgehen
// kann, ohne dass man es sofort sieht: welcher SCOPE beim Server landet. Ein
// versehentliches 'series' löscht eine ganze Sitzungsreihe.

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
    getSchedulingConfig: vi.fn(),
    upsertProject: vi.fn(),
    resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }),
  }
})

// Kundenprojekt: nur dort zeigt das Panel die Terminliste (mit ✕ je Termin)
// und den Knopf «+ Termin».
const PROJECT = {
  id: 'p1', project_id_text: null, name: 'Sanierung Bad', kind: 'project',
  customer_id: null, customer: null, monteur_ids: ['s1'], projektleiter_id: null,
  start_date: '2026-09-07', end_date: '2026-09-07', start_time: '08:00', end_time: '09:00',
}

const SERIES_APPT = {
  id: 'a1', project_id: 'p1',
  start_date: '2026-09-07', end_date: null,
  start_time: '08:00:00', end_time: '09:00:00',
  kind: 'montage' as const, label: null, monteur_ids: null,
  series_id: 'serie-1',
}

const SINGLE_APPT = { ...SERIES_APPT, id: 'a2', series_id: null }

const DEFAULTS = {
  fields: {}, colors: {},
  views: { month: true, week: true, staff: true, plantafel: true, gantt: true },
  show_distances: false, grey_after: '', grey_until: '', day_capacity_hours: 8,
}

function mockLoad(appointments: unknown[] = [SERIES_APPT]) {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/pwa/admin/projects/schedule')) return Promise.resolve([PROJECT])
    if (path.startsWith('/pwa/admin/staff')) {
      return Promise.resolve([{ id: 's1', name: 'Anna Muster', projektleiter: false }])
    }
    if (path.startsWith('/pwa/admin/customers')) return Promise.resolve([])
    return Promise.resolve(PROJECT)
  })
  vi.mocked(listAppointments).mockResolvedValue(appointments as never)
  vi.mocked(getSchedulingConfig).mockResolvedValue({ config: {}, defaults: DEFAULTS } as never)
  vi.mocked(upsertProject).mockResolvedValue({ project: { id: 'p1' } } as never)
  vi.mocked(createAppointment).mockResolvedValue({ ...SERIES_APPT, series_count: 5 } as never)
  vi.mocked(updateAppointment).mockResolvedValue(SERIES_APPT as never)
  vi.mocked(deleteAppointment).mockResolvedValue(undefined as never)
}

// Panel öffnen und das Testprojekt wählen — Ausgangspunkt aller Fälle unten.
// Danach steht der nächste Termin des Projekts im Editor.
async function openProject(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '+ Einsatz planen' }))
  await user.click(screen.getByPlaceholderText('Projekt suchen oder auswählen…'))
  await user.click(await screen.findByText('Sanierung Bad'))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Serientermin anlegen', () => {
  it('verlangt ein Serien-Ende und schickt dann die Regel mit', async () => {
    mockLoad([])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: '+ Termin' }))
    await user.type(screen.getByLabelText('Start'), '2026-09-07')
    await user.selectOptions(screen.getByLabelText('Wiederholung'), 'biweekly')

    // Ohne Enddatum darf nichts rausgehen — die Serie wird ausmaterialisiert,
    // ohne Ende wüsste der Server nicht, wie viele Zeilen er anlegen soll.
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByText(/Enddatum der Serie/)).toBeTruthy()
    expect(createAppointment).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/Serie bis/), '2026-12-31')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect(vi.mocked(createAppointment).mock.calls[0][1].recurrence)
      .toEqual({ freq: 'weekly', interval: 2, until: '2026-12-31' })
  })

  it('lehnt ein Serien-Ende vor dem ersten Termin ab', async () => {
    mockLoad([])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: '+ Termin' }))
    await user.type(screen.getByLabelText('Start'), '2026-09-07')
    await user.selectOptions(screen.getByLabelText('Wiederholung'), 'weekly')
    await user.type(screen.getByLabelText(/Serie bis/), '2026-08-01')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByText(/liegt vor dem ersten Termin/)).toBeTruthy()
    expect(createAppointment).not.toHaveBeenCalled()
  })

  it('legt ohne Wiederholung einen Einzeltermin an', async () => {
    mockLoad([])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: '+ Termin' }))
    await user.type(screen.getByLabelText('Start'), '2026-09-07')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect(vi.mocked(createAppointment).mock.calls[0][1].recurrence).toBeNull()
  })
})

describe('Serientermin ändern', () => {
  it('ändert ohne Häkchen nur diesen einen Termin', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(updateAppointment).toHaveBeenCalled())
    expect(vi.mocked(updateAppointment).mock.calls[0][2]).toBe('single')
  })

  it('überträgt die Änderung mit Häkchen auf die ganze Serie', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByLabelText(/ganze Serie anwenden/))
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(updateAppointment).toHaveBeenCalled())
    expect(vi.mocked(updateAppointment).mock.calls[0][2]).toBe('series')
  })

  it('bietet die Serien-Option bei einem Einzeltermin gar nicht an', async () => {
    mockLoad([SINGLE_APPT])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    expect(screen.queryByLabelText(/ganze Serie anwenden/)).toBeNull()
  })
})

describe('Serientermin löschen', () => {
  it('fragt nach und löscht auf Wunsch die ganze Serie', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByTitle('Termin oder Serie entfernen'))
    const dialog = await screen.findByRole('dialog', { name: 'Serientermin entfernen' })
    await user.click(within(dialog).getByRole('button', { name: 'Ganze Serie' }))

    await waitFor(() => expect(deleteAppointment).toHaveBeenCalledWith('a1', 'series'))
  })

  it('löscht auf Wunsch nur den einen Termin', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByTitle('Termin oder Serie entfernen'))
    const dialog = await screen.findByRole('dialog', { name: 'Serientermin entfernen' })
    await user.click(within(dialog).getByRole('button', { name: 'Nur dieser Termin' }))

    await waitFor(() => expect(deleteAppointment).toHaveBeenCalledWith('a1', 'single'))
  })

  it('löscht einen Einzeltermin ohne Rückfrage', async () => {
    mockLoad([SINGLE_APPT])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByTitle('Termin entfernen'))
    await waitFor(() => expect(deleteAppointment).toHaveBeenCalledWith('a2', 'single'))
    expect(screen.queryByRole('dialog', { name: 'Serientermin entfernen' })).toBeNull()
  })
})

describe('Blocker', () => {
  it('legt einen Blocker mit einem Klick als eigene Einsatz-Art an', async () => {
    mockLoad([])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)

    await user.click(await screen.findByRole('button', { name: '+ Blocker' }))
    // Art und Titel sind vorbelegt — ein Blocker soll schnell gehen.
    expect((screen.getByLabelText('Art des Einsatzes') as HTMLSelectElement).value).toBe('blocker')
    expect((screen.getByLabelText('Titel') as HTMLInputElement).value).toBe('Blocker')

    await user.type(screen.getByLabelText('Start'), '2026-09-07')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(upsertProject).toHaveBeenCalled())
    expect(vi.mocked(upsertProject).mock.calls[0][0]).toMatchObject({ kind: 'blocker' })
  })
})


// ─── Termin-Nutzlast (H4: gemeinsames Modell mit dem Detail-Editor) ──────────
//
// Seit ApptFormState auf AppointmentDraft zurückgeführt ist, baut die Planung
// ihre Nutzlast mit draftPayload — demselben Bau wie der Projekt-Detail-Editor.
// Der sichtbare Unterschied zur früheren, handgebauten Fassung: die Bezeichnung
// geht nur bei Art 'sonstiges' mit. Wer eine tippt und die Art danach wechselt,
// schickte vorher einen Namen, den keine Ansicht mehr zeigt (beide rendern
// `kind === 'sonstiges' && label`).

describe('Termin-Nutzlast', () => {
  it('schickt die Bezeichnung nur bei Art «sonstiges»', async () => {
    mockLoad([])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: '+ Termin' }))
    await user.type(screen.getByLabelText('Start'), '2026-09-07')
    await user.selectOptions(screen.getByLabelText('Termin-Typ'), 'sonstiges')
    await user.type(screen.getByLabelText('Bezeichnung'), 'Besprechung')

    // Art zurückwechseln: die getippte Bezeichnung bleibt im State, darf aber
    // nicht mehr mitgehen.
    await user.selectOptions(screen.getByLabelText('Termin-Typ'), 'montage')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect(vi.mocked(createAppointment).mock.calls[0][1]).toMatchObject({
      kind: 'montage',
      label: '',
    })
  })

  it('nimmt die Bezeichnung bei «sonstiges» getrimmt mit', async () => {
    mockLoad([])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.click(screen.getByRole('button', { name: '+ Termin' }))
    await user.type(screen.getByLabelText('Start'), '2026-09-07')
    await user.selectOptions(screen.getByLabelText('Termin-Typ'), 'sonstiges')
    await user.type(screen.getByLabelText('Bezeichnung'), '  Besprechung  ')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect(vi.mocked(createAppointment).mock.calls[0][1]).toMatchObject({
      kind: 'sonstiges',
      label: 'Besprechung',
    })
  })
})

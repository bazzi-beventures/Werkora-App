import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import {
  listAppointments, createAppointment, updateAppointment, deleteAppointment,
  loadSchedulingConfig, upsertProject, listScheduleAbsences,
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
    loadSchedulingConfig: vi.fn(),
    upsertProject: vi.fn(),
    listScheduleAbsences: vi.fn(),
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
  // Der Screen holt die Anzeige-Config gemergt und gecacht (loadSchedulingConfig),
  // bewusst neben dem grossen Datenladen — siehe ProjectScheduleScreen.
  vi.mocked(loadSchedulingConfig).mockResolvedValue(DEFAULTS as never)
  vi.mocked(upsertProject).mockResolvedValue({ project: { id: 'p1' } } as never)
  vi.mocked(createAppointment).mockResolvedValue({ ...SERIES_APPT, series_count: 5 } as never)
  vi.mocked(updateAppointment).mockResolvedValue(SERIES_APPT as never)
  vi.mocked(deleteAppointment).mockResolvedValue(undefined as never)
  vi.mocked(listScheduleAbsences).mockResolvedValue([])
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
  const scopeSelect = () => screen.getByRole('combobox', { name: /Änderung gilt für/ })

  it('ändert per Vorgabe nur diesen einen Termin', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    expect((scopeSelect() as HTMLSelectElement).value).toBe('single')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(updateAppointment).toHaveBeenCalled())
    expect(vi.mocked(updateAppointment).mock.calls[0][2]).toBe('single')
    expect(vi.mocked(updateAppointment).mock.calls[0][3]).toEqual({})
  })

  it('überträgt die Änderung auf die ganze Serie', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.selectOptions(scopeSelect(), 'series')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(updateAppointment).toHaveBeenCalled())
    expect(vi.mocked(updateAppointment).mock.calls[0][2]).toBe('series')
  })

  it('schickt «dieser und folgende» mit neuem Ende als series_until', async () => {
    mockLoad([{ ...SERIES_APPT, series_rule: { freq: 'weekly', interval: 1, until: '2026-10-26' } }])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.selectOptions(scopeSelect(), 'following')
    const ende = screen.getByLabelText('Serie bis') as HTMLInputElement
    expect(ende.value).toBe('2026-10-26')
    await user.clear(ende)
    await user.type(ende, '2026-12-28')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(updateAppointment).toHaveBeenCalled())
    const [, , scope, extras] = vi.mocked(updateAppointment).mock.calls[0]
    expect(scope).toBe('following')
    expect(extras).toEqual({ series_until: '2026-12-28' })
  })

  it('wechselt den Rhythmus ab hier — mit «Serie bis» als Ende', async () => {
    mockLoad([{ ...SERIES_APPT, series_rule: { freq: 'weekly', interval: 1, until: '2026-10-26' } }])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.selectOptions(scopeSelect(), 'following')
    await user.selectOptions(screen.getByLabelText('Rhythmus ab hier'), 'biweekly')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(updateAppointment).toHaveBeenCalled())
    expect(vi.mocked(updateAppointment).mock.calls[0][3])
      .toEqual({ recurrence: { freq: 'weekly', interval: 2, until: '2026-10-26' } })
  })

  it('lässt Verschieben und Ende ändern nicht in einem Zug zu', async () => {
    mockLoad([{ ...SERIES_APPT, series_rule: { freq: 'weekly', interval: 1, until: '2026-10-26' } }])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    await user.selectOptions(scopeSelect(), 'series')
    const start = screen.getByLabelText('Start') as HTMLInputElement
    await user.clear(start)
    await user.type(start, '2026-09-08')
    const ende = screen.getByLabelText('Serie bis') as HTMLInputElement
    await user.clear(ende)
    await user.type(ende, '2026-12-28')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByText(/eins nach dem anderen/)).toBeTruthy()
    expect(updateAppointment).not.toHaveBeenCalled()
  })

  it('bietet die Reichweite bei einem Einzeltermin gar nicht an', async () => {
    mockLoad([SINGLE_APPT])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    expect(screen.queryByRole('combobox', { name: /Änderung gilt für/ })).toBeNull()
  })
})

describe('Serientermin löschen', () => {
  async function openDeleteDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTitle('Termin oder Serie entfernen'))
    return screen.findByRole('dialog', { name: 'Serientermin entfernen' })
  }

  it('löscht per Vorgabe nur den einen Termin', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    const dialog = await openDeleteDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Entfernen' }))
    await waitFor(() => expect(deleteAppointment).toHaveBeenCalledWith('a1', 'single'))
  })

  it('löscht auf Wunsch diesen und alle folgenden', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    const dialog = await openDeleteDialog(user)
    await user.click(within(dialog).getByLabelText('Dieser und alle folgenden'))
    await user.click(within(dialog).getByRole('button', { name: 'Entfernen' }))
    await waitFor(() => expect(deleteAppointment).toHaveBeenCalledWith('a1', 'following'))
  })

  it('löscht auf Wunsch die ganze Serie — mit Warnung', async () => {
    mockLoad()
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await openProject(user)

    const dialog = await openDeleteDialog(user)
    await user.click(within(dialog).getByLabelText('Ganze Serie'))
    expect(within(dialog).getByText(/auch die bereits vergangenen/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Entfernen' }))
    await waitFor(() => expect(deleteAppointment).toHaveBeenCalledWith('a1', 'series'))
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


// ─── Serie über bestehende Termine (Befund Arzt-Blocker, 11/2026) ────────────
//
// Die Rückfragen «bereits eingeplant» und «Absenz» prüften bei einer neuen Serie
// nur den ersten Termin bzw. kamen erst, als der Blocker schon angelegt war.

async function arztSerie(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '+ Blocker' }))
  await user.clear(screen.getByLabelText('Titel'))
  await user.type(screen.getByLabelText('Titel'), 'Arzt')
  await user.click(screen.getAllByRole('button', { name: 'Anna Muster' })
    .find(b => b.className.includes('project-schedule-chip'))!)
  await user.type(screen.getByLabelText('Start'), '2026-09-07')
  await user.type(screen.getByLabelText(/^Startzeit/), '08:00')
  await user.type(screen.getByLabelText(/^Endzeit/), '09:00')
  await user.selectOptions(screen.getByLabelText('Wiederholung'), 'weekly')
  await user.type(screen.getByLabelText(/Serie bis/), '2026-09-30')
  await user.click(screen.getByRole('button', { name: 'Speichern' }))
}

describe('Serie über bestehende Termine', () => {
  it('warnt auch, wenn erst ein späterer Serientermin kollidiert', async () => {
    mockLoad([{ ...SINGLE_APPT, start_date: '2026-09-21' }])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await arztSerie(user)

    expect(await screen.findByText('Mitarbeiter bereits eingeplant')).toBeTruthy()
    expect(screen.getByText(/Anna Muster: Sanierung Bad/)).toBeTruthy()
    expect(upsertProject).not.toHaveBeenCalled()
    expect(createAppointment).not.toHaveBeenCalled()
  })

  it('fragt nach Ferien, bevor der Blocker angelegt wird', async () => {
    mockLoad([])
    vi.mocked(listScheduleAbsences).mockResolvedValue([{
      staff_id: 's1', staff_name: 'Anna Muster', type: 'vacation',
      date_start: '2026-09-21', date_end: '2026-09-25', half_day: null, label: 'Ferien 21.09.–25.09.2026',
    }])
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await arztSerie(user)

    expect(await screen.findByText('Absenz im Einsatzzeitraum')).toBeTruthy()
    expect(upsertProject).not.toHaveBeenCalled()

    // «Abbrechen» lässt nichts zurück …
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(upsertProject).not.toHaveBeenCalled()

    // … «Trotzdem einplanen» legt an, mit Übersteuerung für den Server.
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await user.click(await screen.findByRole('button', { name: 'Trotzdem einplanen' }))
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1))
    expect(upsertProject).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createAppointment).mock.calls[0][1]).toMatchObject({ ignore_absence_conflicts: true })
  })

  it('legt nach einem gescheiterten Termin beim nächsten Speichern keinen zweiten Blocker an', async () => {
    mockLoad([])
    vi.mocked(upsertProject).mockResolvedValue({ project: { id: 'neu-1' } } as never)
    vi.mocked(createAppointment).mockRejectedValueOnce(new Error('netz'))
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await arztSerie(user)
    expect(await screen.findByText('Speichern fehlgeschlagen.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(2))
    expect(vi.mocked(upsertProject).mock.calls[1][0]).toMatchObject({ id: 'neu-1' })
  })
})

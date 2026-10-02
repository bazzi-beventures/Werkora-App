import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useProjectForm } from './useProjectForm'
import { DEBOUNCE_MS, useProjectAutosave } from './useProjectAutosave'
import type { Project } from '../../../api/admin/projects'

// Wann die Projektmaske sich selbst speichert (docs/specs/projektmaske-autosave.md
// §3.2–§3.7) — Formular und Autosave zusammen, so wie der Screen sie verdrahtet.

const payloads: Record<string, unknown>[] = []
let nextSave: () => Promise<unknown> = async () => ({ project: null })

const saveProjectForm = vi.fn(async (payload: Record<string, unknown>) => {
  payloads.push(payload)
  return nextSave()
})
const createAppointment = vi.fn(async () => ({}))
const updateAppointment = vi.fn(async () => ({}))
const deleteAppointment = vi.fn(async () => {})
const getProjectAppointments = vi.fn(async () => [] as unknown[])

vi.mock('../../../api/admin/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/admin/projects')>()
  return {
    ...actual,
    saveProjectForm: (...a: unknown[]) => saveProjectForm(...(a as [Record<string, unknown>])),
  }
})

vi.mock('../../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/admin')>()
  return {
    ...actual,
    createAppointment: (...a: unknown[]) => (createAppointment as (...x: unknown[]) => unknown)(...a),
    updateAppointment: (...a: unknown[]) => (updateAppointment as (...x: unknown[]) => unknown)(...a),
    deleteAppointment: (...a: unknown[]) => (deleteAppointment as (...x: unknown[]) => unknown)(...a),
    getProjectAppointments: (...a: unknown[]) => (getProjectAppointments as (...x: unknown[]) => unknown)(...a),
  }
})

const PROJEKT = {
  id: 'p-1', name: 'Fassade Seehalde', projektleiter_id: 's-1', monteur_ids: ['s-2'],
  kontakte: [], art_der_arbeit: ['Neumontage'], kind: 'project',
} as unknown as Project

function setup(project: Project = PROJEKT) {
  const gemeldet: Record<string, unknown>[] = []
  const hook = renderHook(() => {
    const form = useProjectForm({
      project, customers: [], schedulingEnabled: true, focusDetails: () => {}, autosave: true,
    })
    const autosave = useProjectAutosave(form, true, p => gemeldet.push(p))
    return { form, autosave }
  })
  return { ...hook, gemeldet }
}

async function warte(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

beforeEach(() => {
  vi.useFakeTimers()
  payloads.length = 0
  nextSave = async () => ({ project: null })
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Projektmaske speichert sich selbst', () => {
  it('Getipptes wartet die Pause nach dem LETZTEN Tastendruck ab', async () => {
    const { result } = setup()
    act(() => { result.current.form.setBemerkung('S') })
    await warte(DEBOUNCE_MS - 500)
    act(() => { result.current.form.setBemerkung('Schlüssel') })
    await warte(DEBOUNCE_MS - 100)
    expect(saveProjectForm).not.toHaveBeenCalled()

    await warte(200)
    expect(payloads).toEqual([{ name: 'Fassade Seehalde', bemerkung: 'Schlüssel' }])
    expect(result.current.autosave.status).toBe('saved')
    expect(result.current.form.autosaveDirtyFields).toEqual([])
  })

  it('ein Klick speichert sofort', async () => {
    const { result, gemeldet } = setup()
    act(() => { result.current.form.toggleArt('Demontage') })
    await warte(10)
    expect(payloads).toEqual([{ name: 'Fassade Seehalde', art_der_arbeit: ['Neumontage', 'Demontage'] }])
    expect(gemeldet).toHaveLength(1)
  })

  it('Feld verlassen speichert sofort', async () => {
    const { result } = setup()
    act(() => { result.current.form.setObjectName('MFH Sonnhalde') })
    act(() => { void result.current.autosave.flush() })
    await warte(10)
    expect(payloads).toEqual([{ name: 'Fassade Seehalde', object_name: 'MFH Sonnhalde' }])
  })

  it('eine getippte Adresse geht nie per Pause, erst beim Verlassen', async () => {
    const { result } = setup()
    act(() => { result.current.form.setObjectAddress('Neuweg 2') })
    await warte(DEBOUNCE_MS * 4)
    expect(saveProjectForm).not.toHaveBeenCalled()

    act(() => { void result.current.autosave.flush() })
    await warte(10)
    expect(payloads).toEqual([{ name: 'Fassade Seehalde', object_address: 'Neuweg 2' }])
  })

  it('ein gewählter Adress-Vorschlag geht sofort, mit Koordinaten', async () => {
    const { result } = setup()
    act(() => { result.current.form.pickObjectAddress('Neuweg 2, 8004 Zürich', 47.37, 8.52) })
    await warte(10)
    expect(payloads[0]).toMatchObject({ object_address: 'Neuweg 2, 8004 Zürich', object_lat: 47.37, object_lon: 8.52 })
  })

  it('während eines Requests Getipptes geht danach — und nur das', async () => {
    let freigeben!: () => void
    nextSave = () => new Promise(r => { freigeben = () => r({ project: null }) })
    const { result } = setup()

    act(() => { result.current.form.toggleArt('Demontage') })
    await warte(10)
    expect(payloads).toHaveLength(1)

    act(() => { result.current.form.setObjectName('MFH') })
    await warte(DEBOUNCE_MS + 10)
    // Der erste Request läuft noch — kein zweiter parallel.
    expect(payloads).toHaveLength(1)

    nextSave = async () => ({ project: null })
    await act(async () => { freigeben() })
    await warte(10)
    expect(payloads).toHaveLength(2)
    expect(payloads[1]).toEqual({ name: 'Fassade Seehalde', object_name: 'MFH' })
  })

  it('ein Fehler bleibt stehen, das Feld bleibt offen und geht beim nächsten Mal mit', async () => {
    nextSave = async () => { throw new Error('Serverfehler (HTTP 500)') }
    const { result } = setup()
    act(() => { result.current.form.setBemerkung('A') })
    await warte(DEBOUNCE_MS + 10)
    expect(result.current.autosave.status).toBe('error')
    expect(result.current.autosave.error).toBe('Serverfehler (HTTP 500)')
    expect(result.current.form.autosaveDirtyFields).toEqual(['bemerkung'])

    nextSave = async () => ({ project: null })
    // Kein Endlos-Retry: ohne Anstoss passiert nichts.
    await warte(DEBOUNCE_MS * 3)
    expect(payloads).toHaveLength(1)

    act(() => { result.current.form.setObjectName('B') })
    await warte(DEBOUNCE_MS + 10)
    expect(payloads[1]).toEqual({ name: 'Fassade Seehalde', bemerkung: 'A', object_name: 'B' })
    expect(result.current.autosave.status).toBe('saved')
  })

  it('ein leerer Name wartet, die anderen Felder gehen trotzdem', async () => {
    const { result } = setup()
    act(() => {
      result.current.form.setName('')
      result.current.form.setBemerkung('X')
    })
    await warte(DEBOUNCE_MS + 10)
    expect(payloads).toEqual([{ name: 'Fassade Seehalde', bemerkung: 'X' }])
    expect(result.current.form.autosaveDirtyFields).toEqual(['name'])
  })
})

describe('Team: sammeln, dann übernehmen (§3.3)', () => {
  it('Chips klicken schreibt nichts — erst «Team übernehmen»', async () => {
    const { result } = setup()
    act(() => { result.current.form.toggleMonteur('s-3') })
    act(() => { result.current.form.toggleMonteur('s-4') })
    await warte(DEBOUNCE_MS * 3)
    expect(saveProjectForm).not.toHaveBeenCalled()
    expect(result.current.form.teamDirty).toBe(true)

    act(() => { void result.current.autosave.run(f => f.commitTeam()) })
    await warte(10)
    expect(payloads).toEqual([{ name: 'Fassade Seehalde', monteur_ids: ['s-2', 's-3', 's-4'] }])
    expect(result.current.form.teamDirty).toBe(false)
  })

  it('hinter einem laufenden Autosave schickt es den NEUEN Namen mit, nicht den alten', async () => {
    let freigeben!: () => void
    nextSave = () => new Promise(r => { freigeben = () => r({ project: null }) })
    const { result } = setup()
    act(() => { result.current.form.setName('Fassade Seehalde Ost') })
    await warte(DEBOUNCE_MS + 10)
    expect(payloads).toEqual([{ name: 'Fassade Seehalde Ost' }])

    // Team übernehmen, während der Namens-PATCH noch läuft.
    act(() => { result.current.form.toggleMonteur('s-3') })
    act(() => { void result.current.autosave.run(f => f.commitTeam()) })
    nextSave = async () => ({ project: null })
    await act(async () => { freigeben() })
    await warte(10)
    await warte(10)
    expect(payloads[1]).toEqual({ name: 'Fassade Seehalde Ost', monteur_ids: ['s-2', 's-3'] })
  })

  it('«Verwerfen» stellt das gespeicherte Team wieder her', () => {
    const { result } = setup()
    act(() => { result.current.form.toggleMonteur('s-3') })
    act(() => { result.current.form.resetTeam() })
    expect(result.current.form.monteurIds).toEqual(['s-2'])
    expect(result.current.form.teamDirty).toBe(false)
  })
})

describe('Projektleiter (§3.5)', () => {
  it('ohne Projektleiter fragt ein gespeichertes Feld NICHT nach', async () => {
    const { result } = setup({ ...PROJEKT, projektleiter_id: null } as unknown as Project)
    act(() => { result.current.form.setBemerkung('X') })
    await warte(DEBOUNCE_MS + 10)
    expect(result.current.form.projektleiterQuestion).toBe(false)
    expect(payloads).toHaveLength(1)
  })

  it('das Entfernen fragt — «Projektleiter wählen» lässt ihn stehen', async () => {
    const { result } = setup()
    act(() => { result.current.form.setProjektleiterId('') })
    await warte(10)
    expect(result.current.form.projektleiterQuestion).toBe(true)
    expect(saveProjectForm).not.toHaveBeenCalled()

    act(() => { result.current.form.answerProjektleiterQuestion('cancel') })
    await warte(DEBOUNCE_MS + 10)
    expect(result.current.form.projektleiterId).toBe('s-1')
    expect(saveProjectForm).not.toHaveBeenCalled()
  })

  it('«Trotzdem speichern» leert ihn auf dem Server', async () => {
    const { result } = setup()
    act(() => { result.current.form.setProjektleiterId('') })
    await warte(10)
    act(() => { result.current.form.answerProjektleiterQuestion('save') })
    // Zwei Takte: Antwort → Setter → Rendern → Sofort-Timer → Speichern.
    await warte(10)
    await warte(10)
    expect(payloads).toEqual([{ name: 'Fassade Seehalde', projektleiter_id: '' }])
  })

  it('ein anderer Projektleiter geht ohne Frage sofort', async () => {
    const { result } = setup()
    act(() => { result.current.form.setProjektleiterId('s-9') })
    await warte(10)
    expect(result.current.form.projektleiterQuestion).toBe(false)
    expect(payloads).toEqual([{ name: 'Fassade Seehalde', projektleiter_id: 's-9' }])
  })
})

describe('Termine einzeln (§3.4)', () => {
  it('speichert nur den einen Termin, nicht die Projektzeile', async () => {
    getProjectAppointments.mockResolvedValueOnce([
      { id: 'a-1', project_id: 'p-1', start_date: '2026-10-05', end_date: null, start_time: null,
        end_time: null, kind: 'montage', label: null, monteur_ids: [] },
    ])
    const { result } = setup()
    act(() => {
      result.current.form.changeAppointments([{
        key: 'neu-1', id: null, startDate: '2026-10-05', endDate: '', startTime: '', endTime: '',
        kind: 'montage', label: '', ownTeam: false, monteurIds: [],
      }])
    })
    let err = 'x'
    await act(async () => { err = await result.current.form.commitAppointment('neu-1') })
    expect(err).toBe('')
    expect(createAppointment).toHaveBeenCalledTimes(1)
    expect(saveProjectForm).not.toHaveBeenCalled()
    expect(result.current.form.appointmentsDirty).toBe(false)
    expect(result.current.form.appointments.map(d => d.id)).toEqual(['a-1'])
  })

  it('ein ungültiger Termin wird nicht geschickt', async () => {
    const { result } = setup()
    act(() => {
      result.current.form.changeAppointments([{
        key: 'neu-1', id: null, startDate: '', endDate: '', startTime: '', endTime: '',
        kind: 'montage', label: '', ownTeam: false, monteurIds: [],
      }])
    })
    let err = ''
    await act(async () => { err = await result.current.form.commitAppointment('neu-1') })
    expect(err).toBe('Startdatum fehlt.')
    expect(createAppointment).not.toHaveBeenCalled()
  })
})

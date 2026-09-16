import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useProjectForm } from './useProjectForm'
import type { Project } from '../../../api/admin/projects'

// Ein Projekt ohne Projektleiter ist erlaubt — beim Anlegen steht der
// Zustaendige nicht immer schon fest. Still passieren soll es aber nicht:
// frueher trug das Backend den Erfasser ein, jetzt bleibt das Feld leer, und
// die Maske fragt einmal nach, bevor sie so speichert.

const calls: string[] = []
// Die Nutzlast der Projektzeile, so wie sie beim Server ankaeme.
const payloads: Record<string, unknown>[] = []

const saveProjectForm = vi.fn(async (payload: Record<string, unknown>) => {
  calls.push('project')
  payloads.push(payload)
  return { project: null }
})

vi.mock('../../../api/admin/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/admin/projects')>()
  return {
    ...actual,
    saveProjectForm: (...a: unknown[]) => saveProjectForm(...(a as [Record<string, unknown>])),
  }
})

function setup(project: Project | null) {
  return renderHook(() => useProjectForm({
    project,
    customers: [],
    // Ohne Modul «scheduling» ruehrt persist die Termin-Endpunkte nicht an —
    // hier geht es nur um die Projektzeile.
    schedulingEnabled: false,
    focusDetails: () => {},
  }))
}

function neuesProjekt() {
  const hook = setup(null)
  act(() => { hook.result.current.setName('Fassade Seehalde') })
  return hook
}

beforeEach(() => {
  calls.length = 0
  payloads.length = 0
  vi.clearAllMocks()
})

describe('useProjectForm — Speichern ohne Projektleiter', () => {
  it('ein neues Projekt startet ohne Projektleiter', () => {
    const { result } = setup(null)
    expect(result.current.projektleiterId).toBe('')
  })

  it('fragt nach, bevor ohne Projektleiter gespeichert wird', async () => {
    const { result } = neuesProjekt()

    let persisted: unknown
    act(() => { persisted = result.current.persist() })
    await waitFor(() => expect(result.current.projektleiterQuestion).toBe(true))
    // Solange die Frage offen ist, wurde noch nichts geschrieben.
    expect(calls).toEqual([])

    act(() => { result.current.answerProjektleiterQuestion('save') })
    await act(async () => { await persisted })

    expect(calls).toEqual(['project'])
    expect(payloads[0]).toMatchObject({ projektleiter_id: null })
  })

  it('«Projektleiter wählen» bricht das Speichern ab und laesst die Maske offen', async () => {
    const { result } = neuesProjekt()

    let persisted: unknown
    act(() => { persisted = result.current.persist() })
    await waitFor(() => expect(result.current.projektleiterQuestion).toBe(true))
    act(() => { result.current.answerProjektleiterQuestion('cancel') })
    await act(async () => { expect(await persisted).toBe(false) })

    expect(calls).toEqual([])
    expect(result.current.projektleiterQuestion).toBe(false)
    expect(result.current.isDirty).toBe(true)
  })

  it('fragt nicht, wenn ein Projektleiter gewaehlt ist', async () => {
    const { result } = neuesProjekt()
    act(() => { result.current.setProjektleiterId('s-pl') })
    await act(async () => { await result.current.persist() })

    expect(result.current.projektleiterQuestion).toBe(false)
    expect(calls).toEqual(['project'])
  })

  it('fragt auch bei einem bestehenden Projekt ohne Projektleiter', async () => {
    const { result } = setup({
      id: 'p-1', name: 'Gottardi Gutenswil', kontakte: [], art_der_arbeit: [],
    } as unknown as Project)
    act(() => { result.current.setBemerkung('nur ein Kommentar') })

    let persisted: unknown
    act(() => { persisted = result.current.persist() })
    await waitFor(() => expect(result.current.projektleiterQuestion).toBe(true))
    act(() => { result.current.answerProjektleiterQuestion('save') })
    await act(async () => { await persisted })

    expect(calls).toEqual(['project'])
  })

  // Der Name ist Pflicht, der Projektleiter nicht: die harte Pruefung liegt
  // VOR der Rueckfrage, sonst stuende der Dialog vor einer Fehlermeldung.
  it('meldet den fehlenden Projektnamen, ohne nach dem Projektleiter zu fragen', async () => {
    const { result } = setup(null)
    await act(async () => { expect(await result.current.persist()).toBe(false) })

    expect(result.current.projektleiterQuestion).toBe(false)
    expect(result.current.error).toBe('Projektname ist erforderlich.')
    expect(calls).toEqual([])
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useProjectForm } from './useProjectForm'
import type { Project } from '../../../api/admin/projects'
import type { ProjectAppointment } from '../../../api/admin'

// Ein Termin ohne eigenes Team erbt das Projekt-Team — live. Wer für einen
// zweiten Termin einen anderen Monteur über die Projekt-Team-Chips wählt,
// besetzt sonst still auch den ersten (womöglich längst vergangenen) Termin um.
// Hier wird die Rückfrage geprüft, die davor liegt, und dass «Bestehende
// behalten» das bisherige Team VOR dem Projekt-Write festschreibt (sonst meldet
// der Termin-Änderungs-Push allen Monteuren eine Änderung, die es nicht gibt).

const calls: string[] = []

const updateAppointment = vi.fn(async (id: string, data: Record<string, unknown>) => {
  calls.push(`appointment:${id}:${JSON.stringify(data.monteur_ids)}`)
  return {} as ProjectAppointment
})
const createAppointment = vi.fn(async () => { calls.push('appointment:create'); return {} as ProjectAppointment })
const deleteAppointment = vi.fn(async () => { calls.push('appointment:delete') })
const getProjectAppointments = vi.fn(async (): Promise<ProjectAppointment[]> => APPOINTMENTS)
const saveProjectForm = vi.fn(async () => { calls.push('project'); return { project: null } })

vi.mock('../../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/admin')>()
  return {
    ...actual,
    createAppointment: (...a: unknown[]) => createAppointment(...(a as [])),
    deleteAppointment: (...a: unknown[]) => deleteAppointment(...(a as [])),
    getProjectAppointments: (...a: unknown[]) => getProjectAppointments(...(a as [])),
    updateAppointment: (...a: unknown[]) => updateAppointment(...(a as [string, Record<string, unknown>])),
  }
})

vi.mock('../../../api/admin/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/admin/projects')>()
  return { ...actual, saveProjectForm: (...a: unknown[]) => saveProjectForm(...(a as [])) }
})

const PROJECT = {
  id: 'p-1',
  name: 'Gottardi Gutenswil',
  monteur_ids: ['s-marvin', 's-franco'],
  kontakte: [],
  art_der_arbeit: [],
} as unknown as Project

// Ein bereits gespeicherter Termin OHNE eigenes Team — er hängt am Projekt-Team.
const APPOINTMENTS: ProjectAppointment[] = [{
  id: 'a-1', project_id: 'p-1',
  start_date: '2026-08-25', end_date: null,
  start_time: '15:30:00', end_time: '17:00:00',
  kind: 'montage', label: null, monteur_ids: null,
}]

function setup() {
  return renderHook(() => useProjectForm({
    project: PROJECT,
    customers: [],
    schedulingEnabled: true,
    focusDetails: () => {},
  }))
}

async function withLoadedAppointments() {
  const hook = setup()
  await act(async () => { await hook.result.current.loadAppointments() })
  return hook
}

beforeEach(() => {
  calls.length = 0
  vi.clearAllMocks()
})

describe('useProjectForm — Projekt-Team-Wechsel', () => {
  it('fragt nach, bevor ein Team-Wechsel bestehende Termine mit umbesetzt', async () => {
    const { result } = await withLoadedAppointments()
    act(() => { result.current.toggleMonteur('s-kevin') })

    let persisted: unknown
    act(() => { persisted = result.current.persist() })
    await waitFor(() => expect(result.current.teamQuestion).toEqual({ count: 1 }))
    // Solange die Frage offen ist, wurde noch nichts geschrieben.
    expect(calls).toEqual([])

    act(() => { result.current.answerTeamQuestion('keep') })
    await act(async () => { await persisted })

    // Reihenfolge zählt: erst das Team auf dem Termin festhalten, dann das Projekt.
    expect(calls).toEqual(['appointment:a-1:["s-marvin","s-franco"]', 'project'])
  })

  it('«Überall übernehmen» lässt die Termine am (neuen) Projekt-Team hängen', async () => {
    const { result } = await withLoadedAppointments()
    act(() => { result.current.toggleMonteur('s-kevin') })

    let persisted: unknown
    act(() => { persisted = result.current.persist() })
    await waitFor(() => expect(result.current.teamQuestion).not.toBeNull())
    act(() => { result.current.answerTeamQuestion('apply') })
    await act(async () => { await persisted })

    expect(calls).toEqual(['project'])
  })

  it('«Abbrechen» schreibt gar nichts', async () => {
    const { result } = await withLoadedAppointments()
    act(() => { result.current.toggleMonteur('s-kevin') })

    let persisted: unknown
    act(() => { persisted = result.current.persist() })
    await waitFor(() => expect(result.current.teamQuestion).not.toBeNull())
    act(() => { result.current.answerTeamQuestion('cancel') })
    await act(async () => { expect(await persisted).toBe(false) })

    expect(calls).toEqual([])
    expect(result.current.isDirty).toBe(true)
  })

  it('fragt nicht, wenn der Termin ein eigenes Team hat', async () => {
    getProjectAppointments.mockResolvedValueOnce([{ ...APPOINTMENTS[0], monteur_ids: ['s-marvin'] }])
    const { result } = await withLoadedAppointments()
    act(() => { result.current.toggleMonteur('s-kevin') })
    await act(async () => { await result.current.persist() })

    expect(result.current.teamQuestion).toBeNull()
    expect(calls).toEqual(['project'])
  })

  it('fragt nicht, wenn das Projekt-Team unverändert bleibt', async () => {
    const { result } = await withLoadedAppointments()
    act(() => { result.current.setBemerkung('nur ein Kommentar') })
    await act(async () => { await result.current.persist() })

    expect(result.current.teamQuestion).toBeNull()
    expect(calls).toEqual(['project'])
  })
})

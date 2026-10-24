import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useProjectForm } from './useProjectForm'
import { resetSessionAsked } from './projektleiterRueckfrage'
import type { Project } from '../../../api/admin/projects'

// «Projektleiter übernehmen?» im Hook (docs/specs/projektleiter-uebernahme.md):
// gefragt wird NACH dem Speichern, und ein «Ja» setzt den Projektleiter auf
// demselben Weg wie die Auswahl im Feld.

const payloads: Record<string, unknown>[] = []
const saveProjectForm = vi.fn(async (payload: Record<string, unknown>) => {
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

const PROJECT = {
  id: 'p-1', name: 'Gottardi Gutenswil', kontakte: [], art_der_arbeit: [], projektleiter_id: 's-anna',
} as unknown as Project

function setup(takeoverEnabled = true) {
  return renderHook(() => useProjectForm({
    project: PROJECT,
    customers: [],
    schedulingEnabled: false,
    focusDetails: () => {},
    autosave: true,
    takeover: { enabled: takeoverEnabled, userId: 'u-ich', myStaffId: 's-ich', iAmProjektleiter: true },
  }))
}

beforeEach(() => {
  payloads.length = 0
  vi.clearAllMocks()
  localStorage.clear()
  resetSessionAsked()
})

describe('useProjectForm — Projektleiter übernehmen?', () => {
  it('fragt nach dem Autosave einer inhaltlichen Änderung, nicht davor', async () => {
    const { result } = setup()
    act(() => { result.current.setName('Gottardi Gutenswil AG') })
    expect(result.current.takeoverQuestion).toBe(false)
    await act(async () => { await result.current.persistAuto() })
    expect(payloads).toHaveLength(1)
    expect(result.current.takeoverQuestion).toBe(true)
  })

  it('«Ja» setzt mich als Projektleiter — der nächste Autosave schreibt es', async () => {
    const { result } = setup()
    act(() => { result.current.setName('Neu') })
    await act(async () => { await result.current.persistAuto() })
    await act(async () => { result.current.answerTakeoverQuestion('take', false) })
    expect(result.current.takeoverQuestion).toBe(false)
    expect(result.current.projektleiterId).toBe('s-ich')
    await act(async () => { await result.current.persistAuto() })
    expect(payloads[1]).toMatchObject({ projektleiter_id: 's-ich' })
    // Die eigene PL-Änderung löst keine zweite Frage aus.
    expect(result.current.takeoverQuestion).toBe(false)
  })

  it('fragt in derselben Sitzung nur einmal — auch nach einem Remount', async () => {
    const first = setup()
    act(() => { first.result.current.setName('Eins') })
    await act(async () => { await first.result.current.persistAuto() })
    act(() => { first.result.current.answerTakeoverQuestion('decline', false) })
    first.unmount()

    const second = setup()
    act(() => { second.result.current.setName('Zwei') })
    await act(async () => { await second.result.current.persistAuto() })
    expect(second.result.current.takeoverQuestion).toBe(false)
  })

  it('«Nicht mehr fragen» hält auch über die Sitzung hinaus', async () => {
    const { result } = setup()
    act(() => { result.current.setName('Eins') })
    await act(async () => { await result.current.persistAuto() })
    act(() => { result.current.answerTakeoverQuestion('decline', true) })
    expect(result.current.projektleiterId).toBe('s-anna')
    expect(JSON.parse(localStorage.getItem('pl-frage-aus:u-ich') ?? '[]')).toEqual(['p-1'])

    resetSessionAsked()   // neue Sitzung
    act(() => { result.current.setName('Zwei') })
    await act(async () => { await result.current.persistAuto() })
    expect(result.current.takeoverQuestion).toBe(false)
  })

  it('keine Frage bei einer reinen Notiz oder ohne Feature', async () => {
    const notiz = setup()
    act(() => { notiz.result.current.setBemerkung('nur eine Notiz') })
    await act(async () => { await notiz.result.current.persistAuto() })
    expect(notiz.result.current.takeoverQuestion).toBe(false)

    const aus = setup(false)
    act(() => { aus.result.current.setName('Neu') })
    await act(async () => { await aus.result.current.persistAuto() })
    expect(aus.result.current.takeoverQuestion).toBe(false)
  })

  it('auch der manuelle Speicherpfad fragt danach', async () => {
    const { result } = setup()
    act(() => { result.current.setName('Manuell') })
    await act(async () => { await result.current.persist() })
    expect(payloads).toHaveLength(1)
    expect(result.current.takeoverQuestion).toBe(true)
  })
})

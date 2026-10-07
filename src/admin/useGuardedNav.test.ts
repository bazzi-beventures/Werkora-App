import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useGuardedNav } from './useGuardedNav'
import { registerUnsavedChangesGuard, resetUnsavedChangesGuard } from './unsavedChanges'

// Support-Meldung 2026-10-07: «Speichern» in der Abfrage hing auf «Speichern…»,
// weil das Speichern eine Rückfrage stellte, die verdeckt unter der noch offenen
// Abfrage lag. Kernzusicherung: die Abfrage ist weg, BEVOR gespeichert wird.

function setup(guard: Parameters<typeof registerUnsavedChangesGuard>[0] | null) {
  if (guard) registerUnsavedChangesGuard(guard)
  const nav = vi.fn()
  const hook = renderHook(() => useGuardedNav(nav))
  return { nav, hook }
}

beforeEach(() => resetUnsavedChangesGuard())

describe('useGuardedNav', () => {
  it('navigiert ohne Rückfrage, wenn nichts offen ist', () => {
    const { nav, hook } = setup(null)
    act(() => hook.result.current.guardedNav('quotes'))
    expect(nav).toHaveBeenCalledWith('quotes', undefined)
    expect(hook.result.current.pending).toBeNull()
  })

  it('schliesst die Abfrage, bevor gespeichert wird, und navigiert danach', async () => {
    let resolveSave!: (ok: boolean) => void
    const save = vi.fn(() => new Promise<boolean>(r => { resolveSave = r }))
    const { nav, hook } = setup({ isDirty: () => true, save })

    act(() => hook.result.current.guardedNav('projects', 'p-2'))
    expect(hook.result.current.pending).toMatchObject({ screen: 'projects', detailId: 'p-2', allowSave: true })

    let saving!: Promise<void>
    act(() => { saving = hook.result.current.save() })
    // Das Speichern läuft noch (z. B. wartet es auf «Kein Projektleiter») —
    // die Abfrage darf es nicht mehr verdecken.
    expect(save).toHaveBeenCalledOnce()
    expect(hook.result.current.pending).toBeNull()
    expect(nav).not.toHaveBeenCalled()

    await act(async () => { resolveSave(true); await saving })
    expect(nav).toHaveBeenCalledWith('projects', 'p-2')
  })

  it('bleibt, wenn das Speichern scheitert oder abgebrochen wird', async () => {
    const { nav, hook } = setup({ isDirty: () => true, save: async () => false })
    act(() => hook.result.current.guardedNav('quotes'))
    await act(async () => { await hook.result.current.save() })
    expect(nav).not.toHaveBeenCalled()
    expect(hook.result.current.pending).toBeNull()
  })

  it('bleibt, wenn das Speichern wirft', async () => {
    const { nav, hook } = setup({ isDirty: () => true, save: async () => { throw new Error('x') } })
    act(() => hook.result.current.guardedNav('quotes'))
    await act(async () => { await hook.result.current.save() })
    expect(nav).not.toHaveBeenCalled()
  })

  it('navigiert nach dem Speichern nicht mehr, wenn inzwischen woandershin geklickt wurde', async () => {
    let dirty = true
    let resolveSave!: (ok: boolean) => void
    const { nav, hook } = setup({
      isDirty: () => dirty,
      save: () => new Promise<boolean>(r => { resolveSave = r }),
    })
    act(() => hook.result.current.guardedNav('quotes'))
    let saving!: Promise<void>
    act(() => { saving = hook.result.current.save() })
    dirty = false
    act(() => hook.result.current.guardedNav('invoices'))
    await act(async () => { resolveSave(true); await saving })

    expect(nav).toHaveBeenCalledTimes(1)
    expect(nav).toHaveBeenCalledWith('invoices', undefined)
  })

  it('merkt sich beim Öffnen, ob «Speichern» angeboten wird', () => {
    const isDirty = vi.fn(() => true)
    const { hook } = setup({ isDirty, save: async () => true, canSave: () => false })
    act(() => hook.result.current.guardedNav('quotes'))
    expect(hook.result.current.pending?.allowSave).toBe(false)
    // Kein erneutes Fragen beim Neuzeichnen — isDirty stösst ein Autosave an.
    const calls = isDirty.mock.calls.length
    hook.rerender()
    expect(isDirty.mock.calls.length).toBe(calls)
  })

  it('«Verwerfen» navigiert, «Abbrechen» bleibt', () => {
    const { nav, hook } = setup({ isDirty: () => true, save: async () => true })
    act(() => hook.result.current.guardedNav('quotes'))
    act(() => hook.result.current.cancel())
    expect(nav).not.toHaveBeenCalled()
    act(() => hook.result.current.guardedNav('quotes'))
    act(() => hook.result.current.discard())
    expect(nav).toHaveBeenCalledWith('quotes', undefined)
  })
})

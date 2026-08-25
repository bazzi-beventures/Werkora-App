import { describe, it, expect, beforeEach, vi } from 'vitest'
import { dirtyGuard, registerUnsavedChangesGuard, resetUnsavedChangesGuard } from './unsavedChanges'

describe('unsavedChanges-Registry', () => {
  beforeEach(() => resetUnsavedChangesGuard())

  it('liefert keinen Guard, solange nichts registriert ist', () => {
    expect(dirtyGuard()).toBeNull()
  })

  it('liefert einen registrierten, aber sauberen Guard nicht aus', () => {
    registerUnsavedChangesGuard({ isDirty: () => false, save: async () => true })
    expect(dirtyGuard()).toBeNull()
  })

  it('liefert den Guard, sobald er ungespeicherte Änderungen meldet', () => {
    const guard = { isDirty: () => true, save: async () => true }
    registerUnsavedChangesGuard(guard)
    expect(dirtyGuard()).toBe(guard)
  })

  it('meldet den Guard beim Aufräumen wieder ab', () => {
    const unregister = registerUnsavedChangesGuard({ isDirty: () => true, save: async () => true })
    unregister()
    expect(dirtyGuard()).toBeNull()
  })

  it('räumt der alte Guard auf, bleibt ein inzwischen registrierter neuer aktiv', () => {
    // Beim Screen-Wechsel montiert React die neue Maske vor dem Cleanup der alten.
    const alt = { isDirty: () => true, save: async () => true }
    const neu = { isDirty: () => true, save: async () => true }
    const unregisterAlt = registerUnsavedChangesGuard(alt)
    registerUnsavedChangesGuard(neu)
    unregisterAlt()
    expect(dirtyGuard()).toBe(neu)
  })

  it('reicht das Ergebnis von save() durch', async () => {
    const save = vi.fn(async () => false)
    registerUnsavedChangesGuard({ isDirty: () => true, save })
    expect(await dirtyGuard()!.save()).toBe(false)
    expect(save).toHaveBeenCalledOnce()
  })

  // Ein Guard ohne canSave ist der Normalfall (Maske speichert sich selbst) — die
  // Abfrage muss dann weiterhin «Speichern» anbieten.
  it('behandelt einen Guard ohne canSave als speicherbar', () => {
    registerUnsavedChangesGuard({ isDirty: () => true, save: async () => true })
    expect(dirtyGuard()?.canSave?.() !== false).toBe(true)
  })

  it('reicht ein canSave=false durch', () => {
    registerUnsavedChangesGuard({
      isDirty: () => true, save: async () => true, canSave: () => false,
    })
    expect(dirtyGuard()?.canSave?.() !== false).toBe(false)
  })
})

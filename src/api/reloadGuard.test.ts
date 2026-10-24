import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  beginMutation, canReloadNow, endMutation, registerReloadBlocker, resetReloadGuard,
} from './reloadGuard'
import { registerUnsavedChangesGuard, resetUnsavedChangesGuard } from '../admin/unsavedChanges'

// docs/specs/pwa-neuladen.md §3.1 — die eine Frage, bevor ein App-Update neu lädt.

describe('canReloadNow', () => {
  beforeEach(() => { resetReloadGuard(); resetUnsavedChangesGuard() })
  afterEach(() => { document.body.innerHTML = '' })

  it('leere App: ja', () => {
    expect(canReloadNow()).toBe(true)
  })

  it('Admin-Maske mit ungespeicherten Änderungen: nein', () => {
    const ab = registerUnsavedChangesGuard({ isDirty: () => true, save: async () => true })
    expect(canReloadNow()).toBe(false)
    ab()
    expect(canReloadNow()).toBe(true)
  })

  it('angefangener Rapport (Blocker): nein — auch wenn der Blocker selbst scheitert', () => {
    const ab = registerReloadBlocker(() => true)
    expect(canReloadNow()).toBe(false)
    ab()
    registerReloadBlocker(() => { throw new Error('kaputt') })
    expect(canReloadNow()).toBe(false)
  })

  it('laufender schreibender Request: nein, bis er fertig ist', () => {
    beginMutation()
    beginMutation()
    endMutation()
    expect(canReloadNow()).toBe(false)
    endMutation()
    expect(canReloadNow()).toBe(true)
  })

  it('Tippen in ein Feld: nein; ein leeres fokussiertes Feld: ja', () => {
    document.body.innerHTML = '<textarea id="t"></textarea><input id="c" type="checkbox">'
    const feld = document.getElementById('t') as HTMLTextAreaElement
    feld.focus()
    expect(canReloadNow()).toBe(true)
    feld.value = 'Halber Satz'
    expect(canReloadNow()).toBe(false)
    ;(document.getElementById('c') as HTMLInputElement).focus()
    expect(canReloadNow()).toBe(true)
  })
})

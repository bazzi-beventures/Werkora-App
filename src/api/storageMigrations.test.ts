import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runStorageMigrations, APP_DATA_VERSION } from './storageMigrations'
import { SK } from './storageKeys'

// Interner Key aus storageMigrations.ts (nicht exportiert) — hier als Literal
// gespiegelt, damit die Tests die persistierte Version direkt prüfen können.
const VERSION_KEY = 'app_data_version'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runStorageMigrations — voller Lauf v0 → aktuell', () => {
  it('entfernt unbekannte Legacy-Keys, behält aktive Keys und setzt die Version', () => {
    // Frischer Client ohne Versionsmarker → readVersion() == 0 → ganze Kette läuft.
    localStorage.setItem(SK.TENANT_SLUG, 'acme')
    localStorage.setItem('zeit_offline_queue', '[]')
    localStorage.setItem('admin-theme', 'dark')
    localStorage.setItem('legacy_garbage_key', 'müll') // unbekannt
    localStorage.setItem(SK.TOKEN, 'altes-token') // wird in v3→v4 entfernt

    runStorageMigrations()

    // Whitelist überlebt
    expect(localStorage.getItem(SK.TENANT_SLUG)).toBe('acme')
    expect(localStorage.getItem('zeit_offline_queue')).toBe('[]')
    expect(localStorage.getItem('admin-theme')).toBe('dark')
    // Unbekannter Key (0→1) und Alt-Token (3→4) sind weg
    expect(localStorage.getItem('legacy_garbage_key')).toBeNull()
    expect(localStorage.getItem(SK.TOKEN)).toBeNull()
    // Version steht auf dem aktuellen Stand
    expect(localStorage.getItem(VERSION_KEY)).toBe(String(APP_DATA_VERSION))
  })
})

describe('runStorageMigrations — einzelne Migration v3 → v4', () => {
  it('entfernt das Alt-Token (isoliert ab Version 3, ohne Whitelist-Putz)', () => {
    // Ab Version 3 läuft der Großputz (0→1) NICHT mehr — das Token kann hier nur
    // durch die gezielte 3→4-Migration verschwinden.
    localStorage.setItem(VERSION_KEY, '3')
    localStorage.setItem(SK.TOKEN, 'altes-token')

    runStorageMigrations()

    expect(localStorage.getItem(SK.TOKEN)).toBeNull()
    expect(localStorage.getItem(VERSION_KEY)).toBe(String(APP_DATA_VERSION))
  })
})

describe('runStorageMigrations — No-op-Pfade', () => {
  it('macht nichts, wenn die Version bereits aktuell ist', () => {
    localStorage.setItem(VERSION_KEY, String(APP_DATA_VERSION))
    localStorage.setItem('legacy_garbage_key', 'müll')

    runStorageMigrations()

    // Kein Wipe: auch der unbekannte Key bleibt unberührt
    expect(localStorage.getItem('legacy_garbage_key')).toBe('müll')
    expect(localStorage.getItem(VERSION_KEY)).toBe(String(APP_DATA_VERSION))
  })

  it('reine No-op-Migration (v8→v9) löscht keine unbekannten Keys', () => {
    // Beweist, dass nur der gezielte Großputz (0→1) bzw. ein Wipe Keys entfernt,
    // nicht jeder Versionssprung.
    localStorage.setItem(VERSION_KEY, '8')
    localStorage.setItem('irgendein_key', 'bleibt')

    runStorageMigrations()

    expect(localStorage.getItem('irgendein_key')).toBe('bleibt')
    expect(localStorage.getItem(VERSION_KEY)).toBe(String(APP_DATA_VERSION))
  })
})

describe('runStorageMigrations — Rollback (gespeicherte Zukunftsversion)', () => {
  it('wiped alles außer dem Tenant-Slug und setzt die Version zurück', () => {
    localStorage.setItem(VERSION_KEY, '99') // > APP_DATA_VERSION
    localStorage.setItem(SK.TENANT_SLUG, 'acme')
    localStorage.setItem('zeit_offline_queue', '[1,2,3]')
    localStorage.setItem('admin-theme', 'dark')

    runStorageMigrations()

    // Nur SURVIVE_WIPE (Tenant-Slug) überlebt
    expect(localStorage.getItem(SK.TENANT_SLUG)).toBe('acme')
    expect(localStorage.getItem('zeit_offline_queue')).toBeNull()
    expect(localStorage.getItem('admin-theme')).toBeNull()
    expect(localStorage.getItem(VERSION_KEY)).toBe(String(APP_DATA_VERSION))
  })
})

describe('runStorageMigrations — Robustheit', () => {
  it('behandelt einen kaputten Versions-String als 0 (kein Crash)', () => {
    localStorage.setItem(VERSION_KEY, 'kaputt')
    localStorage.setItem('legacy_garbage_key', 'müll')

    expect(() => runStorageMigrations()).not.toThrow()

    // NaN → 0 → ganze Kette → unbekannter Key entfernt, Version gesetzt
    expect(localStorage.getItem('legacy_garbage_key')).toBeNull()
    expect(localStorage.getItem(VERSION_KEY)).toBe(String(APP_DATA_VERSION))
  })

  it('blockiert den App-Start nie, auch wenn localStorage wirft', () => {
    // Migration-Bug darf die App nicht lahmlegen (try/catch in runStorageMigrations).
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() => runStorageMigrations()).not.toThrow()
    expect(spy).toHaveBeenCalled()
  })
})

// Hinweis: Der selektive Fallback-Wipe bei einer LÜCKE in der Migrationskette
// (MIGRATIONS.find(...) === undefined bei current < APP_DATA_VERSION) ist aktuell
// nicht durch reale Daten auslösbar, da die Kette lückenlos von 0..N-1 läuft.
// Sobald eine Migration ausgelassen wird, sollte hier ein Test ergänzt werden.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import viteConfig from '../../vite.config.ts?raw'

// Der Kill-Switch im Inline-Boot-Skript (vite.config.ts) räumt nach einem
// Deploy die Caches — aber nicht den Precache des neuen Service Workers
// (docs/specs/pwa-neuladen.md §3.4). Vorher löschte er genau den: nach dem
// Update-Reload trägt das HTML schon die neue Build-ID, und der frisch
// gefüllte Precache war weg. Die nächsten Starts luden ~3 MB aus dem Netz,
// ein Offline-Kaltstart scheiterte.
//
// Getestet wird das Skript selbst: der String aus vite.config.ts, ausgeführt
// gegen gefälschtes localStorage/caches.

function killSwitchSkript(): string {
  const m = viteConfig.match(/const BOOT_KILL_SWITCH = `([^`]*)`/)
  if (!m) throw new Error('BOOT_KILL_SWITCH nicht gefunden')
  return m[1]
}

function lauf(alteId: string | null, neueId: string, cacheNamen: string[]) {
  document.head.innerHTML = `<meta name="app-build-id" content="${neueId}">`
  localStorage.clear()
  if (alteId !== null) localStorage.setItem('app_build_id', alteId)
  const geloescht: string[] = []
  const caches = {
    keys: () => Promise.resolve(cacheNamen),
    delete: vi.fn((n: string) => { geloescht.push(n); return Promise.resolve(true) }),
  }
  vi.stubGlobal('caches', caches)
  new Function(killSwitchSkript())()
  return { geloescht, caches }
}

describe('Boot-Kill-Switch', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('löscht bei neuer Build-ID alle Caches ausser dem Precache', async () => {
    const { geloescht } = lauf('alt', 'neu', [
      'workbox-precache-v2-https://app.werkora.ch/', 'api-cache', 'workbox-runtime',
    ])
    await Promise.resolve()
    await Promise.resolve()
    expect(geloescht.sort()).toEqual(['api-cache', 'workbox-runtime'])
    expect(localStorage.getItem('app_build_id')).toBe('neu')
  })

  it('tut nichts bei gleicher Build-ID', async () => {
    const { caches } = lauf('gleich', 'gleich', ['api-cache'])
    await Promise.resolve()
    expect(caches.delete).not.toHaveBeenCalled()
  })

  it('löscht beim allerersten Start nichts', async () => {
    const { caches } = lauf(null, 'neu', ['api-cache'])
    await Promise.resolve()
    expect(caches.delete).not.toHaveBeenCalled()
    expect(localStorage.getItem('app_build_id')).toBe('neu')
  })

  it('Build-ID kommt aus dem Inhalt, nicht aus der Uhr', () => {
    expect(viteConfig).toMatch(/const BUILD_ID = process\.env\.VITE_BUILD_ID \|\| sourceBuildId\(/)
    expect(viteConfig).not.toMatch(/const BUILD_ID = new Date\(/)
  })
})

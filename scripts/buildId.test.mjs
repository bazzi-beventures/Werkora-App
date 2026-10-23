import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildIdDateien, sourceBuildId } from './buildId.mjs'

// docs/specs/pwa-neuladen.md §3.3: die Build-ID ändert sich genau dann, wenn
// sich etwas ändert, das im Bundle landet — sonst lädt jedes Gerät nach jedem
// Deploy neu, auch nach einem reinen Test-Commit.

let wurzel

function schreibe(rel, inhalt) {
  const voll = path.join(wurzel, rel)
  fs.mkdirSync(path.dirname(voll), { recursive: true })
  fs.writeFileSync(voll, inhalt)
}

beforeEach(() => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'build-id-'))
  schreibe('index.html', '<html></html>')
  schreibe('package-lock.json', '{}')
  schreibe('src/App.tsx', 'export const a = 1')
  schreibe('public/manifest.json', '{}')
})

afterEach(() => {
  fs.rmSync(wurzel, { recursive: true, force: true })
})

describe('sourceBuildId', () => {
  it('ist bei gleichen Quellen gleich', () => {
    expect(sourceBuildId(wurzel, {})).toBe(sourceBuildId(wurzel, {}))
    expect(sourceBuildId(wurzel, {})).toMatch(/^[0-9a-f]{16}$/)
  })

  it('ändert sich mit dem Quellcode', () => {
    const vorher = sourceBuildId(wurzel, {})
    schreibe('src/App.tsx', 'export const a = 2')
    expect(sourceBuildId(wurzel, {})).not.toBe(vorher)
  })

  it('ändert sich mit public/ und dem Lockfile', () => {
    const vorher = sourceBuildId(wurzel, {})
    schreibe('public/push-sw.js', 'self.x = 1')
    const mitPublic = sourceBuildId(wurzel, {})
    expect(mitPublic).not.toBe(vorher)
    schreibe('package-lock.json', '{"v":2}')
    expect(sourceBuildId(wurzel, {})).not.toBe(mitPublic)
  })

  it('bleibt bei reinen Test-Änderungen gleich', () => {
    const vorher = sourceBuildId(wurzel, {})
    schreibe('src/App.test.tsx', 'it("x", () => {})')
    schreibe('src/shared/deep/thing.test.ts', 'it("y", () => {})')
    schreibe('src/shared/__tests__/z.ts', 'x')
    schreibe('src/test/setup.ts', 'x')
    schreibe('scripts/buildId.test.mjs', 'x')
    expect(sourceBuildId(wurzel, {})).toBe(vorher)
  })

  it('nimmt die VITE_-Umgebung mit, sonst nichts', () => {
    const basis = sourceBuildId(wurzel, { VITE_API_URL: 'https://a' })
    expect(sourceBuildId(wurzel, { VITE_API_URL: 'https://b' })).not.toBe(basis)
    expect(sourceBuildId(wurzel, { VITE_API_URL: 'https://a', HOME: '/x' })).toBe(basis)
  })

  it('hängt nicht von der Reihenfolge im Dateisystem ab', () => {
    const dateien = buildIdDateien(wurzel)
    expect(dateien).toEqual([...dateien].sort())
    expect(dateien).toContain('src/App.tsx')
  })
})

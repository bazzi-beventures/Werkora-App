import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Der Admin-Bereich bleibt ausserhalb des Einstiegs-Chunks (Charge O5,
 * docs/specs/refactoring-wachstum.md §19).
 *
 * Bis 2026-11 lud jeder Monteur beim Start die ganze Admin-App mit — 627 kB gzip
 * Einstieg, davon ~425 kB Admin. Seit O5 holt `App.tsx` sie per `lazy()`; ein
 * einziger statischer Import von `admin/AdminApp` irgendwo ausserhalb von `admin/`
 * zöge sie wieder ganz in den Einstieg, ohne dass ein Test es merkt. Diese Regel
 * hält es fest. Den Effekt zeigt der Bundle-Bericht im Job-Summary.
 */
const SRC = resolve(process.cwd(), 'src')
const STATISCH = /^\s*import\s+(?!type\b)[^;]*?from\s+['"][./]*(?:admin\/)?AdminApp['"]/m

function quellen() {
  return readdirSync(SRC, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
    .map(e => join(e.parentPath, e.name))
}

describe('Einstiegs-Chunk', () => {
  it('App.tsx lädt den Admin-Bereich per lazy()', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8')
    expect(app).toMatch(/lazy\(\(\) => import\('\.\/admin\/AdminApp'\)\)/)
  })

  it('niemand ausserhalb von admin/ importiert AdminApp statisch', () => {
    const treffer = quellen()
      .filter(p => !relative(SRC, p).startsWith('admin/'))
      .filter(p => STATISCH.test(readFileSync(p, 'utf8')))
      .map(p => relative(SRC, p))
    expect(treffer).toEqual([])
  })
})

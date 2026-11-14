import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Keine Standortdaten von Personen — an keiner Stelle der App.
 *
 * Spec docs/specs/servicebegleitung.md §1, §5.1, §13 und docs/GDPR_TODO.md:
 * «technisch ausgeschlossen, nicht bloss untersagt». Die Unterwegs-Meldung
 * beantwortet «wo ist der Monteur» mit dem, was er selbst tippt, und mit dem
 * Plan — der Browser fragt nie nach dem Standort. Dieser Ratchet hält fest,
 * dass `navigator.geolocation` (und `watchPosition`/`getCurrentPosition`) in
 * `src/` nicht vorkommen. Wer sie braucht, braucht zuerst einen Entscheid nach
 * ArGV 3 Art. 26 — kein Test-Update.
 *
 * Bewusst .mjs mit node:fs wie dateiBudget.guard.test.mjs.
 */
const SRC = resolve(process.cwd(), 'src')
const SELBST = 'shared/keineOrtung.guard.test.mjs'
const VERBOTEN = /\bgeolocation\b|\bwatchPosition\b|\bgetCurrentPosition\b/

function dateien(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const pfad = join(dir, e.name)
    if (e.isDirectory()) return dateien(pfad)
    return /\.(ts|tsx|js|jsx|mjs)$/.test(e.name) ? [pfad] : []
  })
}

describe('keine Ortung', () => {
  it('src/ greift nie auf den Standort zu', () => {
    const treffer = dateien(SRC)
      .map(p => relative(SRC, p).split('\\').join('/'))
      .filter(rel => rel !== SELBST)
      .filter(rel => VERBOTEN.test(readFileSync(join(SRC, rel), 'utf8')))
    expect(treffer).toEqual([])
  })
})

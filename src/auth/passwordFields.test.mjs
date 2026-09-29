import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Ratchet: JEDES Passwortfeld sperrt Autokorrektur, Grossschreibung und
 * Rechtschreibprüfung — das umschaltbare wie das reine `type="password"`.
 *
 * Grund: Im Klartext-Modus korrigiert iOS wie in jedem Textfeld — erster
 * Buchstabe gross, Wörter ersetzt, gerade Anführungszeichen typografisch. Beim
 * SETZEN eines Passworts trifft das beide Felder gleich, der Vergleich geht
 * durch, und gespeichert ist ein anderes Passwort als das gemeinte. Beim
 * ANMELDEN mit sichtbarem Passwort kommt ein anderes beim Server an als das
 * getippte. Am Schreibtisch unsichtbar, am Handy «das Passwort stimmt, und es
 * geht trotzdem nicht».
 *
 * Auch das verborgene Feld bekommt die Sperren: WebKit koppelt die
 * typografischen Anführungszeichen und Striche an `autocorrect`, und sie
 * abzuschalten kostet nichts. Am 2026-09-27 kam auf Staging vom Handy ein
 * anderes Passwort an als vom Rechner, bei derselben Eingabe.
 *
 * Bewusst .mjs (wie admin/mobileShell.test.mjs): `node:fs` ohne Node-Typen.
 */
const SRC = resolve(process.cwd(), 'src')

function dateien(dir) {
  return readdirSync(dir).flatMap((name) => {
    const pfad = join(dir, name)
    if (statSync(pfad).isDirectory()) return dateien(pfad)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [pfad] : []
  })
}

/** Alle `<input …>`-Tags für Passwörter: fest oder zwischen Text und Passwort umschaltbar. */
function passwortfelder() {
  const treffer = []
  for (const pfad of dateien(SRC)) {
    const quelle = readFileSync(pfad, 'utf8')
    for (const m of quelle.matchAll(/<input\b[\s\S]*?\/>/g)) {
      if (/type=\{[^}]*'text'\s*:\s*'password'/.test(m[0]) || /type="password"/.test(m[0])) {
        treffer.push({ datei: relative(SRC, pfad), tag: m[0] })
      }
    }
  }
  return treffer
}

describe('Passwortfelder', () => {
  const felder = passwortfelder()

  it('werden gefunden (sonst prüft der Ratchet nichts)', () => {
    // 5 umschaltbare (PWA + Admin-Anmeldung), 3 feste im Passwort-Dialog
    expect(felder.length).toBeGreaterThanOrEqual(8)
  })

  it.each(felder.map((f) => [f.datei, f.tag]))('%s sperrt Autokorrektur', (_datei, tag) => {
    expect(tag).toContain('autoCapitalize="none"')
    expect(tag).toContain('autoCorrect="off"')
    expect(tag).toContain('spellCheck={false}')
  })
})

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Zuständigkeit ja, Leistungskontrolle nein — docs/specs/mail-eingang-zustaendigkeiten.md §9, §11.
 *
 * Erlaubt ist die Frage «wer soll das machen?» (heute, aus dem Organigramm).
 * Verboten bleibt «wer hat was gemacht, wie viel und wie schnell?». Dieser
 * Ratchet hält drei Dinge im Eingang fest, gegen spätere gut gemeinte Erweiterungen:
 *
 * 1. Gefiltert und sortiert wird nie danach, wer zugeleitet (`weitergeleitet_von`)
 *    oder entschieden hat (`decided_by_name`) — diese Namen stehen nur an der Karte.
 * 2. Die Filter-Bausteine kennen diese Felder gar nicht.
 * 3. Der Filter nach Person hängt an der Ansicht «Offen» (§9 Punkt 2).
 *
 * Bewusst .mjs mit node:fs wie keineOrtung.guard.test.mjs.
 */
const DIR = resolve(process.cwd(), 'src/admin/eingang')
const PERSON_FELDER = /weitergeleitet_von|decided_by_name|forwarded_by|decided_by/

const quellen = readdirSync(DIR)
  .filter(n => /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n))
  .map(n => ({ name: n, text: readFileSync(join(DIR, n), 'utf8') }))

describe('Eingang: kein Filter nach Zuleiter oder Entscheider', () => {
  it('keine filter/sort-Zeile nennt ein Personenfeld', () => {
    const treffer = quellen.flatMap(q => q.text.split('\n')
      .filter(z => /\.(filter|sort|toSorted)\(/.test(z) && PERSON_FELDER.test(z))
      .map(z => `${q.name}: ${z.trim()}`))
    expect(treffer).toEqual([])
  })

  it('die Filter-Bausteine kennen die Personenfelder nicht', () => {
    for (const name of ['EingangFilter.tsx', 'eingangZustaendigkeit.ts']) {
      const q = quellen.find(x => x.name === name)
      expect(q, name).toBeTruthy()
      expect(PERSON_FELDER.test(q.text), name).toBe(false)
    }
  })

  it('der Filter nach Person hängt an der Ansicht «Offen»', () => {
    const screen = quellen.find(q => q.name === 'MailEingangScreen.tsx').text
    expect(screen).toMatch(/const mitPerson = ansicht === 'offen'/)
  })
})

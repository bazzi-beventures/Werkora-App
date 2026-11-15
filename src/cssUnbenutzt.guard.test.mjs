import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { einordnen, klassenAusCss } from '../scripts/css-unbenutzt.mjs'

/**
 * Keine toten Klassen in den Stylesheets (Charge O, docs/specs/refactoring-wachstum.md
 * §8.2, Notizen §19).
 *
 * Beim Einführen fanden sich in `admin.css` zwölf Klassen, die kein Element mehr trug
 * (O1), in `index.css` dreizehn und in `kpi-dashboard.css` das ganze alte BI-Layout mit
 * 23 Klassen (O5) — alle gelöscht. Dieser Guard hält den Stand für **jedes** Stylesheet
 * unter `src/`: eine Klasse, die nirgends im Quelltext steht, fällt hier auf statt in
 * fünf Jahren. Zusammengesetzte Namen (`urg-${urg}`) zählen als benutzt, sobald ein
 * Präfix vor einem `${` steht — die Wortsuche findet sie sonst nicht.
 */
const WURZEL = process.cwd()
const SRC = resolve(WURZEL, 'src')

function dateien(endung) {
  return readdirSync(SRC, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && endung.test(e.name))
    .map(e => join(e.parentPath, e.name))
}

function quelltext() {
  const texte = dateien(/\.tsx?$/)
    .filter(p => !/\.test\.tsx?$/.test(p))
    .map(p => readFileSync(p, 'utf8'))
  for (const html of ['index.html', 'admin.html']) {
    try { texte.push(readFileSync(join(WURZEL, html), 'utf8')) } catch { /* fehlt */ }
  }
  return texte.join('\n')
}

describe('Stylesheets ohne tote Klassen', () => {
  it('liest Klassen nur aus Selektoren', () => {
    const k = klassenAusCss(`
      /* .kommentar { } */
      .a, .b:hover > .c { color: red; background: url(x.png); }
      @media (max-width: 10px) { .d { width: 1.5px } }
      a[href$=".pdf"] { }
    `)
    expect([...k].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ordnet zusammengesetzte Namen getrennt ein', () => {
    const { nirgends, zusammengesetzt } = einordnen(
      new Set(['da', 'urg-soon', 'weg', 'da-x']),
      'className="da" className={`urg-${u}`}',
    )
    expect(nirgends).toEqual(['da-x', 'weg'])
    expect(zusammengesetzt).toEqual(['urg-soon'])
  })

  it('hat in keinem Stylesheet eine Klasse, die nirgends im Quelltext steht', () => {
    const text = quelltext()
    const css = dateien(/\.css$/)
    expect(css.length).toBeGreaterThan(15)
    const tot = {}
    for (const pfad of css) {
      const { nirgends } = einordnen(klassenAusCss(readFileSync(pfad, 'utf8')), text)
      if (nirgends.length) tot[relative(SRC, pfad)] = nirgends
    }
    expect(tot, 'Tote Klassen — löschen (node scripts/css-unbenutzt.mjs <datei>)').toEqual({})
  })
})

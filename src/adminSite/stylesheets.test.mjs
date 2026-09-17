import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Ratchet fuer die Stylesheets der Betreiber-Seite.
 *
 * Der Admin-Build ist ein EIGENER Einstieg (admin.html → adminSite/main.tsx)
 * und erbt nichts von der Mandanten-App. Die Screens sind aber von dort
 * umgezogen und benutzen weiter deren Klassen — `admin-btn`, `admin-table`,
 * `admin-form-input`, `admin-modal`. Fehlt der Import von `admin/admin.css`,
 * laedt die Seite fehlerfrei, rendert fehlerfrei, besteht jeden Test und sieht
 * trotzdem aus wie rohes HTML. Genau das ist am 2026-09-16 auf
 * admin-staging.werkora.ch passiert: die Anmeldemaske kam ohne Stil.
 *
 * In jsdom ist davon nichts messbar — Vitest laedt mit `css: false` gar kein
 * CSS —, und rot wird auch sonst nirgends etwas. Deshalb diese
 * Quelltext-Zusicherung: jede `admin-*`-Klasse, die adminSite/ benutzt, muss in
 * einem Stylesheet definiert sein, das vom Admin-Einstieg aus erreichbar ist.
 *
 * Bewusst .mjs wie mobileShell.test.mjs: fuer `node:fs` fehlen im
 * Frontend-tsconfig die Typen, und tsc deckt .mjs nicht ab.
 */
const WURZEL = resolve(process.cwd(), 'src/adminSite')

/** Alle .ts/.tsx unterhalb von src/adminSite — dort haengt der Admin-Einstieg. */
function quellen(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = resolve(dir, n)
    if (statSync(p).isDirectory()) return quellen(p)
    return /\.tsx?$/.test(n) ? [p] : []
  })
}

const dateien = quellen(WURZEL)

/** Jedes `import '….css'` einsammeln, relativ zur importierenden Datei aufgeloest,
 *  und danach den `@import`s darin folgen (index.css zieht so fonts.css nach). */
const stylesheets = new Set()
for (const f of dateien) {
  for (const m of readFileSync(f, 'utf8').matchAll(/^import\s+['"]([^'"]+\.css)['"]/gm)) {
    stylesheets.add(resolve(dirname(f), m[1]))
  }
}
for (const s of [...stylesheets]) {
  for (const m of readFileSync(s, 'utf8').matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
    stylesheets.add(resolve(dirname(s), m[1]))
  }
}
const css = [...stylesheets].map((p) => readFileSync(p, 'utf8')).join('\n')

/**
 * Benutzte `admin-*`- und `adminsite-*`-Klassen — nur aus `className`, nicht aus
 * dem ganzen Text:
 * sonst zaehlte jede Spec-Referenz («admin-werkora-ch.md») als Klasse mit.
 * Interpolationen fallen vorher raus, damit aus `admin-btn-${variante}` kein
 * Bruchstueck wird, und getrennt wird in ganze Token — `kpi-admin-tabs` gehoert
 * den KPI-Reitern und faengt eben nicht mit «admin-» an.
 */
const benutzt = new Set()
// `adminsite-*` gehoert dazu, seit die Vorschau des Newsletters
// (`adminsite-newsletter-preview`) monatelang ohne eine einzige Regel auskam
// und deshalb als 300x150-Rahmen des Browsers dastand.
const KLASSE = /^admin(site)?-[a-z0-9-]*[a-z0-9]$/
for (const f of dateien) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)) {
    const text = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ')
    for (const token of text.split(/[^A-Za-z0-9_-]+/)) {
      if (KLASSE.test(token)) benutzt.add(token)
    }
  }
}

/**
 * Die Farb- und Massnamen, die die geladenen Stylesheets BENUTZEN — und die,
 * die sie DEFINIEREN. Nur `var(--x)` ohne Rückfallwert zählt: `var(--x, #fff)`
 * ist auch ohne Definition gültig.
 */
const tokensBenutzt = new Set(
  [...css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g)].map((m) => m[1]),
)
const tokensDefiniert = new Set(
  [...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]),
)

describe('Stylesheets der Betreiber-Seite', () => {
  it('findet ueberhaupt Quellen und Klassen — sonst prueft der Rest nichts', () => {
    expect(dateien.length).toBeGreaterThan(5)
    expect(benutzt.size).toBeGreaterThan(20)
  })

  it('importiert admin.css — sonst ist die ganze Seite ungestylt', () => {
    expect([...stylesheets].some((p) => p.endsWith('admin.css'))).toBe(true)
  })

  it('definiert jede benutzte admin-*-Klasse', () => {
    const fehlend = [...benutzt].filter((k) => !css.includes('.' + k)).sort()
    expect(fehlend, `nicht definiert: ${fehlend.join(', ')}`).toEqual([])
  })

  /**
   * Der zweite Teil desselben Fehlerbildes, und der teurere: Die Klasse kann da
   * sein und ihre Regel trotzdem ins Leere laufen. Ein undefiniertes `var()`
   * macht die GANZE Deklaration ungueltig — `padding: var(--s-2) var(--s-4)`
   * wird dann zu gar keinem Innenabstand, `background: var(--success)` zu gar
   * keiner Farbe. Genau so sah die Betreiber-Seite am 2026-09-16 aus: admin.css
   * war geladen (der Test oben blieb gruen), `admin/tokens.css` aber nicht —
   * Knoepfe klebten aneinander, die Bloecke des Uptime-Verlaufs waren
   * unsichtbar, der aktive Chip weiss auf weiss.
   *
   * In jsdom ist davon wieder nichts messbar (`css: false`), deshalb auch das
   * als Quelltext-Zusicherung.
   */
  it('definiert jeden benutzten Token — sonst faellt die ganze Deklaration weg', () => {
    const fehlend = [...tokensBenutzt].filter((t) => !tokensDefiniert.has(t)).sort()
    expect(fehlend, `nicht definiert: ${fehlend.join(', ')}`).toEqual([])
  })

  it('findet genug Tokens — sonst prueft die Zusicherung darueber nichts', () => {
    expect(tokensBenutzt.size).toBeGreaterThan(30)
    // --primary steht stellvertretend fuer tokens.css: ohne diese Datei fehlen
    // 30+ Namen auf einmal, und das ist der Fall, den der Test halten soll.
    expect(tokensDefiniert.has('--primary')).toBe(true)
  })
})

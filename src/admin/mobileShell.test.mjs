import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Ratchet fuer die Mobile-Shell des Admin (mobile.css).
 *
 * Die Geometrie laesst sich in jsdom nicht messen — hier stehen deshalb
 * Quelltext-Zusicherungen fuer die zwei Regeln, deren Bruch auf dem iPhone
 * eine kaputte Seite ergibt und am Schreibtisch (Chrome, kein Safe-Area-Inset,
 * Maus statt Tastatur) unsichtbar bleibt.
 *
 * Bewusst .mjs und nicht .ts: `import css from './mobile.css?raw'` liefert
 * unter Vitest den leeren String (`css: false` in vite.config.ts), und fuer
 * `node:fs` fehlen im Frontend die Node-Typen — tsc deckt .mjs nicht ab.
 */
const css = readFileSync(resolve(process.cwd(), 'src/admin/mobile.css'), 'utf8')

/** Inhalt eines Regelblocks `selector { … }` (erste Fundstelle), ohne Kommentare. */
function block(selector) {
  const i = css.indexOf(selector + ' {')
  expect(i, `Regel "${selector}" nicht gefunden`).toBeGreaterThan(-1)
  // Kommentare raus: sie benennen genau die Deklarationen, die hier nicht
  // stehen duerfen, und wuerden die Pruefungen sonst selbst ausloesen.
  return css.slice(i, css.indexOf('}', i)).replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('Admin-Mobile-Shell', () => {
  it('haengt die Tab-Leiste in die Shell-Spalte statt an den Viewport', () => {
    // `position: fixed` haengt am Viewport, die Shell an 100dvh. Sobald die
    // beiden auseinanderlaufen — Tastatur, Overscroll, iOS-Standalone —, steht
    // die Leiste in der Luft und die Liste ist darueber abgeschnitten.
    expect(block('.admin-mobile-tabbar')).not.toMatch(/position:\s*fixed/)
    expect(block('.admin-mobile-tabbar')).toMatch(/flex:\s*0 0 auto/)
    // Der Home-Indicator wird ADDIERT, nicht vom Inhalt abgezogen (border-box).
    expect(block('.admin-mobile-tabbar')).toMatch(/height:\s*calc\(56px \+ env\(safe-area-inset-bottom/)
  })

  it('misst die Shell an der gemessenen Fensterhoehe, nicht an 100%', () => {
    // `height: 100%` misst gegen den Initial Containing Block — auf iOS Safari
    // der GROSSE Viewport, hinter den Browserleisten. Shell und Dokument
    // meinten dann zwei Hoehen: die Seite liess sich anschieben, die Leiste
    // rutschte hoch, der untere Inhalt verschwand.
    const shell = block('.admin-shell-mobile')
    expect(shell).toMatch(/height:\s*var\(--app-vh, 100dvh\)/)
    // Rueckfallkette: ohne die Variable (Test, Fehler vor dem ersten Render)
    // bleibt 100dvh stehen.
    expect(shell).toMatch(/height:\s*100dvh/)
  })

  it('haelt das Legacy-Momentum-Scrolling draussen', () => {
    // `-webkit-overflow-scrolling: touch` stammt aus der Zeit vor iOS 13 und
    // legt den Container heute nur noch in eine eigene Compositing-Ebene —
    // dort bleiben Flaechen weiss und die Liste haengt nach einer Geste fest.
    // Ohne Kommentare geprueft: einer davon nennt die Eigenschaft genau
    // deshalb beim Namen, damit sie niemand zurueckschreibt.
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/-webkit-overflow-scrolling/)
  })

  it('traegt den oberen Safe-Area-Inset an der klebenden Topbar, nicht am Scroll-Container', () => {
    // `sticky top: 0` klebt am Rand der Padding-Box: liegt der Inset am
    // Scroll-Container, rutscht die Topbar beim Scrollen unter die Uhr.
    expect(block('.admin-content-topbar--mobile')).toMatch(/env\(safe-area-inset-top/)
    expect(block('.admin-content-mobile')).not.toMatch(/padding-top:[^;]*safe-area-inset-top/)
  })
})

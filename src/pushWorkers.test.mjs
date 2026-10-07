import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Ratchet fuer die Push-Handler der Service Worker (public/push-sw.js,
 * public/admin-push-sw.js).
 *
 * Zwei Fehler, die in keinem anderen Test rot wurden, weil sie erst auf dem
 * Handy sichtbar sind:
 *
 * 1. `admin-push-sw.js` lag nie im Repo — `*.js` in .gitignore hatte die Datei
 *    verschluckt. Der Admin-SW lud per importScripts eine Datei, die es nicht
 *    gab, wurde nie aktiv, der Push-Schalter im Support-Eingang erschien nicht,
 *    und die Support-Push landete mangels Admin-Geraet in der Werkora-App
 *    (bis 2026-10-07). In der CI fehlt eine ignorierte Datei genauso wie im
 *    Deploy — deshalb reicht hier die Existenzpruefung.
 * 2. Das `badge` beider Handler war `icon-192.png`, ein voll deckendes Bild.
 *    Android zeichnet das Badge nur aus dem Alphakanal: ein weisses Kaestchen.
 *
 * Bewusst .mjs wie mobileShell.test.mjs: fuer `node:fs` fehlen im
 * Frontend-tsconfig die Typen.
 */
const APP = process.cwd()
const PUBLIC = resolve(APP, 'public')

function importScripts() {
  const vite = readFileSync(resolve(APP, 'vite.config.ts'), 'utf8')
  const zeile = vite.match(/importScripts:\s*([^\n]+)/)
  expect(zeile, 'importScripts in vite.config.ts nicht gefunden').not.toBeNull()
  return [...zeile[1].matchAll(/'([^']+\.js)'/g)].map((m) => m[1])
}

describe('Push-Handler der Service Worker', () => {
  it('jede per importScripts geladene Datei liegt in public/', () => {
    const dateien = importScripts()
    expect(dateien).toEqual(expect.arrayContaining(['push-sw.js', 'admin-push-sw.js']))
    for (const d of dateien) {
      expect(existsSync(resolve(PUBLIC, d)), `public/${d} fehlt`).toBe(true)
    }
  })

  it('jede per importScripts geladene Datei ist in .gitignore ausgenommen', () => {
    const ignore = readFileSync(resolve(APP, '..', '.gitignore'), 'utf8')
    for (const d of importScripts()) {
      expect(ignore, `!bau-app/public/${d} fehlt in .gitignore`).toContain(`!bau-app/public/${d}\n`)
    }
  })

  it.each(['push-sw.js', 'admin-push-sw.js'])('%s nutzt ein Badge mit Alphakanal', (d) => {
    const src = readFileSync(resolve(PUBLIC, d), 'utf8')
    const badge = src.match(/badge:\s*'([^']+)'/)
    expect(badge, `${d}: kein badge gesetzt`).not.toBeNull()
    const png = readFileSync(resolve(PUBLIC, '.' + badge[1]))
    // PNG-IHDR: Byte 25 ist der Farbtyp; 6 = RGBA, 4 = Grau+Alpha.
    expect([4, 6], `${badge[1]} hat keinen Alphakanal`).toContain(png[25])
    // Ein deckendes Bild mit Alphakanal waere genauso ein Kaestchen — das
    // App-Symbol ist so eins und darf deshalb nie das Badge sein.
    expect(badge[1]).not.toMatch(/icon-\d+/)
  })
})

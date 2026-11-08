import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Ratchet fuer den roten Zaehler `.admin-kpi-badge` (admin.css).
 *
 * Die Grundregel ist fuer die Ecke einer Dashboard-Karte gebaut:
 * `position: absolute` plus `display: flex`. Neben «Meine Erinnerungen» steht
 * derselbe Zaehler im Fliesstext — dort machte das block-level `flex` ihn
 * so breit wie die ganze Zeile, ein roter Balken unter dem Titel, sobald eine
 * Erinnerung faellig war. jsdom misst keine Breiten, deshalb Quelltext-
 * Zusicherungen (wie mobileShell.test.mjs, dort steht auch, warum .mjs).
 */
const css = readFileSync(resolve(process.cwd(), 'src/admin/admin.css'), 'utf8')

/** Inhalt eines Regelblocks `selector { … }` (erste Fundstelle), ohne Kommentare. */
function block(selector) {
  const i = css.indexOf(selector + ' {')
  expect(i, `Regel "${selector}" nicht gefunden`).toBeGreaterThan(-1)
  return css.slice(i, css.indexOf('}', i)).replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('Zaehler-Badge im Fliesstext', () => {
  it('bleibt inline statt die Zeile zu fuellen', () => {
    const rule = block('.admin-kpi-badge--inline')
    expect(rule).toMatch(/position:\s*static/)
    expect(rule).toMatch(/display:\s*inline-flex/)
  })

  it('wird in «Meine Erinnerungen» ueber die Modifier-Klasse gesetzt, nicht inline', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/admin/reminders/MyReminders.tsx'), 'utf8')
    expect(src).toContain('admin-kpi-badge admin-kpi-badge--inline')
    // Ein Inline-`position: 'static'` ohne `display` war genau der Fehler.
    expect(src).not.toMatch(/admin-kpi-badge"\s+style=/)
  })
})

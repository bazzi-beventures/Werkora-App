/**
 * Der Punkt dieser Datei ist nicht, dass ein `<style>` im Kopf landet — das
 * sieht man dem Modul an. Geprüft wird, dass dort **Werkora-Farben** stehen und
 * nicht das Mandanten-Blau: genau dieser Unterschied war auf
 * admin-staging.werkora.ch zu sehen (Spec §10.4/1), und er ist mit blossem Auge
 * nur zu erkennen, wenn man weiss, wonach man schaut.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { applyWerkoraBranding } from './werkoraBranding'
import { contrastRatio } from '../brand/palette'

/** Der Rückfall aus `tokens.css` und zugleich der Default von
 *  `tenants.brand_color` — auf der Betreiber-Seite also genau falsch. */
const MANDANTEN_BLAU = '#3081AB'

function stylesheet(): string {
  return document.getElementById('werkora-branding')?.textContent ?? ''
}

/** Den Wert eines Tokens aus dem erzeugten CSS lesen, je Theme-Block. */
function token(css: string, block: string, name: string): string {
  const treffer = css.split('\n').find((z) => z.startsWith(block))
  const wert = treffer?.match(new RegExp(`${name}:([^;}]+)`))?.[1]
  return (wert ?? '').trim()
}

describe('Farben der Betreiber-Seite', () => {
  beforeEach(() => {
    document.getElementById('werkora-branding')?.remove()
  })

  it('haengt genau ein Stylesheet ein, auch bei mehrfachem Aufruf', () => {
    applyWerkoraBranding()
    applyWerkoraBranding()
    expect(document.querySelectorAll('#werkora-branding')).toHaveLength(1)
    expect(stylesheet()).toContain('--primary:')
  })

  it('traegt Amber und nicht das Mandanten-Blau', () => {
    applyWerkoraBranding()
    const css = stylesheet()
    expect(css.toUpperCase()).not.toContain(MANDANTEN_BLAU)
    // Amber ist warm: im abgeleiteten Ton bleibt Rot ueber Blau. Ein Blau
    // haette es umgekehrt — das ist die Pruefung, die einen falschen Grundton
    // faengt, ohne den genauen Hexwert der Ableitung festzunageln.
    for (const block of [':root{', ':root[data-theme="dark"]{']) {
      const primary = token(css, block, '--primary')
      expect(primary).toMatch(/^#[0-9A-F]{6}$/i)
      const r = parseInt(primary.slice(1, 3), 16)
      const b = parseInt(primary.slice(5, 7), 16)
      expect(r).toBeGreaterThan(b)
    }
  })

  it('haelt die Schrift auf der Akzentflaeche lesbar — in beiden Themes', () => {
    applyWerkoraBranding()
    const css = stylesheet()
    for (const block of [':root[data-theme="light"]{', ':root[data-theme="dark"]{']) {
      const primary = token(css, block, '--primary')
      const onAccent = token(css, block, '--on-accent')
      // `--on-accent` ist entweder die Kurzform #fff oder die Tinte; fuer die
      // Rechnung braucht contrastRatio die volle Form.
      const schrift = onAccent === '#fff' ? '#FFFFFF' : onAccent
      expect(contrastRatio(primary, schrift)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

import { describe, it, expect } from 'vitest'

// Werkora ist Schweizer Software: in keinem Text, den ein Nutzer sieht, steht
// ein «ß» (docs/specs/kleinkorrekturen-2026-10.md §4, Rückmeldung aus der
// Einsatzplanung: «Schließen»). Kommentare dürfen es behalten — gezählt wird
// nur, was nach dem Entfernen der Kommentare übrig bleibt.
//
// Grob, aber ausreichend: `//` bis Zeilenende und `/* … */` werden entfernt.
// Ein `//` in einem String (URL) schneidet den Rest der Zeile mit ab — dort
// könnte ein ß durchrutschen. Das nimmt der Test in Kauf; er soll den Normalfall
// halten, keinen Parser ersetzen.

const QUELLEN = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

// Code, der ß bewusst verarbeitet — keine Anzeige.
const ERLAUBT: Record<string, string> = {
  '/src/admin/operative/customerMatch.ts': 'normalisiert ß→ss für den Namensvergleich',
}

function ohneKommentare(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('kein ß in der Oberfläche', () => {
  it('findet die Quellen überhaupt', () => {
    expect(Object.keys(QUELLEN).length).toBeGreaterThan(100)
  })

  it('kein ß ausserhalb von Kommentaren', () => {
    const treffer: string[] = []
    for (const [datei, src] of Object.entries(QUELLEN)) {
      if (/\.test\.tsx?$/.test(datei) || datei in ERLAUBT) continue
      ohneKommentare(src).split('\n').forEach((zeile, i) => {
        if (zeile.includes('ß')) treffer.push(`${datei}:${i + 1}: ${zeile.trim()}`)
      })
    }
    // Zeilennummern beziehen sich auf den Text ohne Block-Kommentare — die
    // Zeile selbst steht dabei, sie reicht zum Finden.
    expect(treffer, 'ß → ss (Schweizer Rechtschreibung)').toEqual([])
  })

  it('die Ausnahmen gibt es noch', () => {
    for (const datei of Object.keys(ERLAUBT)) {
      expect(QUELLEN[datei], datei).toContain('ß')
    }
  })
})

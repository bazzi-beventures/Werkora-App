import { describe, it, expect } from 'vitest'
import { onAccentColor } from './App'

// Welche Schrift auf der Akzentfläche steht, entscheidet über Lesbarkeit —
// und die Fläche wechselt: vor dem Login Werkora-Amber, danach die Farbe des
// Mandanten. Vorher stand dort blind `#fff`.
//
// Die Schwelle ist eine Zahl in einer Formel und damit genau die Sorte Regel,
// die still kippt, wenn jemand die Luminanz-Konstante «aufräumt». Deshalb
// dieser Test.

// Kontrastverhältnis nach WCAG 2.x — bewusst unabhängig von der
// Implementierung nachgerechnet, damit der Test nicht dieselbe Formel prüft,
// die er absichern soll.
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
    const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    const [r, g, bb] = [0, 2, 4].map(i => f(parseInt(full.slice(i, i + 2), 16) / 255))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bb
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('onAccentColor', () => {
  it('setzt auf Werkora-Amber Tinte statt Weiss', () => {
    // Der Grund für die ganze Funktion: Weiss auf #E9A227 erreicht nur 2,2:1.
    expect(onAccentColor('#E9A227')).toBe('#1B2028')
    expect(contrast('#E9A227', '#ffffff')).toBeLessThan(3)
    expect(contrast('#E9A227', '#1B2028')).toBeGreaterThan(7)
  })

  it('lässt die Default-Mandantenfarbe auf Weiss', () => {
    // db/tenants.py setzt #3081AB als Default. Hier wäre Tinte die
    // schlechtere Wahl (3,7:1 gegen 4,4:1) — das bisherige Verhalten bleibt.
    expect(onAccentColor('#3081AB')).toBe('#fff')
  })

  it('wählt für jede Farbe die kontrastreichere der beiden Schriften', () => {
    const proben = [
      '#000000', '#ffffff', '#E9A227', '#A9711A', '#3081AB', '#12161D',
      '#f5f5f5', '#7f7f7f', '#808080', '#c0392b', '#16a34a', '#fde047',
    ]
    for (const farbe of proben) {
      const gewaehlt = onAccentColor(farbe)
      const andere = gewaehlt === '#fff' ? '#1B2028' : '#ffffff'
      expect(
        contrast(farbe, gewaehlt === '#fff' ? '#ffffff' : gewaehlt),
        `${farbe} → ${gewaehlt}`,
      ).toBeGreaterThanOrEqual(contrast(farbe, andere))
    }
  })

  it('fällt bei unbrauchbarer Eingabe auf Weiss zurück', () => {
    // Kurzform-Hex und Müll kommen aus der Mandanten-Verwaltung durchaus vor;
    // die Funktion darf dabei nicht NaN in eine CSS-Variable schreiben.
    for (const müll of ['', '#abc', 'rot', '#12345', '#1234567']) {
      expect(onAccentColor(müll)).toBe('#fff')
    }
  })
})

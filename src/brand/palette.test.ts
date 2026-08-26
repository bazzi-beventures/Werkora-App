import { describe, it, expect } from 'vitest'
import { derivePalette, paletteCss, hexToOklch, oklchToHex, contrastRatio } from './palette'

// Diese Datei sichert eine Zusage ab, die man dem Bildschirm nicht ansieht:
// Egal welche Farbe ein Mandant in `brand_color` einträgt, jeder abgeleitete
// Wert erfüllt WCAG AA gegen die Fläche, auf der er landet. Vorher war das
// Glückssache — die Farbe wurde roh durchgereicht.
//
// Der Kontrast wird hier bewusst unabhängig nachgerechnet, damit der Test
// nicht dieselbe Formel prüft, die er absichern soll.
function kontrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace('#', '')
    const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    const [r, g, bb] = [0, 2, 4].map(i => f(parseInt(h.slice(i, i + 2), 16) / 255))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bb
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const SURFACE = { light: '#FFFFFF', dark: '#1E293B' } as const
const AA = 4.5

// Querschnitt durch das, was in der Mandanten-Verwaltung realistisch auftaucht:
// die beiden Stähli-Punkte, das bestehende Gehlhaar-Blau, der Default, dazu
// Extremfälle, an denen eine naive Ableitung zerbricht (fast weiss, fast
// schwarz, maximal gesättigt, unbunt).
const PROBEN = [
  '#005AFF', '#FF0101',   // Stähli
  '#196E9C',              // Gehlhaar (Produktion)
  '#3180ab',              // Default aus db/tenants.py
  '#E9A227',              // Werkora-Amber
  '#FFFF00', '#00FF00', '#FF00FF',   // maximal gesättigt
  '#FAFAFA', '#050505',   // an den Rändern
  '#808080',              // unbunt
]

describe('derivePalette – Kontrast', () => {
  for (const farbe of PROBEN) {
    it(`${farbe}: jeder Wert erfüllt AA in beiden Themes`, () => {
      const p = derivePalette(farbe)
      for (const theme of ['light', 'dark'] as const) {
        const t = p[theme]
        const wo = `${farbe} / ${theme}`

        // Akzent als Schrift auf der Grundfläche (Links, Icons, Zahlen).
        expect(kontrast(t.primary, SURFACE[theme]), `${wo}: primary auf surface`)
          .toBeGreaterThanOrEqual(AA)

        // Akzent als Schrift auf der zarten Fläche (Badges, Chips).
        expect(kontrast(t.primary, t.primarySoft), `${wo}: primary auf soft`)
          .toBeGreaterThanOrEqual(AA)

        // Beschriftung auf dem gefüllten Knopf — und im Hover, wo sie sonst kippt.
        const on = t.onPrimary === '#fff' ? '#FFFFFF' : t.onPrimary
        expect(kontrast(on, t.primary), `${wo}: onPrimary auf primary`)
          .toBeGreaterThanOrEqual(AA)
        expect(kontrast(on, t.primaryHover), `${wo}: onPrimary auf primaryHover`)
          .toBeGreaterThanOrEqual(AA)
      }
    })
  }

  it('hebt den Akzent im dunklen Theme an, statt die helle Farbe zu übernehmen', () => {
    // Der eigentliche Fehler, den diese Umstellung behebt: `--accent-blue`
    // trug im dunklen Theme die helle Mandantenfarbe. #005AFF auf #1E293B
    // sind 3,37:1 — als Link zu blass.
    expect(kontrast('#005AFF', SURFACE.dark)).toBeLessThan(AA)
    const p = derivePalette('#005AFF')
    expect(p.dark.primary).not.toBe('#005AFF')
    expect(kontrast(p.dark.primary, SURFACE.dark)).toBeGreaterThanOrEqual(AA)
    // Und im hellen Theme bleibt sie, weil sie dort schon reicht.
    expect(p.light.primary).toBe('#005AFF')
  })
})

describe('derivePalette – Farbtreue', () => {
  it('behält den Farbton bei, wenn die Helligkeit wandert', () => {
    // Der Grund für OKLCH statt HSL: In HSL kippt ein abgedunkeltes Blau
    // sichtbar ins Violette. Der Mandant bekäme eine Farbe, die er nie gewählt
    // hat. Unbunte Proben sind ausgenommen — dort ist der Winkel bedeutungslos.
    for (const farbe of ['#005AFF', '#FF0101', '#196E9C', '#E9A227']) {
      const quelle = hexToOklch(farbe)!
      const p = derivePalette(farbe)
      for (const ton of [p.light.primary, p.dark.primary, p.light.primaryHover, p.dark.primaryHover]) {
        const ist = hexToOklch(ton)!
        const delta = Math.abs(((ist.H - quelle.H + 540) % 360) - 180)
        expect(delta, `${farbe} → ${ton}`).toBeLessThan(6)
      }
    }
  })

  it('lässt eine Farbe unangetastet, die die Schwelle schon erfüllt', () => {
    // Damit die Umstellung bestehende Mandanten nicht umfärbt. Gehlhaar
    // erfüllt AA im hellen Theme bereits.
    expect(kontrast('#196E9C', SURFACE.light)).toBeGreaterThanOrEqual(AA)
    expect(derivePalette('#196E9C').light.primary).toBe('#196E9C')
  })

  it('korrigiert eine Farbe, die AA knapp verfehlt', () => {
    // Der Default #3180ab erreicht auf Weiss nur ~4,4:1 und verfehlt AA damit
    // um Haaresbreite. Er wird nachgedunkelt — sichtbar ist das nicht, messbar
    // schon. Dieselbe Abwägung steht in index.css beim Amber.
    expect(kontrast('#3180ab', SURFACE.light)).toBeLessThan(AA)
    const hell = derivePalette('#3180ab').light.primary
    expect(kontrast(hell, SURFACE.light)).toBeGreaterThanOrEqual(AA)
    expect(kontrast(hell, '#3180ab'), 'die Korrektur bleibt minimal').toBeLessThan(1.35)
  })
})

describe('derivePalette – die dunkle Mandantenfläche', () => {
  for (const farbe of PROBEN) {
    it(`${farbe}: das Blatt bleibt lesbar`, () => {
      const n = derivePalette(farbe).nav

      // Schrift auf dem Blatt. Beide Stufen zählen als normaler Text — der
      // Gruppentitel ist 10px, da ist AA nicht verhandelbar.
      expect(kontrast(n.text, n.surface), `${farbe}: text auf surface`)
        .toBeGreaterThanOrEqual(AA)
      expect(kontrast(n.textMuted, n.surface), `${farbe}: textMuted auf surface`)
        .toBeGreaterThanOrEqual(AA)

      // Der Akzent steht an zwei Orten: als aktiver Eintrag auf der Fläche und
      // als Initialen im Avatar-Kreis. Der Kreis ist die hellere Fläche und
      // damit der Fall, den eine Ableitung gegen `surface` allein verfehlt.
      expect(kontrast(n.accent, n.surface), `${farbe}: accent auf surface`)
        .toBeGreaterThanOrEqual(AA)
      expect(kontrast(n.accent, n.raised), `${farbe}: accent auf raised (Avatar)`)
        .toBeGreaterThanOrEqual(AA)
    })
  }

  it('bleibt dunkel, egal wie hell die Firmenfarbe ist', () => {
    // Das Blatt liegt über dem Inhalt und hebt sich im hellen Theme gerade
    // dadurch ab, dass es dunkel bleibt. Eine fast weisse Marke darf das nicht
    // umdrehen — sonst steht helle Schrift auf heller Fläche.
    for (const farbe of ['#FAFAFA', '#FFFF00', '#050505']) {
      const n = derivePalette(farbe).nav
      expect(kontrast(n.surface, '#FFFFFF'), `${farbe}: Blatt gegen Weiss`)
        .toBeGreaterThan(3)
    }
  })

  it('deckelt die Sättigung, statt die Marke roh als Fläche zu nehmen', () => {
    // #005AFF hat C ≈ 0,25. Ungedeckelt erschlägt das jeden Eintrag darauf.
    const n = derivePalette('#005AFF').nav
    expect(hexToOklch(n.surface)!.C).toBeLessThanOrEqual(0.07)
    // Der Farbton bleibt aber erhalten — sonst wäre es kein Branding mehr.
    const marke = hexToOklch('#005AFF')!
    const blatt = hexToOklch(n.surface)!
    expect(Math.abs(((blatt.H - marke.H + 540) % 360) - 180)).toBeLessThan(12)
  })

  it('folgt der Marke, nicht dem alten Festwert', () => {
    // Der Regressionsschutz für den eigentlichen Zweck: Zwei Mandanten mit
    // verschiedenen Farben bekommen verschiedene Blätter. Vorher stand für
    // beide #133550 im Stylesheet.
    expect(derivePalette('#005AFF').nav.surface)
      .not.toBe(derivePalette('#22C55E').nav.surface)
  })
})

describe('derivePalette – unbrauchbare Eingabe', () => {
  it('fällt auf den Default zurück statt NaN zu erzeugen', () => {
    for (const müll of ['', '#abc', 'rot', '#12345', '#1234567', 'undefined']) {
      const p = derivePalette(müll)
      expect(p.light.primary).toBe(derivePalette('#3180ab').light.primary)
      expect(p.nav.surface).toBe(derivePalette('#3180ab').nav.surface)
      for (const wert of Object.values(p.light).concat(Object.values(p.dark))) {
        expect(wert, `${müll} → ${wert}`).toMatch(/^#[0-9A-Fa-f]{3,6}$/)
      }
      // `accentSoft` ist als einziger Wert ein rgba() — es liegt hinter dem
      // aktiven Eintrag und muss die Fläche durchscheinen lassen.
      const { accentSoft, ...deckend } = p.nav
      for (const wert of Object.values(deckend)) {
        expect(wert, `${müll} → ${wert}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
      expect(accentSoft, `${müll} → ${accentSoft}`).toMatch(/^rgba\(\d+,\d+,\d+,[\d.]+\)$/)
    }
  })
})

describe('paletteCss', () => {
  const css = paletteCss(derivePalette('#005AFF'))

  it('bedient beide Themes und den Moment davor', () => {
    // Ein Inline-Style auf <html> kennt nur einen Wert; das Theme wechselt aber
    // zur Laufzeit. Genau deshalb sind es drei Blöcke.
    expect(css).toContain(':root{')
    expect(css).toContain(':root[data-theme="light"]{')
    expect(css).toContain(':root[data-theme="dark"]{')
  })

  it('setzt die Token beider Apps auf dieselbe Farbe', () => {
    // --accent-blue gehört der Monteur-App, --primary der Admin-App. Dass die
    // Admin-App ihr eigenes festes Blau hatte, war der eigentliche Defekt.
    const dunkel = css.split(':root[data-theme="dark"]{')[1]
    const p = derivePalette('#005AFF')
    expect(dunkel).toContain(`--accent-blue:${p.dark.primary}`)
    expect(dunkel).toContain(`--primary:${p.dark.primary}`)
    expect(dunkel).toContain(`--on-accent:${p.dark.onPrimary}`)
  })

  it('schreibt nie NaN oder undefined in eine Variable', () => {
    expect(css).not.toMatch(/NaN|undefined|null/)
  })

  it('liefert die --nav-Token themenunabhängig aus', () => {
    // Das Blatt bleibt in beiden Themes dunkel. Stünde auch nur einer der
    // --nav-Werte in einem [data-theme]-Block, hätte der die höhere
    // Spezifität und der Satz liefe beim Umschalten auseinander.
    const p = derivePalette('#005AFF')
    for (const block of [':root[data-theme="light"]{', ':root[data-theme="dark"]{']) {
      expect(css.split(block)[1].split('}')[0]).not.toContain('--nav-')
    }
    expect(css).toContain(`--nav-surface:${p.nav.surface}`)
    expect(css).toContain(`--nav-accent-soft:${p.nav.accentSoft}`)
  })
})

describe('OKLCH-Umrechnung', () => {
  it('kommt bei der Rundreise wieder an', () => {
    for (const farbe of PROBEN) {
      const zurück = oklchToHex(hexToOklch(farbe)!)
      // Ein Kanal darf um eine Quantisierungsstufe abweichen, mehr nicht.
      expect(contrastRatio(zurück, farbe), `${farbe} → ${zurück}`).toBeLessThan(1.02)
    }
  })

  it('senkt die Sättigung statt den Farbton zu verziehen', () => {
    // Ein Ton ausserhalb von sRGB: naives Abschneiden der Kanäle würde den
    // Winkel verdrehen. Erlaubt ist nur, dass Chroma sinkt.
    const zuBunt = { L: 0.55, C: 0.40, H: 262 }
    const ist = hexToOklch(oklchToHex(zuBunt))!
    expect(ist.C).toBeLessThan(zuBunt.C)
    expect(Math.abs(((ist.H - zuBunt.H + 540) % 360) - 180)).toBeLessThan(3)
  })
})

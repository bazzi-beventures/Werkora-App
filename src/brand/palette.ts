/**
 * Mandantenfarbe → vollständige Akzent-Palette, pro Theme.
 *
 * Vorher stand die Akzentfarbe an zwei Orten mit zwei Verfahren: die
 * Monteur-App bekam `brand_color` roh in `--accent-blue` geschrieben, die
 * Admin-App hatte in `admin/tokens.css` ein festes `--primary: #3081AB` für
 * *alle* Mandanten. Ein Mandant konnte seine Farbe also nur zur Hälfte setzen.
 *
 * Hier wird aus der einen Farbe alles abgeleitet, was beide Apps brauchen —
 * und zwar kontrastgeprüft statt geraten. Gerechnet wird in OKLCH: Helligkeit
 * lässt sich dort verschieben, ohne dass der Farbton mitwandert. In HSL kippt
 * ein abgedunkeltes Blau sichtbar ins Violette.
 *
 * Die Regel für jeden Wert ist dieselbe: Der Ton wandert in der Helligkeit so
 * weit, bis das Kontrastverhältnis stimmt — nie weiter. Eine Farbe, die die
 * Schwelle schon erfüllt, bleibt unangetastet. Deshalb sieht ein bestehender
 * Mandant nach dieser Umstellung praktisch gleich aus.
 */

/** Die Flächen, gegen die gerechnet wird: `--surface` beider Themes.
 *  Monteur- und Admin-App führen hier denselben Wert, deshalb genügt einer. */
const SURFACE_LIGHT = '#FFFFFF'
const SURFACE_DARK = '#1E293B'

/** WCAG AA für normalen Text. Auf einer Baustelle bei Sonnenlicht kein
 *  akademischer Wert — darunter ist die Schrift schlicht weg. */
const AA = 4.5

/**
 * Schrift auf der Akzentfläche: Weiss oder Werkora-Tinte.
 *
 * `WHITE` ist der ausgelieferte Wert und bleibt die Kurzform `#fff` — so steht
 * er seit jeher im CSS und so ist er geprüft. Gerechnet wird mit `WHITE_HEX`,
 * weil `parseHex` die Kurzform bewusst zurückweist: mit `#fff` ergäbe jede
 * Kontrastrechnung stillschweigend 1, und die Schrift fiele immer auf Tinte.
 */
const WHITE = '#fff'
const WHITE_HEX = '#FFFFFF'
const INK = '#1B2028'

/** Rückfall, wenn `brand_color` unbrauchbar ist (leer, Kurzform, Müll aus der
 *  Mandanten-Verwaltung). Entspricht dem Default in `db/tenants.py`. */
const FALLBACK = '#3180ab'

export interface ThemePalette {
  /** Akzent als Schrift/Icon auf `--surface` — erfüllt AA gegen die Fläche. */
  primary: string
  /** Hover-Fläche des gefüllten Knopfs. Trägt dieselbe Schrift wie `primary`. */
  primaryHover: string
  /** Zarte Akzentfläche (Badges, Chips). Trägt `primary` als Schrift. */
  primarySoft: string
  /** Schrift, die auf `primary` und `primaryHover` lesbar bleibt. */
  onPrimary: string
}

/**
 * Die dunkle Mandantenfläche: ein Blatt, das die Firmenfarbe **trägt**, statt
 * sie nur als Akzent zu setzen. Heute ist das das «Mehr»-Blatt der Admin-App
 * am Handy — der einzige Ort, an dem eine ganze Fläche der Firma gehört.
 *
 * Sie folgt bewusst **nicht** dem Hell/Dunkel-Umschalter: Ein Blatt, das über
 * dem Inhalt liegt, hebt sich vom hellen Theme gerade dadurch ab, dass es
 * dunkel bleibt — so war es hier schon vorher, nur eben in einem festen Blau
 * für alle Mandanten. Deshalb steht `nav` neben `light`/`dark` und nicht
 * darin.
 */
export interface NavPalette {
  /** Fläche des Blatts — tiefer, entsättigter Ton der Firmenfarbe. */
  surface: string
  /** Kante und Trennlinien darauf. Nur Fläche, trägt keine Schrift. */
  edge: string
  /** Abgesetzte Kleinteile darauf (Ziehgriff, Avatar-Kreis). */
  raised: string
  /** Schrift auf `surface` — erfüllt AA gegen die Fläche. */
  text: string
  /** Sekundärschrift darauf (Gruppentitel, Rolle). Ebenfalls AA. */
  textMuted: string
  /** Aktiver Eintrag darauf. Erfüllt AA gegen `surface` **und** `raised`,
   *  weil er auch als Initialen im Avatar-Kreis steht. */
  accent: string
  /** Die zarte Fläche hinter dem aktiven Eintrag. */
  accentSoft: string
}

export interface TenantPalette {
  light: ThemePalette
  dark: ThemePalette
  nav: NavPalette
}

// ────────────────────────────────────────────────────── sRGB / Kontrast

type Rgb = [number, number, number]

/**
 * Nur die volle Form `#aabbcc`. Die Kurzform `#abc` gilt bewusst als
 * unbrauchbar statt sie aufzufalten: Sie kommt aus der Mandanten-Verwaltung
 * durchaus vor, und eine Farbe, die dort halb eingetippt wurde, soll in den
 * Rückfall laufen und nicht stillschweigend ein Blau ergeben, das niemand
 * gewählt hat. Diese Regel ist geprüft (App.onAccent.test.ts).
 */
function parseHex(hex: string): Rgb | null {
  const h = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb
}

function toHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
    .toString(16).padStart(2, '0').toUpperCase()
  return `#${c(r)}${c(g)}${c(b)}`
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Kontrastverhältnis nach WCAG 2.x. Unbrauchbare Eingabe ergibt 1 (= kein
 *  Kontrast), damit ein Tippfehler nicht als «bestanden» durchrutscht. */
export function contrastRatio(a: string, b: string): number {
  const ra = parseHex(a), rb = parseHex(b)
  if (!ra || !rb) return 1
  const la = luminance(ra), lb = luminance(rb)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Die kontrastreichere der beiden Schriftfarben für eine Fläche. Vorher stand
 * auf `.btn-primary` fest `#fff` — bei hellen Mandantenfarben ist das nicht
 * lesbar, und mit dem Werkora-Amber vor dem Login erst recht nicht (~2,2:1).
 *
 * Unbrauchbare Eingabe ergibt Weiss: `contrastRatio` liefert dann beidseitig 1,
 * und die Fläche darf keinesfalls `NaN` in eine CSS-Variable schreiben.
 */
export function onAccentColor(surface: string): string {
  return contrastRatio(surface, INK) > contrastRatio(surface, WHITE_HEX) ? INK : WHITE
}

// ────────────────────────────────────────────────────── OKLab / OKLCH

export interface Oklch { L: number; C: number; H: number }

export function hexToOklch(hex: string): Oklch | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  return { L, C: Math.hypot(A, B), H: (Math.atan2(B, A) * 180) / Math.PI }
}

function oklchToRawRgb({ L, C, H }: Oklch): Rgb {
  const rad = (H * Math.PI) / 180
  const A = C * Math.cos(rad), B = C * Math.sin(rad)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
}

const inGamut = (c: Oklch) => oklchToRawRgb(c).every(v => v >= -1e-4 && v <= 1 + 1e-4)

/**
 * OKLCH → Hex. Liegt die Farbe ausserhalb von sRGB, wird die Sättigung
 * gesenkt, bis sie hineinpasst — Helligkeit und Farbton bleiben. Das ist der
 * Unterschied zu einfachem Abschneiden der Kanäle, das den Farbton verzieht:
 * ein zu gesättigtes Blau würde sonst violett.
 */
export function oklchToHex(c: Oklch): string {
  let { C } = c
  if (!inGamut(c)) {
    let lo = 0, hi = C
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut({ ...c, C: mid })) lo = mid; else hi = mid
    }
    C = lo
  }
  return toHex(oklchToRawRgb({ ...c, C }).map(v => fromLinear(Math.max(0, Math.min(1, v)))) as Rgb)
}

// ────────────────────────────────────────────────────── Ableitung

/**
 * Verschiebt die Helligkeit, bis der Kontrast gegen `surface` die Schwelle
 * erreicht. `step` gibt die Richtung vor (negativ = dunkler).
 *
 * Erfüllt die Farbe die Schwelle bereits, kommt sie unverändert zurück — das
 * ist der Grund, warum bestehende Mandanten nach der Umstellung gleich
 * aussehen. Wird die Grenze (Schwarz bzw. Weiss) erreicht, ohne dass die
 * Schwelle fällt, gilt der bestmögliche Wert; bei sehr blassen Firmenfarben
 * ist mehr rechnerisch nicht drin.
 */
function shiftUntil(base: Oklch, surface: string, target: number, step: number): string {
  let hex = oklchToHex(base)
  if (contrastRatio(hex, surface) >= target) return hex
  for (let L = base.L + step; L > 0 && L < 1; L += step) {
    hex = oklchToHex({ ...base, L })
    if (contrastRatio(hex, surface) >= target) return hex
  }
  return oklchToHex({ ...base, L: step < 0 ? 0.02 : 0.98 })
}

/** Zarte Akzentfläche dicht an der Grundfläche — hell im hellen Theme, dunkel
 *  im dunklen. Die Sättigung bleibt niedrig, sonst wird aus dem Chip ein Knopf. */
function softSurface(base: Oklch, dark: boolean): string {
  return dark
    ? oklchToHex({ ...base, L: 0.30, C: Math.min(base.C, 0.05) })
    : oklchToHex({ ...base, L: 0.955, C: Math.min(base.C, 0.045) })
}

function deriveTheme(base: Oklch, dark: boolean): ThemePalette {
  const surface = dark ? SURFACE_DARK : SURFACE_LIGHT
  const step = dark ? 0.02 : -0.02
  const primarySoft = softSurface(base, dark)

  // Der Akzent muss auf ZWEI Flächen als Schrift bestehen: auf --surface
  // (Links, Icons) und auf der zarten Fläche der Badges. Im dunklen Theme wird
  // er dafür heller, im hellen dunkler — ohne das läuft die Monteur-App heute
  // mit der hellen Firmenfarbe auf dunklem Grund, bei kräftigem Blau keine
  // 3,4:1. Beide Prüfungen nacheinander, die strengere gewinnt.
  const gegenFläche = shiftUntil(base, surface, AA, step)
  const primary = shiftUntil(hexToOklch(gegenFläche) ?? base, primarySoft, AA, step)

  // Erst jetzt steht die Fläche fest, auf der die Beschriftung landet. Vorher
  // hier abzuleiten hiesse, die Schrift für eine Farbe zu wählen, die am Ende
  // nicht ausgeliefert wird.
  const onPrimary = onAccentColor(primary)

  // Hover wandert von der Schrift WEG, die darauf steht: trägt der Knopf
  // Weiss, wird er dunkler, trägt er Tinte, heller. Damit bleibt die
  // Beschriftung im Hover garantiert lesbar — genau dort kippte sie sonst.
  const pOk = hexToOklch(primary) ?? base
  const hoverStep = onPrimary === WHITE ? -0.055 : 0.055
  const primaryHover = oklchToHex({ ...pOk, L: Math.max(0.05, Math.min(0.95, pOk.L + hoverStep)) })

  return { primary, primaryHover, primarySoft, onPrimary }
}

/**
 * Die Leiter der dunklen Mandantenfläche: Helligkeit und Sättigungsdeckel je
 * Ton. Die Werte sind nicht gegriffen, sondern die OKLCH-Zerlegung der Farben,
 * die im «Mehr»-Blatt bisher fest verdrahtet standen (#133550, #1c3e60,
 * #1c4a70, #f1f5f9, #94b3cc, #7dc4ed). Für den heutigen Mandanten ändert sich
 * damit fast nichts — er bekommt dieselbe Leiter, nur auf seinem Farbton statt
 * auf dem Werkora-Blau.
 *
 * Der Deckel auf der Sättigung ist der eigentliche Trick: Eine Marke wie
 * #005AFF (C = 0,25) ergäbe als volle Fläche ein Blatt, das jeden Eintrag
 * darauf erschlägt. Gedeckelt wird daraus ein tiefes Marineblau, das die
 * Herkunft erkennen lässt und trotzdem Grund bleibt. Eine unbunte Marke
 * (C = 0) läuft durch dieselbe Leiter und ergibt schlicht Grautöne.
 */
const NAV_TONES = {
  surface: { L: 0.32, C: 0.065 },
  edge:    { L: 0.36, C: 0.075 },
  raised:  { L: 0.41, C: 0.085 },
  text:    { L: 0.97, C: 0.010 },
  muted:   { L: 0.75, C: 0.050 },
  accent:  { L: 0.79, C: 0.100 },
} as const

function deriveNav(base: Oklch): NavPalette {
  const tone = (t: { L: number; C: number }): Oklch =>
    ({ L: t.L, C: Math.min(base.C, t.C), H: base.H })

  const surface = oklchToHex(tone(NAV_TONES.surface))
  const raised = oklchToHex(tone(NAV_TONES.raised))

  // Schrift auf dem Blatt wird HELLER, bis der Kontrast steht — die Fläche
  // liegt fest bei L 0,32 und ist damit für jede Marke dunkel. Wer die Schwelle
  // schon erfüllt, bleibt stehen (dieselbe Regel wie oben).
  const lift = (t: { L: number; C: number }, gegen: string) =>
    shiftUntil(tone(t), gegen, AA, 0.02)

  // Der Akzent besteht auf ZWEI Flächen: als aktiver Eintrag auf `surface`,
  // als Initialen im Avatar-Kreis auf `raised`. `raised` ist die hellere der
  // beiden und damit die strengere Prüfung — deshalb kommt sie zuletzt.
  const accent = shiftUntil(
    hexToOklch(lift(NAV_TONES.accent, surface)) ?? tone(NAV_TONES.accent),
    raised, AA, 0.02,
  )

  return {
    surface,
    edge: oklchToHex(tone(NAV_TONES.edge)),
    raised,
    text: lift(NAV_TONES.text, surface),
    textMuted: lift(NAV_TONES.muted, surface),
    accent,
    accentSoft: rgba(accent, 0.08),
  }
}

/** Vollständige Palette aus der einen Mandantenfarbe. */
export function derivePalette(brandColor: string): TenantPalette {
  const base = hexToOklch(brandColor) ?? hexToOklch(FALLBACK)!
  return {
    light: deriveTheme(base, false),
    dark: deriveTheme(base, true),
    nav: deriveNav(base),
  }
}

// ────────────────────────────────────────────────────── CSS

function rgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return `rgba(0,0,0,${alpha})`
  const [r, g, b] = rgb.map(v => Math.round(v * 255))
  return `rgba(${r},${g},${b},${alpha})`
}

function block(p: ThemePalette, dark: boolean): string {
  return [
    // Monteur-App
    `--accent-blue:${p.primary}`,
    // Im hellen Theme ein deckender Ton statt rgba: auf hellem Grund liest
    // sich ein Tint sauberer als Transparenz (Regel aus index.css).
    `--accent-blue-dim:${dark ? rgba(p.primary, 0.18) : p.primarySoft}`,
    `--accent-blue-20:${rgba(p.primary, 0.25)}`,
    `--accent-blue-25:${rgba(p.primary, 0.30)}`,
    `--accent-blue-40:${rgba(p.primary, 0.50)}`,
    // Admin-App — dieselbe Farbe, andere Token-Namen (historisch gewachsen).
    `--primary:${p.primary}`,
    `--primary-hover:${p.primaryHover}`,
    `--primary-soft:${p.primarySoft}`,
    // Gilt für beide Apps.
    `--on-accent:${p.onPrimary}`,
  ].join(';')
}

function navBlock(n: NavPalette): string {
  return [
    `--nav-surface:${n.surface}`,
    `--nav-edge:${n.edge}`,
    `--nav-raised:${n.raised}`,
    `--nav-text:${n.text}`,
    `--nav-text-muted:${n.textMuted}`,
    `--nav-accent:${n.accent}`,
    `--nav-accent-soft:${n.accentSoft}`,
  ].join(';')
}

/**
 * Stylesheet statt Inline-Styles auf `<html>`: Ein Inline-Style kennt nur
 * einen Wert, das Theme aber wechselt zur Laufzeit per Umschalter. Über
 * `[data-theme]`-Regeln greift ohne weiteres Zutun der jeweils richtige Satz.
 *
 * Der `:root`-Block ohne Attribut deckt den Moment vor dem ersten
 * `applyTheme()` ab und führt die hellen Werte, weil Hell der Default ist.
 *
 * Die `--nav-*`-Token stehen in einem eigenen `:root`-Block **ohne**
 * Theme-Varianten. Das ist kein Versehen: Das Blatt bleibt in beiden Themes
 * dunkel (siehe `NavPalette`), und weil kein `[data-theme]`-Block sie
 * überschreibt, gibt es auch nichts, was die niedrigere Spezifität von `:root`
 * ausstechen könnte.
 */
export function paletteCss(p: TenantPalette): string {
  return [
    `:root{${block(p.light, false)}}`,
    `:root[data-theme="light"]{${block(p.light, false)}}`,
    `:root[data-theme="dark"]{${block(p.dark, true)}}`,
    `:root{${navBlock(p.nav)}}`,
  ].join('\n')
}

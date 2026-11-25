// Feiertage je Kanton — gerechnet aus derselben Regeltabelle wie das Backend
// (`workdays.FEIERTAGS_REGELN`, exportiert von `python -m scripts.feiertage_export`
// nach `api/generated/feiertage.json`). Bis Etappe E1 der Ferienplanung hatte das
// Frontend eigene Kantonslisten, die vom Backend abwichen: die Tage-Zahl im
// Ferienantrag passte dann nicht zum Saldo. `feiertage.test.ts` prüft gegen die vom
// Backend berechneten Referenzdaten. Spec docs/specs/ferienplanung.md §10.1.
//
// Bewusst im Bundle statt per Request: die Mitarbeiter-App zählt Ferientage auch
// offline, und die Tabelle ist klein.
import tabelle from '../api/generated/feiertage.json'

type Regel =
  | { art: 'fix'; monat: number; tag: number }
  | { art: 'ostern'; offset: number }
  | { art: 'nter_wochentag'; monat: number; wochentag: number; n: number; offset: number; karwoche_plus?: number }

interface Eintrag {
  name: string
  regel: Regel
  kantone: 'alle' | string[]
  art: string
}

const REGELN = tabelle.regeln as Eintrag[]

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function plusTage(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** Ostersonntag (gregorianisch, Gauss-Algorithmus) — wie `workdays.ostersonntag`. */
export function ostersonntag(jahr: number): Date {
  const a = jahr % 19
  const b = Math.floor(jahr / 100)
  const c = jahr % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const monat = Math.floor((h + l - 7 * m + 114) / 31)
  const tag = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(jahr, monat - 1, tag)
}

function regelDatum(regel: Regel, jahr: number, ostern: Date): Date {
  if (regel.art === 'fix') return new Date(jahr, regel.monat - 1, regel.tag)
  if (regel.art === 'ostern') return plusTage(ostern, regel.offset)
  const erster = new Date(jahr, regel.monat - 1, 1)
  const isoWochentag = erster.getDay() === 0 ? 7 : erster.getDay()
  const bisDahin = (((regel.wochentag - isoWochentag) % 7) + 7) % 7
  let tag = plusTage(erster, bisDahin + 7 * (regel.n - 1) + regel.offset)
  if (regel.karwoche_plus && tag >= plusTage(ostern, -7) && tag < ostern) {
    tag = plusTage(tag, regel.karwoche_plus)
  }
  return tag
}

/** Feiertage eines Jahres für einen Kanton: ISO-Datum → Name, nach Datum sortiert. */
export function feiertageKanton(jahr: number, kanton: string): Map<string, string> {
  const k = (kanton || '').toUpperCase()
  const ostern = ostersonntag(jahr)
  const tage = new Map<string, string>()
  for (const e of REGELN) {
    if (e.kantone !== 'alle' && !e.kantone.includes(k)) continue
    const key = iso(regelDatum(e.regel, jahr, ostern))
    const bisher = tage.get(key)
    tage.set(key, bisher ? `${bisher} / ${e.name}` : e.name)
  }
  return new Map([...tage.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

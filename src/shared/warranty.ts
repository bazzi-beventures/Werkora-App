// Garantiefrist im Client — dieselbe Rechnung wie `services/warranty.py`.
//
// Warum zweimal: die Projektliste zeigt den Vermerk je Zeile. Eine Fristauskunft
// pro Zeile beim Server zu holen hiesse 50 Abfragen je Seite; die Zeile bringt
// mit `completed_at` und den Flags aus /pwa/me bereits alles mit, was die
// Rechnung braucht. Die Projektmaske nimmt dagegen die Antwort des Servers
// (`project.warranty`) — dort ist sie ohnehin dabei.
//
// Die Testfälle in `warranty.test.ts` sind Zeile für Zeile dieselben wie in
// `tests/unit/test_warranty.py::FRIST_FAELLE`. Laufen die zwei Fassungen
// auseinander, zeigt die Liste eine andere Frist als die Maske — und der
// Anwender glaubt der, die er zuletzt gesehen hat. Wer hier einen Fall ergänzt,
// ergänzt ihn dort mit.

export type WarrantyState =
  | 'unbekannt'
  | 'in_garantie'
  | 'nur_verdeckte_maengel'
  | 'abgelaufen'

export type WarrantyAnchorKind = 'abnahme' | 'rechnung'

export interface WarrantyConfig {
  ruegefrist_monate?: number
  verjaehrung_monate?: number
  frist_anker?: string
}

export interface WarrantyDates {
  state: WarrantyState
  anchorKind: WarrantyAnchorKind
  anchorAt: Date | null
  deadlineAt: Date | null
  expiryAt: Date | null
}

export const DEFAULT_RUEGEFRIST_MONATE = 24
export const DEFAULT_VERJAEHRUNG_MONATE = 60
const MIN_MONATE = 0
const MAX_MONATE = 600

/**
 * ISO-String (Datum oder timestamptz) → lokales Date auf Mitternacht.
 *
 * Bewusst aus den ersten zehn Zeichen zusammengesetzt statt über `new Date(s)`:
 * `new Date('2026-03-14')` liest UTC-Mitternacht, und westlich von Greenwich ist
 * das der 13. März. Eine Frist, die je nach Zeitzone einen Tag früher endet, ist
 * genau die Art Fehler, die niemand beim Testen sieht.
 */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim())
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Datum auf lokale Mitternacht, Uhrzeit weg.
 *
 * Load-bearing: `new Date()` traegt die Tageszeit, die Fristen aus
 * `addMonths(parseIsoDate(...))` stehen dagegen auf Mitternacht. Ohne diese
 * Normalisierung waere am LETZTEN Tag der Frist `today > deadlineAt` — die
 * Liste zeigte «abgelaufen», waehrend der Server (der auf Tagesebene
 * vergleicht) und damit der Projektkopf noch «in Garantie» sagen.
 */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Addiert Kalendermonate; der Tag wird aufs Monatsende geklemmt. */
export function addMonths(date: Date, months: number): Date {
  const year = date.getFullYear()
  const monthIndex = date.getMonth() + months
  // Tag 0 des Folgemonats = letzter Tag des Zielmonats.
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(date.getDate(), lastDay))
}

function clampMonate(value: unknown, fallback: number): number {
  const months = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(months)) return fallback
  return Math.max(MIN_MONATE, Math.min(MAX_MONATE, Math.trunc(months)))
}

/** Feature-Flag `garantiefall` → geprüfte Parameter. */
export function parseWarrantyConfig(
  cfg: WarrantyConfig | null | undefined,
): { ruegefrist: number; verjaehrung: number; anchorKind: WarrantyAnchorKind } {
  const ruegefrist = clampMonate(cfg?.ruegefrist_monate, DEFAULT_RUEGEFRIST_MONATE)
  const verjaehrung = clampMonate(cfg?.verjaehrung_monate, DEFAULT_VERJAEHRUNG_MONATE)
  const anchorKind: WarrantyAnchorKind = cfg?.frist_anker === 'rechnung' ? 'rechnung' : 'abnahme'
  // Eine Verjährung kürzer als die Rügefrist machte 'nur_verdeckte_maengel'
  // unerreichbar — die längere Frist gewinnt (gleiche Regel wie im Backend).
  return { ruegefrist, verjaehrung: Math.max(ruegefrist, verjaehrung), anchorKind }
}

/** Zustand am Stichtag. Der Tag der Frist zählt noch dazu. */
export function warrantyState(
  today: Date, deadlineAt: Date | null, expiryAt: Date | null,
): WarrantyState {
  if (!deadlineAt) return 'unbekannt'
  // Auf Tagesebene vergleichen, egal was der Aufrufer mitbringt: `new Date()`
  // traegt die Uhrzeit, und die machte den letzten Tag der Frist zum ersten
  // Tag danach. Die Normalisierung steht hier statt bei den Aufrufern, damit
  // sie keiner vergessen kann.
  const stichtag = startOfDay(today).getTime()
  if (stichtag <= startOfDay(deadlineAt).getTime()) return 'in_garantie'
  if (expiryAt && stichtag <= startOfDay(expiryAt).getTime()) return 'nur_verdeckte_maengel'
  return 'abgelaufen'
}

/** Die Fristauskunft zu einer Projektzeile aus der Liste. */
export function projectWarranty(
  project: {
    completed_at?: string | null
    warranty_invoice_anchor_at?: string | null
  } | null | undefined,
  cfg: WarrantyConfig | null | undefined,
  today: Date,
): WarrantyDates {
  const { ruegefrist, verjaehrung, anchorKind } = parseWarrantyConfig(cfg)
  const anchorAt = parseIsoDate(
    anchorKind === 'rechnung'
      ? project?.warranty_invoice_anchor_at
      : project?.completed_at,
  )
  const deadlineAt = anchorAt ? addMonths(anchorAt, ruegefrist) : null
  const expiryAt = anchorAt ? addMonths(anchorAt, verjaehrung) : null
  return {
    state: warrantyState(today, deadlineAt, expiryAt),
    anchorKind,
    anchorAt,
    deadlineAt,
    expiryAt,
  }
}

/**
 * Was am Projekt steht. `null` heisst: kein Vermerk — «Frist unbekannt» als
 * Badge wäre auf jedem laufenden Projekt zu sehen und damit wertlos.
 */
export function warrantyBadge(
  dates: Pick<WarrantyDates, 'state' | 'deadlineAt' | 'expiryAt'>,
): { text: string; tone: 'ok' | 'warn' | 'muted' } | null {
  // Zweistellig wie `admin/utils/format::fmtDate`, und zwar explizit: ein nacktes
  // `toLocaleDateString('de-CH')` liefert je nach ICU-Build «14.3.2028» statt
  // «14.03.2028», und der Vermerk steht direkt neben Datumsangaben, die immer
  // zweistellig sind.
  const bis = (d: Date | null) => (
    d ? d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
  )
  switch (dates.state) {
    case 'in_garantie':
      return { text: `Garantie bis ${bis(dates.deadlineAt)}`, tone: 'ok' }
    case 'nur_verdeckte_maengel':
      return { text: `Nur verdeckte Mängel bis ${bis(dates.expiryAt)}`, tone: 'warn' }
    case 'abgelaufen':
      return { text: 'Garantie abgelaufen', tone: 'muted' }
    default:
      return null
  }
}

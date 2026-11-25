// Geteilte Kalender-Helfer für Absenzen- und Einsatzplanungs-Kalender.

import { feiertageKanton } from '../../shared/feiertage'

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDateStr(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function diffDays(fromISO: string, toISO: string): number {
  const ms = parseDateStr(toISO).getTime() - parseDateStr(fromISO).getTime()
  return Math.round(ms / 86400000)
}

export function shiftISO(iso: string, days: number): string {
  return toDateStr(addDays(parseDateStr(iso), days))
}

// ─── Uhrzeit-Helfer ('HH:MM' ⇄ Minuten ab Mitternacht) ───────────────────────

export function hhmmToMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

export function minToHHMM(min: number): string {
  const clamped = ((Math.round(min) % 1440) + 1440) % 1440
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`
}

// Feiertage kommen aus der Regeltabelle des Backends (shared/feiertage.ts) — die
// frühere eigene Kantonsliste wich vom Backend ab (Spec ferienplanung.md §10.1).
export function getSwissHolidays(year: number, canton: string): Map<string, string> {
  return feiertageKanton(year, canton)
}

// Zählt Arbeitstage (Mo–Fr) zwischen zwei ISO-Daten (inkl.), abzüglich kantonaler
// Feiertage. Spiegelt die Backend-Logik (workdays.count_workdays), damit die
// angezeigte Tage-Zahl mit dem Ferien-Saldo übereinstimmt — seit E1 aus derselben
// Feiertags-Tabelle (shared/feiertage.ts).
export function countWorkdays(startISO: string, endISO: string, canton: string): number {
  const start = parseDateStr(startISO)
  const end = parseDateStr(endISO)
  if (end < start) return 0

  const holidays = new Map<string, string>()
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    for (const key of getSwissHolidays(y, canton).keys()) holidays.set(key, '')
  }

  let count = 0
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const dow = d.getDay() // 0 = So, 6 = Sa
    if (dow >= 1 && dow <= 5 && !holidays.has(toDateStr(d))) count++
  }
  return count
}

// ─── Wochen- / Monatsraster ───────────────────────────────────────────────────

export function getWeekDays(date: Date): Date[] {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day + 6) % 7
  d.setDate(d.getDate() - diff)
  return Array.from({ length: 7 }, (_, i) => {
    const n = new Date(d)
    n.setDate(d.getDate() + i)
    return n
  })
}

// ISO-8601-Kalenderwoche (Montag = Wochenanfang, KW 1 = die Woche mit dem
// ersten Donnerstag des Jahres) — so zählen Schweizer Kalender und Wochenpläne.
// Der Donnerstag derselben Woche entscheidet über das Jahr: der 31.12.2026
// (Do) ist KW 53, der 01.01.2027 (Fr) gehört noch dazu.
export function isoWeek(date: Date): number {
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7))
  const jan1 = new Date(thursday.getFullYear(), 0, 1)
  // Math.round statt floor: eine Sommerzeit-Umstellung dazwischen macht aus
  // einem Tag 23 oder 25 Stunden.
  return Math.floor(Math.round((thursday.getTime() - jan1.getTime()) / 86400000) / 7) + 1
}

// «KW 45» für einen Zeitraum, «KW 45–46» wenn er über eine Wochengrenze reicht
// (Tagesplan mit 3/5/6 Tagen ab Freitag). WW-65: die KW stand bisher nirgends
// über dem Kalender, geplant und telefoniert wird aber in Kalenderwochen.
export function kwLabel(first: Date, last: Date = first): string {
  const a = isoWeek(first), b = isoWeek(last)
  return a === b ? `KW ${a}` : `KW ${a}–${b}`
}

export function getMonthDays(date: Date): (Date | null)[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = (firstDay.getDay() + 6) % 7
  const result: (Date | null)[] = Array(startPad).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) result.push(new Date(year, month, d))
  while (result.length % 7 !== 0) result.push(null)
  return result
}

export function isToday(date: Date): boolean {
  const t = new Date()
  return (
    date.getDate() === t.getDate() &&
    date.getMonth() === t.getMonth() &&
    date.getFullYear() === t.getFullYear()
  )
}

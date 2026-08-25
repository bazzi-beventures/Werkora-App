// Geteilte Kalender-Helfer für Absenzen- und Einsatzplanungs-Kalender.

// ─── Schweizer Feiertage (kantonsabhängig) ────────────────────────────────────

export function getEaster(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

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

const CATHOLIC_CANTONS = new Set(['AG', 'AI', 'FR', 'JU', 'LU', 'NW', 'OW', 'SG', 'SO', 'SZ', 'TI', 'UR', 'VS', 'ZG'])
const WITH_BERCHTOLDSTAG = new Set(['ZH', 'BE', 'AG', 'LU', 'SG', 'SH', 'TG', 'ZG', 'AR', 'AI', 'GL', 'GR', 'SZ', 'UR', 'NW', 'OW'])
const WITH_TAG_DER_ARBEIT = new Set(['ZH', 'BL', 'BS', 'JU', 'NE', 'SH', 'TG'])
const WITH_STEPHANSTAG = new Set(['ZH', 'BE', 'AG', 'LU', 'SG', 'SH', 'TG', 'ZG', 'AR', 'AI', 'GL', 'GR', 'SZ', 'UR', 'NW', 'OW', 'BL', 'BS', 'SO'])

export function getSwissHolidays(year: number, canton: string): Map<string, string> {
  const c = canton.toUpperCase()
  const easter = getEaster(year)
  const holidays = new Map<string, string>()
  const add = (d: Date, name: string) => holidays.set(toDateStr(d), name)

  add(new Date(year, 0, 1),   'Neujahr')
  add(new Date(year, 7, 1),   'Nationalfeiertag')
  add(new Date(year, 11, 25), 'Weihnachten')

  add(addDays(easter, -2),  'Karfreitag')
  add(addDays(easter, 1),   'Ostermontag')
  add(addDays(easter, 39),  'Auffahrt')
  add(addDays(easter, 50),  'Pfingstmontag')

  if (WITH_BERCHTOLDSTAG.has(c)) add(new Date(year, 0, 2),   'Berchtoldstag')
  if (WITH_TAG_DER_ARBEIT.has(c)) add(new Date(year, 4, 1),  'Tag der Arbeit')
  if (WITH_STEPHANSTAG.has(c))    add(new Date(year, 11, 26), 'Stephanstag')

  if (CATHOLIC_CANTONS.has(c)) {
    add(addDays(easter, 60),     'Fronleichnam')
    add(new Date(year, 7, 15),   'Maria Himmelfahrt')
    add(new Date(year, 10, 1),   'Allerheiligen')
    add(new Date(year, 11, 8),   'Mariä Empfängnis')
  }

  return holidays
}

// Zählt Arbeitstage (Mo–Fr) zwischen zwei ISO-Daten (inkl.), abzüglich kantonaler
// Feiertage. Spiegelt die Backend-Logik (workdays.count_workdays), damit die
// angezeigte Tage-Zahl mit dem Ferien-Saldo übereinstimmt.
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

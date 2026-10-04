// Reine Helfer der Erinnerungen (docs/specs/erinnerungen.md) — ohne React,
// damit Fälligkeit und Schnellwahl ohne DOM testbar sind.
//
// Gerechnet wird in LOKALEN Kalendertagen (todayISO aus utils/format), nicht
// über toISOString: das rechnet nach UTC und liefert in der Schweiz zwischen
// Mitternacht und 01:00/02:00 noch das Datum von gestern.

import type { Reminder } from '../../api/admin/reminders'
import { todayISO } from '../utils/format'

export type DueBucket = 'overdue' | 'today' | 'upcoming'

/** Überfällig, heute oder später — nach dem eingegebenen Datum, nicht der Uhrzeit:
 *  «heute 15:00» ist um 09:00 schon «heute», nicht «später». */
export function dueBucket(r: Pick<Reminder, 'due_date'>, today: string = todayISO()): DueBucket {
  if (r.due_date < today) return 'overdue'
  if (r.due_date === today) return 'today'
  return 'upcoming'
}

/** '12.10.2026' bzw. '12.10.2026, 09:30' — so, wie der Mensch es eingab. */
export function formatDue(r: Pick<Reminder, 'due_date' | 'due_time'>): string {
  const [y, m, d] = r.due_date.split('-')
  const date = `${d}.${m}.${y}`
  return r.due_time ? `${date}, ${r.due_time.slice(0, 5)}` : date
}

/** Kalendertag + n Tage, als 'JJJJ-MM-TT' — lokale Zeit, sommerzeitfest. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return todayISO(dt)
}

/** Derselbe Kalendertag n Monate später; am Monatsende auf den letzten Tag
 *  geklemmt (31.01. + 1 Monat = 28./29.02., nicht 03.03.). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const lastDay = new Date(y, m - 1 + months + 1, 0).getDate()
  return todayISO(new Date(y, m - 1 + months, Math.min(d, lastDay)))
}

export interface QuickDate {
  label: string
  date: string
}

/** Schnellwahl im Formular. «Morgen» und «in einer Woche» decken den Grossteil
 *  der Rückrufe ab; das Datumsfeld bleibt für «ab 12.10. erreichbar». */
export function quickDates(today: string = todayISO()): QuickDate[] {
  return [
    { label: 'Morgen', date: addDaysISO(today, 1) },
    { label: 'In 1 Woche', date: addDaysISO(today, 7) },
    { label: 'In 2 Wochen', date: addDaysISO(today, 14) },
    { label: 'In 1 Monat', date: addMonthsISO(today, 1) },
  ]
}

/** Wozu gehört die Erinnerung? «Peter Muster · 261301 Leerwhg.» */
export function targetLabel(r: Pick<Reminder, 'customer' | 'project'>): string {
  const parts: string[] = []
  if (r.customer?.name) parts.push(r.customer.name)
  if (r.project?.name) {
    parts.push(r.project.project_id_text ? `${r.project.project_id_text} ${r.project.name}` : r.project.name)
  }
  return parts.join(' · ')
}

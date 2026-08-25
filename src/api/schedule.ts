import { getWeekDays, parseDateStr, shiftISO, toDateStr } from '../admin/utils/calendarHelpers'
import { apiFetch } from './client'

// Wochenplan des eingeloggten Mitarbeiters — die Monteur-Seite der Einsatzplanung.
// Serverseitig aufbereitet (services/schedule_export.py::build_monteur_week), und
// zwar mit denselben Funktionen wie das Wochenplan-PDF der Verwaltung: die App
// und der ausgedruckte Plan sollen nicht auseinanderlaufen.

/** Ein Einsatz an einem Tag. Ein mehrtägiger Termin kommt an jedem seiner Tage
 *  vor — die Tagesansicht zeigt, was HEUTE ansteht, nicht wann es begann. */
export interface ScheduleEntry {
  /** Projekt-id — für den Sprung in die Projektmaske. */
  id: string
  /** Termin-id; null nur bei Alt-Zeilen ohne Termin. Zusammen mit dem Tag der
   *  stabile React-Schlüssel: dasselbe Projekt darf zweimal am Tag stehen. */
  appointment_id: string | null
  name: string
  kind: string
  is_internal: boolean
  art_der_arbeit: string
  /** Fertig beschriftet vom Server ('07:30–12:00', 'ganztägig', 'ab 08:00
   *  (mehrtägig)') — inklusive Termin-Typ, wo er etwas sagt ('Aufmass · …').
   *  Bewusst nicht im Client zusammengebaut: dieselbe Zeile steht so im
   *  Wochenplan-PDF und auf dem Papier-Rapport. */
  time_label: string
  termin_kind: string | null
  termin_label: string | null
  customer_name: string
  object_address: string
  billing_address: string
  phone: string
  local_contact_name: string
  monteur_names: string[]
  bemerkung: string
  is_multi_day: boolean
}

export interface ScheduleDay {
  iso: string
  /** 'Montag' … 'Sonntag' */
  weekday: string
  /** '24.08.2026' */
  date: string
  /** '24.08.' */
  short: string
  entries: ScheduleEntry[]
}

export interface ScheduleWeek {
  week_start: string
  week_end: string
  week_number: number
  week_label: string
  has_any: boolean
  /** Immer sieben Tage, auch die leeren — die Ansicht blättert durch alle. */
  days: ScheduleDay[]
}

/** Montag der Woche, in der `iso` liegt. */
export function mondayOfISO(iso: string): string {
  return toDateStr(getWeekDays(parseDateStr(iso))[0])
}

/** Nachbartag als ISO-Datum (`step` = ±1). Läuft über die Wochengrenze hinaus —
 *  wer am Sonntag weiterwischt, landet am Montag der Folgewoche. */
export function shiftDayISO(iso: string, step: number): string {
  return shiftISO(iso, step)
}

export function todayISO(): string {
  return toDateStr(new Date())
}

export async function fetchScheduleWeek(mondayIso: string): Promise<ScheduleWeek> {
  return await apiFetch(`/pwa/schedule/week?week_start=${encodeURIComponent(mondayIso)}`) as ScheduleWeek
}

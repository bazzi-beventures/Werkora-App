import { getWeekDays, parseDateStr, shiftISO, toDateStr } from '../admin/utils/calendarHelpers'
import { apiFetch } from './client'
import type { Antwort } from './generated'

// Wochenplan des eingeloggten Mitarbeiters — die Monteur-Seite der Einsatzplanung.
// Serverseitig aufbereitet (services/schedule_export.py::build_monteur_week), und
// zwar mit denselben Funktionen wie das Wochenplan-PDF der Verwaltung: die App
// und der ausgedruckte Plan sollen nicht auseinanderlaufen.

// Wochenplan — generiert aus agents/routers/antworten/einsatzplanung.py
// (`Einsatz`, `Wochentag`, `Wochenplan`; Feldbeschreibungen dort). Ein mehrtägiger
// Termin kommt an jedem seiner Tage vor; die Woche hat immer sieben Tage.
export type ScheduleEntry = Antwort<'Einsatz'>
export type ScheduleDay = Antwort<'Wochentag'>
export type ScheduleWeek = Antwort<'Wochenplan'>

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

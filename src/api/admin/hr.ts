// HR-Auswertung: Timesheet, ArG-Verstösse, Wochenplan, Ferienübersicht und
// Jahresabschluss-Einstellungen (Modul `hr`).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

// Rolle des Kontos hinter einem Mitarbeiter — steuert im Timesheet, ob die Zeile
// zur Verwaltung gehört (ausblendbar). NICHT zu verwechseln mit `StaffRole` in
// staff.ts, das ist der Funktionssatz (Stundenansatz).
export type StaffRoleName = 'management' | 'superadmin' | 'admin' | 'user' | 'user_light' | null

export interface HrSession {
  id: string
  staff_name: string
  staff_role?: StaffRoleName
  date: string
  clock_in: string
  clock_out: string | null
  break_minutes: number
  // Anteil an break_minutes, den die Regel `automatische_pause` gesetzt hat
  // (nicht gestempelt). Ohne diese Kennzeichnung liest sich eine Regel-Pause
  // im Timesheet wie ein Stempel.
  auto_break_minutes?: number
  total_minutes: number | null
  // ArG-Befunde zu dieser Session (Text je Verstoss).
  violations?: string[]
}

export interface HrLaborHour {
  staff_name: string
  project_name: string
  hours: number
  date: string
}

export interface HrOvertimeInfo {
  total_net_hours: number
  soll_hours: number
  saldo: number
  absence_days: number
}

// Die frühere Fassung dieses Typs — nie von einem Screen benutzt — kannte nur
// `sessions` und `labor_hours`. Der Endpoint liefert deutlich mehr; die gelebte
// Form stand im HrReportsScreen und steht jetzt hier.
export interface HrTimesheet {
  sessions: HrSession[]
  labor_hours: HrLaborHour[]
  overtime_by_staff: Record<string, HrOvertimeInfo>
  soll_stunden_woche: number
  staff_roles?: Record<string, StaffRoleName>
  currently_clocked_in?: string[]
}

export async function getHrTimesheet(dateFrom: string, dateTo: string): Promise<HrTimesheet> {
  return apiFetch<HrTimesheet>(`/pwa/admin/hr/timesheet?date_from=${dateFrom}&date_to=${dateTo}`)
}

// ─── ArG-Verstösse ──────────────────────────────────────────

export interface ArgViolation {
  id: string
  staff_name: string
  staff_role?: StaffRoleName
  violation_date: string
  violation_type: string
  description: string
  severity: string
  acknowledged: boolean
  acknowledged_by: string | null
  acknowledged_at: string | null
}

export async function listArgViolations(dateFrom: string, dateTo: string): Promise<ArgViolation[]> {
  return apiFetch<ArgViolation[]>(`/pwa/admin/hr/violations?date_from=${dateFrom}&date_to=${dateTo}`)
}

/** Quittieren heisst «gesehen und bearbeitet» — der Verstoss bleibt in der Historie. */
export async function acknowledgeArgViolation(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/hr/violations/${id}/acknowledge`, { method: 'PATCH' })
}

// ─── Wochenplan (Soll-Stunden je Kalenderwoche) ─────────────

export interface WeeklyPlanEntry {
  week_number: number
  target_hours: number
  note: string
}

export async function getWeeklyPlan(year: number): Promise<WeeklyPlanEntry[]> {
  return apiFetch<WeeklyPlanEntry[]>(`/pwa/admin/hr/weekly-plan?year=${year}`)
}

/** Schickt den ganzen Jahresplan; fehlende Wochen fallen auf die Mandanten-Vorgabe zurück. */
export async function saveWeeklyPlan(year: number, entries: WeeklyPlanEntry[]): Promise<void> {
  await apiFetch('/pwa/admin/hr/weekly-plan', {
    method: 'PUT',
    body: JSON.stringify({ year, entries }),
  })
}


// ─── Ferienübersicht ────────────────────────────────────────

export interface VacationRow {
  staff_id: string
  staff_name: string
  entitlement: number
  used: number
  taken: number
  planned: number
  remaining: number
  // Woher der Anspruch kommt: 'personal' (am Mitarbeiter gesetzt) oder abgeleitet
  // aus den Mandanten-Vorgaben (Alter/Default).
  source: string
}

export async function getVacationOverview(year: number): Promise<VacationRow[]> {
  return apiFetch<VacationRow[]>(`/pwa/admin/hr/vacation-overview?year=${year}`)
}

// ─── Jahresabschluss / Überstunden-Reset ────────────────────

export interface OvertimeSettings {
  overtime_reset_month: number
  overtime_reset_day: number
  overtime_reset_policy: 'full_reset' | 'carry_all' | 'carry_max_hours'
  overtime_carry_max_hours: number
  soll_stunden_woche: number
  vacation_default_days: number
  vacation_50plus_days: number
  vacation_age_threshold: number
}

export async function getOvertimeResetSettings(): Promise<OvertimeSettings> {
  return apiFetch<OvertimeSettings>('/pwa/admin/hr/overtime-reset-settings')
}

export async function saveOvertimeResetSettings(settings: OvertimeSettings): Promise<void> {
  await apiFetch('/pwa/admin/hr/overtime-reset-settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

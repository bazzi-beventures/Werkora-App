// Einsatzplanung: Termine pro Projekt und Serientermine.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch, ApiError } from '../client'

// Spec: docs/specs/einsatzplanung-mehrere-termine.md. Die Legacy-Felder auf dem
// Projekt spiegeln serverseitig den Ersttermin.

// ─── Termin-Typen ───────────────────────────────────────────
// EINE Quelle der Wahrheit fürs Frontend (Pendant im Backend:
// db/project_appointments.py APPOINTMENT_KIND_LABELS). Schlüssel = DB-Wert,
// Wert = Anzeigename; die Reihenfolge ist die Reihenfolge im Dropdown und in
// der Kalender-Legende und folgt dem Ablauf einer Baustelle
// (Aufmass → Demontage → Montage → Wiedermontage → Service).
// Wer hier einen Typ ergänzt, braucht keine weitere UI-Änderung — nur das
// Typ-Symbol in admin/operative/scheduleShared.ts, die CHECK-Constraint der
// Spalte `kind` (Migration) und die Backend-Registry.
export const APPOINTMENT_KIND_LABELS = {
  aufmass: 'Aufmass',
  demontage: 'Demontage',
  montage: 'Montage',
  wiedermontage: 'Wiedermontage',
  service: 'Service',
  sonstiges: 'Sonstiges',
} as const

export type AppointmentKind = keyof typeof APPOINTMENT_KIND_LABELS

// Auswahlreihenfolge — für <option>-Listen und die Legende.
export const APPOINTMENT_KINDS = Object.keys(APPOINTMENT_KIND_LABELS) as AppointmentKind[]

// Normalfall eines Kundenprojekt-Termins (= DB-Default). Wird als Badge bewusst
// nicht beschriftet, damit der Regelfall den Kalender nicht zupflastert.
export const DEFAULT_APPOINTMENT_KIND: AppointmentKind = 'montage'

export interface ProjectAppointment {
  id: string
  project_id: string
  start_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  kind: AppointmentKind
  label: string | null
  // Team dieses Termins; null/leer = Projekt-Team gilt.
  monteur_ids: string[] | null
  // Klammer über die Termine einer Serie; null = Einzeltermin. Die Termine einer
  // Serie sind echte Zeilen (siehe Migration 20260814b) — jeder lässt sich
  // einzeln verschieben; nur Löschen/Ändern fragt nach «nur dieser / ganze Serie».
  series_id?: string | null
}

// ─── Serientermine ──────────────────────────────────────────
// Eine Serie MUSS ein Ende haben (count oder until) — das Backend legt beim
// Speichern je Wiederholung eine Zeile an, «bis auf Weiteres» gibt es nicht.

export type RecurrenceFreq = 'daily' | 'workdays' | 'weekly' | 'monthly'

export interface AppointmentRecurrence {
  freq: RecurrenceFreq
  // Abstand in Einheiten von `freq` (2 + 'weekly' = alle zwei Wochen).
  interval?: number
  // Anzahl Termine INKLUSIVE dem ersten.
  count?: number | null
  // Letztes zulässiges Startdatum 'YYYY-MM-DD'.
  until?: string | null
}

// Anwendungsbereich einer Änderung an einem Serientermin.
export type AppointmentScope = 'single' | 'series'

export async function listAppointments(dateFrom: string, dateTo: string): Promise<ProjectAppointment[]> {
  return apiFetch<ProjectAppointment[]>(
    `/pwa/admin/appointments?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`
  )
}

// Alle Termine EINES Projekts, chronologisch — Terminliste in der
// Projektübersicht (ProjectDetailScreen). Der Kalender lädt stattdessen
// listAppointments() über ein Zeitfenster.
export async function getProjectAppointments(projectId: string): Promise<ProjectAppointment[]> {
  return apiFetch<ProjectAppointment[]>(`/pwa/admin/projects/${projectId}/appointments`)
}

// Partial-PATCH-Semantik: fehlendes Feld = unverändert; '' bei end_date/
// start_time/end_time = Wert löschen (Backend normalisiert '' → NULL);
// monteur_ids [] = Termin-Team löschen (→ Projekt-Team gilt).
// Mit `recurrence` entsteht eine Serie statt eines Einzeltermins; zurück kommt
// der ERSTE Termin, `series_count` sagt, wie viele daraus wurden.
export async function createAppointment(
  projectId: string,
  data: Partial<ProjectAppointment> & { recurrence?: AppointmentRecurrence | null } & AbsenceOverride,
): Promise<ProjectAppointment & { series_count?: number }> {
  return apiFetch<ProjectAppointment & { series_count?: number }>(`/pwa/admin/projects/${projectId}/appointments`, {
    method: 'POST', body: JSON.stringify(data),
  })
}

// scope 'series' zieht Zeiten, Typ, Bezeichnung und Team auf alle Termine der
// Serie nach. Die DATEN bleiben immer am einzelnen Termin — sie sind je
// Wiederholung verschieden, ein gemeinsames Datum liesse die Serie auf einen
// Tag zusammenfallen.
export async function updateAppointment(
  id: string, data: Partial<ProjectAppointment> & AbsenceOverride, scope: AppointmentScope = 'single',
): Promise<ProjectAppointment> {
  return apiFetch<ProjectAppointment>(`/pwa/admin/appointments/${id}`, {
    method: 'PATCH', body: JSON.stringify({ ...data, scope }),
  })
}

export async function deleteAppointment(id: string, scope: AppointmentScope = 'single'): Promise<void> {
  await apiFetch(`/pwa/admin/appointments/${id}?scope=${scope}`, { method: 'DELETE' })
}

// ─── Absenzen in der Einsatzplanung ─────────────────────────
// Genehmigte Absenzen im Wochenfenster: die Plantafel markiert damit die Zellen
// der Abwesenden, damit der Konflikt VOR dem Drop sichtbar ist statt erst als
// Rückfrage danach. Eigener Endpunkt statt getAdminAbsences() — der liefert
// alles seit 2020 und ohne staff_id, also ohne Bezug zu einer Monteur-Zeile.

export interface ScheduleAbsence {
  // null bei Altzeilen, die nur den Namen tragen — die lassen sich keiner Zeile
  // zuordnen und bleiben in der Tafel unsichtbar (der Server sperrt trotzdem).
  staff_id: string | null
  staff_name: string
  type: string
  date_start: string
  date_end: string
  // Fertig formatiert vom Server («Ferien 24.08.–28.08.2026») — dieselbe
  // Beschriftung wie in der Rückfrage, damit Tafel und Meldung übereinstimmen.
  label: string
}

export async function listScheduleAbsences(dateFrom: string, dateTo: string): Promise<ScheduleAbsence[]> {
  return apiFetch<ScheduleAbsence[]>(
    `/pwa/admin/schedule/absences?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`
  )
}

// ─── Absenz-Sperre ──────────────────────────────────────────
// Jeder Schreibpfad, der jemanden auf ein Datum setzt, antwortet mit 409, wenn
// der Eingeplante dann eine genehmigte Absenz hat. Die Sperre ist überstimmbar:
// der Client zeigt den Text als Rückfrage und schickt denselben Request erneut
// mit `ignore_absence_conflicts: true`.

// Fehlercode des Servers (agents/routers/_deps.py::enforce_no_absence_conflict).
// Über den Code statt über den Meldungstext, damit ein anderer 409 desselben
// Endpunkts nicht versehentlich als «Trotzdem einplanen?» daherkommt.
export const ABSENCE_CONFLICT_CODE = 'absence_conflict'

/** Klartext der Absenz-Rückfrage, wenn `e` genau die ist — sonst null. */
export function absenceConflictMessage(e: unknown): string | null {
  return e instanceof ApiError && e.code === ABSENCE_CONFLICT_CODE ? e.message : null
}

// Überstimmen: dasselbe Feld an allen Schreibpfaden (Termin, Projekt, Entwurf).
export interface AbsenceOverride { ignore_absence_conflicts?: boolean }

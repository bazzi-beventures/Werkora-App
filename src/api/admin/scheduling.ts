// Einsatzplanung: Termine pro Projekt und Serientermine.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch, ApiError } from '../client'
import type { Antwort } from '../generated'

// Spec: docs/specs/einsatzplanung-mehrere-termine.md. Die Legacy-Felder auf dem
// Projekt spiegeln serverseitig den Ersttermin.

// ─── Termin-Typen ───────────────────────────────────────────
// EINE Quelle der Wahrheit fürs Frontend (Pendant im Backend:
// db/project_appointments.py APPOINTMENT_KIND_LABELS). Schlüssel = DB-Wert,
// Wert = Anzeigename; die Reihenfolge ist die Reihenfolge im Dropdown und in
// der Kalender-Legende und folgt dem Ablauf einer Baustelle
// (Ausmass → Demontage → Montage → Wiedermontage → Service).
// Wer hier einen Typ ergänzt, braucht keine weitere UI-Änderung — nur das
// Typ-Symbol in admin/operative/scheduleShared.ts, die CHECK-Constraint der
// Spalte `kind` (Migration) und die Backend-Registry.
export const APPOINTMENT_KIND_LABELS = {
  aufmass: 'Ausmass',
  demontage: 'Demontage',
  montage: 'Montage',
  wiedermontage: 'Wiedermontage',
  service: 'Service',
  // WW-67: Reparatur-Einsatz (Service = Wartung). Vorbelegt aus der Art der
  // Arbeit des Projekts, siehe projectAppointments.ts::suggestAppointmentKind.
  reparatur: 'Reparatur',
  // WW-64: Garantie-Einsatz. Die Verrechnung hängt am Garantie-Kennzeichen von
  // Projekt und Rapport (WW-33), nicht am Termin-Typ.
  garantie: 'Garantie',
  sonstiges: 'Sonstiges',
} as const

export type AppointmentKind = keyof typeof APPOINTMENT_KIND_LABELS

// Auswahlreihenfolge — für <option>-Listen und die Legende.
export const APPOINTMENT_KINDS = Object.keys(APPOINTMENT_KIND_LABELS) as AppointmentKind[]

// Normalfall eines Kundenprojekt-Termins (= DB-Default). Wird als Badge bewusst
// nicht beschriftet, damit der Regelfall den Kalender nicht zupflastert.
export const DEFAULT_APPOINTMENT_KIND: AppointmentKind = 'montage'

// Termin, Bestätigungs-Stand und Serienregel — generiert aus
// agents/routers/antworten/einsatzplanung.py (Feldbeschreibungen dort). `kind` ist
// dort ein Literal derselben Schlüssel wie APPOINTMENT_KIND_LABELS oben.
export type ProjectAppointment = Antwort<'Termin'>
export type AppointmentNoticeSnapshot = Antwort<'BestaetigungStand'>
export type SeriesRule = Antwort<'Serienregel'>

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

// Reichweite einer Änderung an einem Serientermin — wie in jedem Kalender
// (docs/specs/einsatzplanung-rueckmeldungen-2026-10.md §3).
export type AppointmentScope = 'single' | 'following' | 'series'

export async function listAppointments(dateFrom: string, dateTo: string): Promise<ProjectAppointment[]> {
  return apiFetch<ProjectAppointment[]>(
    `/pwa/admin/appointments?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`
  )
}

/**
 * Fingerabdruck der Kalenderdaten (GET /admin/schedule/stand): je ein md5 über
 * die Projekte und die Termine des Mandanten. Der Live-Takt der Einsatzplanung
 * fragt nur das ab und lädt eine Liste erst neu, wenn sich ihr Wert ändert —
 * bis 20261106 holte jeder Takt beide Listen ganz (rund 4 MB alle 2 s).
 */
export type ScheduleStand = Antwort<'PlanStand'>

/** `null`, wenn der Server keinen Stand liefern kann (503, Netzfehler, unbekannte
 *  Antwort) — der Aufrufer gleicht dann langsam voll ab, statt «unverändert»
 *  anzunehmen. Wirft nie. */
export async function getScheduleStand(): Promise<ScheduleStand | null> {
  try {
    const s = await apiFetch<Partial<ScheduleStand> | null>('/pwa/admin/schedule/stand')
    return s && typeof s.projekte === 'string' && typeof s.termine === 'string'
      ? { projekte: s.projekte, termine: s.termine }
      : null
  } catch {
    return null
  }
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
): Promise<Antwort<'TerminAngelegt'>> {
  return apiFetch<Antwort<'TerminAngelegt'>>(`/pwa/admin/projects/${projectId}/appointments`, {
    method: 'POST', body: JSON.stringify(data),
  })
}

// scope 'following'/'series' zieht Zeiten, Typ, Bezeichnung und Team auf die
// betroffenen Termine nach; ein neues Startdatum verschiebt sie um gleich viele
// Tage (nie auf dasselbe Datum — die Serie fiele sonst zusammen).
// `series_until` verlängert oder verkürzt die Serie, `recurrence` (nur mit
// 'following') wechselt den Rhythmus ab diesem Termin. Pro Anfrage eins davon.
export interface SeriesExtras {
  series_until?: string
  recurrence?: AppointmentRecurrence
}

export type UpdatedAppointment = Antwort<'TerminGeaendert'>

export async function updateAppointment(
  id: string, data: Partial<ProjectAppointment> & AbsenceOverride, scope: AppointmentScope = 'single',
  extras: SeriesExtras = {},
): Promise<UpdatedAppointment> {
  return apiFetch<UpdatedAppointment>(`/pwa/admin/appointments/${id}`, {
    method: 'PATCH', body: JSON.stringify({ ...data, scope, ...extras }),
  })
}

// Verkürzen löscht nie still, wo schon rapportiert wurde: 409 mit diesem Code
// (agents/routers/admin_scheduling.py::admin_update_appointment).
export const SERIES_ACTIVITY_CODE = 'series_has_activity'

export type AppointmentNoticeResult = Antwort<'Terminbestaetigung'>

/** Terminbestätigung (bzw. Aktualisierung) per Mail an den Kunden, mit Kalendereintrag.
 *  Modul `termin_bestaetigung`; leere Adresse = Kunden-E-Mail. */
export async function sendAppointmentNotice(
  id: string, body: { recipient_email?: string; cc_recipients?: string[]; message?: string },
): Promise<AppointmentNoticeResult> {
  return apiFetch<AppointmentNoticeResult>(`/pwa/admin/appointments/${id}/customer-notice`, {
    method: 'POST',
    body: JSON.stringify({
      ...body,
      cc_recipients: (body.cc_recipients ?? []).map(a => a.trim()).filter(Boolean),
    }),
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

/** Genehmigte Absenz im Fenster — generiert aus `PlanAbsenz`. */
export type ScheduleAbsence = Antwort<'PlanAbsenz'>

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

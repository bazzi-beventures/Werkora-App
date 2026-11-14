// Reine Bausteine der Einsatzplanung: Formular-Zustände (Projekt-Stammdaten, Termin-
// Editor mit Serien), Umrechnungen Projekt/Termin ↔ Formular, Kalender-Einträge und die
// Zeitfenster der Live-Aktualisierung. Kein React, kein Netz.
//
// Seit Charge M4a (Spec refactoring-wachstum.md §17) eigenes Modul; vorher am Kopf von
// ProjectScheduleScreen.tsx.
import {
  APPOINTMENT_KIND_LABELS, DEFAULT_APPOINTMENT_KIND,
  type AppointmentKind, type AppointmentRecurrence, type AppointmentScope,
  type ProjectAppointment, type SeriesRule,
} from '../../api/admin'
import type { ProjectKind, ScheduleProject } from '../../api/admin/projects'
import { PROJECT_KIND_LABELS } from '../utils/project'
import type { CalendarEntry } from './ProjectScheduleCalendar'
import {
  apptToDraft, emptyDraft, newAppointmentDraft, type AppointmentDraft,
} from './projectAppointments'

export interface StaffLite {
  id: string
  name: string
  projektleiter: boolean
  // Personal-Kürzel (z.B. "MW") — steht im Tagesplan vorne auf dem Balken.
  kuerzel?: string | null
}

export interface CustomerLite {
  id: string
  name: string | null
  billing_name: string | null
}

// Projekt-Stammdaten im Panel. Die TERMINE liegen seit Phase 2 nicht mehr hier,
// sondern in project_appointments (eigener Editor-State ApptFormState).
export interface FormState {
  id: string
  name: string
  kind: ProjectKind
  customerId: string
  projektleiterId: string
  monteurIds: string[]
  bemerkung: string
}

// ─── Serientermine ──────────────────────────────────────────────────────────
// Die Auswahl im Editor ist bewusst eine flache Liste gängiger Muster statt
// «alle N Tage/Wochen/Monate» mit eigenem Zahlenfeld — die fünf decken ab, was
// in der Disposition vorkommt (Sitzung, Werkstatt-Tag, Monatsrapport), und
// ersparen zwei Eingabefelder. Umgesetzt wird jedes Muster als freq+interval.

export type RepeatPreset = '' | 'daily' | 'workdays' | 'weekly' | 'biweekly' | 'monthly'

export const REPEAT_LABELS: Record<Exclude<RepeatPreset, ''>, string> = {
  daily: 'Täglich',
  workdays: 'Werktags (Mo–Fr)',
  weekly: 'Wöchentlich',
  biweekly: 'Alle 2 Wochen',
  monthly: 'Monatlich (gleicher Tag)',
}

export function repeatToRecurrence(preset: RepeatPreset, until: string): AppointmentRecurrence | null {
  if (!preset) return null
  const map: Record<Exclude<RepeatPreset, ''>, AppointmentRecurrence> = {
    daily:    { freq: 'daily', interval: 1 },
    workdays: { freq: 'workdays', interval: 1 },
    weekly:   { freq: 'weekly', interval: 1 },
    biweekly: { freq: 'weekly', interval: 2 },
    monthly:  { freq: 'monthly', interval: 1 },
  }
  return { ...map[preset], until }
}

// Editor für EINEN Termin (id = null → neuer Termin).
//
// Das Termin-Modell ist `AppointmentDraft` aus projectAppointments.ts — dasselbe,
// das der Projekt-Detail-Editor nutzt (Charge H, H4 Punkt 2). Vorher stand hier
// ein zweites, feldgleiches Modell; Payload-Bau und Validierung liefen doppelt.
// Hinzu kommen nur die Felder, die es im Detail-Editor nicht gibt: Serien und die
// Monteur-Pflicht beim Aufziehen im Kalender.
export type ApptFormState = AppointmentDraft & {
  // Beim Aufziehen eines neuen Termins gesetzt: mind. ein Monteur ist Pflicht.
  requireMonteur?: boolean
  // Serie, zu der dieser Termin gehört (null = Einzeltermin). Nur bei einem
  // BESTEHENDEN Termin gesetzt — beim Anlegen entsteht sie erst serverseitig.
  seriesId: string | null
  // Reichweite einer Änderung am bestehenden Serientermin (Spec
  // einsatzplanung-rueckmeldungen-2026-10.md §3): nur dieser, dieser und
  // folgende, ganze Serie. Default «nur dieser» — ein versehentliches «Serie»
  // trifft Dutzende Termine.
  scope: AppointmentScope
  // Gespeicherte Regel (null = Serie von vor 20261024, der Server leitet sie ab).
  seriesRule: SeriesRule | null
  // «Serie bis»: Ende beim Öffnen und das bearbeitete. Ungleich = verlängern
  // oder verkürzen.
  seriesUntilOriginal: string
  seriesUntil: string
  // Neuer Rhythmus ab diesem Termin ('' = unverändert), nur mit «folgende».
  seriesRhythm: RepeatPreset
  // Startdatum beim Öffnen — ein anderes heisst bei Serien-Reichweite «verschieben».
  originalStartDate: string
  // Wiederholung eines NEUEN Termins ('' = Einzeltermin). Eine Serie braucht ein
  // Ende — repeatUntil ist Pflicht, sobald ein Muster gewählt ist.
  repeat: RepeatPreset
  repeatUntil: string
}

// Serien-Felder in ihrem Ausgangszustand — an drei Stellen gebraucht
// (bestehender Termin laden, leerer Termin, aufgezogener Slot).
const EMPTY_SERIES_FIELDS = {
  scope: 'single' as AppointmentScope,
  seriesRule: null as SeriesRule | null,
  seriesUntilOriginal: '',
  seriesUntil: '',
  seriesRhythm: '' as RepeatPreset,
  originalStartDate: '',
  repeat: '' as RepeatPreset,
  repeatUntil: '',
}

// Ein per Drag im Kalender aufgezogener, noch nicht zugeordneter Termin. Wird
// beim Wählen eines Projekts oder Anlegen eines internen Einsatzes übernommen.
export interface PendingSlot {
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  monteurIds: string[]
}

// Kalender-Einträge: EIN Eintrag je Termin. id = Termin-ID (eindeutige Keys/
// Lanes/Drag), Terminfelder überlagern das Projekt; Team = Termin-Team,
// Fallback Projekt-Team. Termine geschlossener/archivierter/gefilterter Projekte
// fehlen. Zweimal gebraucht: für den Kalender (mit Projektleiter-Filter) und für
// die Doppelbelegungs-Warnung (ohne).
export function appointmentEntries(projectList: ScheduleProject[], appointments: ProjectAppointment[]): CalendarEntry[] {
  const projById = new Map(projectList.map(p => [p.id, p]))
  const entries: CalendarEntry[] = []
  for (const a of appointments) {
    const p = projById.get(a.project_id)
    if (!p) continue
    entries.push({
      ...p,
      id: a.id,
      start_date: a.start_date,
      end_date: a.end_date ?? a.start_date,
      start_time: a.start_time,
      end_time: a.end_time,
      monteur_ids: (a.monteur_ids && a.monteur_ids.length ? a.monteur_ids : p.monteur_ids) ?? [],
      termin_badge: p.kind === 'project' && a.kind !== DEFAULT_APPOINTMENT_KIND
        ? (a.kind === 'sonstiges' && a.label ? a.label : APPOINTMENT_KIND_LABELS[a.kind])
        : undefined,
      termin_kind: p.kind === 'project' ? a.kind : undefined,
    })
  }
  return entries
}

export function projectToForm(p: ScheduleProject): FormState {
  return {
    id: p.id,
    name: p.name,
    kind: (p.kind || 'project') as ProjectKind,
    customerId: p.customer_id ?? '',
    projektleiterId: p.projektleiter_id ?? '',
    monteurIds: p.monteur_ids ?? [],
    bemerkung: p.bemerkung ?? '',
  }
}

export function apptToForm(a: ProjectAppointment): ApptFormState {
  const until = a.series_rule?.until ?? ''
  return {
    ...apptToDraft(a), seriesId: a.series_id ?? null, ...EMPTY_SERIES_FIELDS,
    seriesRule: a.series_rule ?? null,
    seriesUntilOriginal: until,
    seriesUntil: until,
    originalStartDate: a.start_date?.slice(0, 10) ?? '',
  }
}

export function emptyApptForm(kind: AppointmentKind = 'montage'): ApptFormState {
  return { ...emptyDraft(kind), seriesId: null, ...EMPTY_SERIES_FIELDS }
}

// «+ Termin» am Projekt: gleicher Ausgangsstand wie in der Projektmaske —
// «eigenes Team» ist gesetzt, die Monteur-Auswahl steht also sofort offen.
export function newApptForm(kind: AppointmentKind = 'montage'): ApptFormState {
  return { ...newAppointmentDraft(kind), seriesId: null, ...EMPTY_SERIES_FIELDS }
}

export function slotToApptForm(slot: PendingSlot, kind: AppointmentKind = 'montage'): ApptFormState {
  return {
    ...emptyDraft(kind),
    startDate: slot.startDate,
    endDate: slot.endDate,
    startTime: slot.startTime,
    endTime: slot.endTime,
    ownTeam: slot.monteurIds.length > 0,
    monteurIds: [...slot.monteurIds],
    // Ein aufgezogener Slot ohne Monteur wäre ein Termin, den niemand sieht.
    requireMonteur: true,
    seriesId: null,
    ...EMPTY_SERIES_FIELDS,
  }
}

// 'YYYY-MM-DD' → z.B. "Di, 30.06." für Termin-Zeilen im Panel.
export function fmtSlotDate(iso: string): string {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-CH', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  })
}

export function fmtApptRow(a: ProjectAppointment): string {
  const from = fmtSlotDate(a.start_date)
  const to = a.end_date && a.end_date !== a.start_date ? ` – ${fmtSlotDate(a.end_date)}` : ''
  const t = a.start_time
    ? `${a.start_time.slice(0, 5)}${a.end_time ? `–${a.end_time.slice(0, 5)}` : ''}`
    : 'ganztägig'
  return `${from}${to} · ${t}`
}

// Vorbelegter Titel eines neuen internen Einsatzes. Beim Blocker hängt er an
// der Konfiguration: pflegt der Mandant Blocker-Kategorien, bleibt das Feld LEER
// und die Auswahl entscheidet. Sonst stünden im Kalender wieder fünf Kacheln
// namens «Blocker» nebeneinander, und niemand weiss mehr, wofür sie stehen.
// Ohne gepflegte Kategorien bleibt es beim bisherigen Verhalten.
export function internalFormTitle(kind: ProjectKind, blockerCategories: string[] = []): string {
  if (kind === 'blocker' && blockerCategories.length > 0) return ''
  return PROJECT_KIND_LABELS[kind]
}

// Ein geleertes Feld muss beim Ändern als `''` ankommen: der PATCH filtert `null`
// weg (agents/routers/admin_projects.py, `_LEERBAR`), der Eintrag bliebe stehen,
// während die Planung «Eintrag aktualisiert» meldet. Beim Anlegen dagegen `null`
// — dort gibt es nichts zu leeren, und `''` landete als Wert in der Zeile.
export function leerbar(value: string, isUpdate: boolean): string | null {
  return value || (isUpdate ? '' : null)
}

export function emptyInternalForm(kind: ProjectKind, blockerCategories: string[] = []): FormState {
  return {
    id: '',
    name: internalFormTitle(kind, blockerCategories),
    kind,
    customerId: '',
    projektleiterId: '',
    monteurIds: [],
    bemerkung: '',
  }
}

// Zeitfenster der geladenen Termine rund um heute (Tage) — deckt jede
// realistische Kalender-Navigation ab, ohne Range-State durchzureichen.
export const APPT_WINDOW_BACK_DAYS = 400
export const APPT_WINDOW_AHEAD_DAYS = 600
// Das nahe Fenster kommt zuerst: geplant wird fast nur in den nächsten 100
// Tagen (Gehlhaar 20261106: 600 der 2'310 Termine im vollen Fenster liegen
// darin). Der Kalender steht, sobald es da ist; das volle Fenster läuft
// parallel und ersetzt es, sobald es eintrifft — eine Obermenge davon.
export const NEAR_WINDOW_BACK_DAYS = 14
export const NEAR_WINDOW_AHEAD_DAYS = 100

// Live-Aktualisierung: alle 2 s nur der Fingerabdruck (getScheduleStand);
// Projekte bzw. Termine kommen erst, wenn sich ihr Wert geändert hat.
// Absenzen und Mitarbeiter (ändern sich selten) höchstens einmal pro Minute,
// beide Listen alle 5 Minuten voll als Netz. Siehe refreshLive().
export const LIVE_REFRESH_MS = 2000
export const SLOW_REFRESH_MS = 60_000
export const FULL_SYNC_MS = 5 * 60_000

// Liegt der Termin im Fenster [from, to]? Dieselbe Regel wie der Server bei
// GET /admin/appointments (db/project_appointments.py::list_project_appointments).
export function overlapsWindow(a: ProjectAppointment, from: string, to: string): boolean {
  const start = a.start_date.slice(0, 10)
  if (start > to) return false
  return a.end_date ? a.end_date.slice(0, 10) >= from : start >= from
}

// Gleiche Zeilen wie vorher? Dann den alten Array behalten — kein Re-Render der
// Tafel, keine neue Distanz-Signatur, keine Unruhe beim Tippen im Panel.
export function sameRows<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b)
}

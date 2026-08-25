// Termine (project_appointments) in der Projektübersicht — Entwurfs-Modell,
// Prüfung, Anzeige-Formate und der Abgleich «geladener Stand → Formularstand».
//
// Warum ein Entwurfs-Modell statt direkter API-Aufrufe je Klick: Die
// Projektmaske speichert alles gebündelt über EINEN «Speichern»-Knopf (inkl.
// «ungespeicherte Änderungen»-Abfrage). Termine liegen aber in einer eigenen
// Tabelle mit eigenen Endpunkten. Also hält das Formular je Termin einen
// Entwurf, und beim Speichern wird gegen den geladenen Stand diffed
// (anlegen/ändern/löschen). Nebeneffekt: In der Neu-Maske lassen sich Termine
// planen, bevor das Projekt überhaupt eine id hat.
//
// Diese Datei bleibt bewusst frei von React/JSX, damit die Regeln
// (Validierung, Diff, «nächster Termin») unit-testbar sind.

import { AppointmentKind, APPOINTMENT_KIND_LABELS, ProjectAppointment } from '../../api/admin'

export interface AppointmentDraft {
  // Stabiler React-Key: bei gespeicherten Terminen die id, sonst ein Client-Key.
  // Nie Teil eines Payloads oder Vergleichs.
  key: string
  // null = im Formular angelegt, existiert serverseitig noch nicht.
  id: string | null
  startDate: string
  // '' = eintägig (Backend: end_date NULL)
  endDate: string
  // '' = ganztägig (Backend: start_time/end_time NULL)
  startTime: string
  endTime: string
  kind: AppointmentKind
  // Freitext, nur bei kind === 'sonstiges' relevant.
  label: string
  // true = eigenes Team nur für diesen Termin; false = Projekt-Team gilt.
  ownTeam: boolean
  monteurIds: string[]
}

let draftSeq = 0

export function newDraftKey(): string {
  draftSeq += 1
  return `neu-${draftSeq}`
}

export function apptToDraft(a: ProjectAppointment): AppointmentDraft {
  const team = a.monteur_ids ?? []
  return {
    key: a.id,
    id: a.id,
    startDate: a.start_date?.slice(0, 10) ?? '',
    endDate: a.end_date?.slice(0, 10) ?? '',
    startTime: a.start_time?.slice(0, 5) ?? '',
    endTime: a.end_time?.slice(0, 5) ?? '',
    kind: a.kind,
    label: a.label ?? '',
    ownTeam: team.length > 0,
    monteurIds: team,
  }
}

export function emptyDraft(kind: AppointmentKind = 'montage'): AppointmentDraft {
  return {
    key: newDraftKey(), id: null,
    startDate: '', endDate: '', startTime: '', endTime: '',
    kind, label: '', ownTeam: false, monteurIds: [],
  }
}

// Termin-Payload für die API. '' ist dort das explizite «Feld leeren»
// (Partial-PATCH kann mit null nichts löschen), monteur_ids [] löscht das
// Termin-Team → Projekt-Team gilt wieder.
export function draftPayload(d: AppointmentDraft): Partial<ProjectAppointment> {
  return {
    start_date: d.startDate,
    end_date: d.endDate || '',
    start_time: d.startTime || '',
    end_time: d.endTime || '',
    kind: d.kind,
    label: d.kind === 'sonstiges' ? d.label.trim() : '',
    monteur_ids: d.ownTeam ? d.monteurIds : [],
  }
}

// Änderung am Startdatum. Ein eintägiger Termin (Enddatum leer oder gleicher
// Tag) zieht das Enddatum mit: sichtbar ausgefülltes Feld statt einer Lücke,
// die wie «noch auszufüllen» aussieht. Fachlich ändert das nichts — '' und
// «gleicher Tag» gelten vorne wie hinten als eintägig.
//
// Ein echter Zeitraum (Ende nach Start) bleibt unangetastet, sonst würde ein
// mehrtägiger Termin beim Korrigieren des Starts stillschweigend auf einen Tag
// zusammenfallen; dort greift weiterhin die Prüfung «Enddatum vor Startdatum».
export function applyStartDate(d: AppointmentDraft, startDate: string): Partial<AppointmentDraft> {
  const eintaegig = !d.endDate || d.endDate === d.startDate
  return eintaegig ? { startDate, endDate: startDate } : { startDate }
}

// ─── Sortierung, Vergleich ───────────────────────────────────────────────

// Chronologisch: frühestes Datum zuerst, ganztägige Termine (ohne Zeit) nach
// den getakteten desselben Tages, key als stabiler Tiebreaker. Termine ohne
// Datum (frisch angelegt, noch nicht ausgefüllt) landen am Ende.
//
// Nur für Vergleich/«nächster Termin» — die Liste im Formular behält bewusst
// ihre Reihenfolge, sonst springen die Zeilen beim Tippen eines Datums.
export function sortDrafts(list: AppointmentDraft[]): AppointmentDraft[] {
  const dateKey = (d: AppointmentDraft) => d.startDate || '9999-12-31'
  const timeKey = (d: AppointmentDraft) => d.startTime || '99:99'
  return [...list].sort((a, b) =>
    dateKey(a).localeCompare(dateKey(b)) ||
    timeKey(a).localeCompare(timeKey(b)) ||
    a.key.localeCompare(b.key),
  )
}

// Vergleichsform eines Entwurfs: nur die Felder, die wirklich gespeichert
// werden. Ein abgewähltes «eigenes Team» ist unabhängig von der stehen
// gebliebenen Auswahl gleichbedeutend mit «kein Termin-Team»; ein Label zählt
// nur beim Typ 'sonstiges'. Ohne diese Normalisierung gälte die Maske als
// geändert, sobald ein Monteur an- und wieder abgewählt wurde.
function canonicalDraft(d: AppointmentDraft) {
  return {
    startDate: d.startDate,
    endDate: d.endDate,
    startTime: d.startTime,
    endTime: d.endTime,
    kind: d.kind,
    label: d.kind === 'sonstiges' ? d.label.trim() : '',
    monteurIds: d.ownTeam ? [...d.monteurIds].sort() : [],
  }
}

export function sameDraft(a: AppointmentDraft, b: AppointmentDraft): boolean {
  return JSON.stringify(canonicalDraft(a)) === JSON.stringify(canonicalDraft(b))
}

// Kanonische Liste für die «ungespeicherte Änderungen»-Abfrage.
export function normalizeDrafts(list: AppointmentDraft[]) {
  return sortDrafts(list).map(d => ({ id: d.id, ...canonicalDraft(d) }))
}

// ─── Prüfung ─────────────────────────────────────────────────────────────

// Regeln identisch zum Backend (db/project_appointments.py validate_appointment) —
// die Maske soll den Fehler zeigen, bevor die Hälfte der Termine geschrieben ist.
export function validateDraft(d: AppointmentDraft): string | null {
  if (!d.startDate) return 'Startdatum fehlt.'
  if (d.endDate && d.endDate < d.startDate) return 'Enddatum muss nach dem Startdatum liegen.'
  if (d.startTime && d.endTime && (!d.endDate || d.endDate === d.startDate) && d.endTime < d.startTime) {
    return 'Endzeit muss nach der Startzeit liegen.'
  }
  return null
}

export function validateDrafts(list: AppointmentDraft[]): string | null {
  for (let i = 0; i < list.length; i++) {
    const err = validateDraft(list[i])
    if (err) return `${i + 1}. Termin: ${err}`
  }
  return null
}

// ─── Diff: geladener Stand → Formularstand ───────────────────────────────

export interface AppointmentDiff {
  create: AppointmentDraft[]
  update: AppointmentDraft[]
  removeIds: string[]
}

export function diffAppointments(
  baseline: AppointmentDraft[],
  current: AppointmentDraft[],
): AppointmentDiff {
  const currentIds = new Set(current.map(d => d.id).filter((id): id is string => !!id))
  const baselineById = new Map(
    baseline.filter(d => d.id).map(d => [d.id as string, d]),
  )
  return {
    create: current.filter(d => !d.id),
    update: current.filter(d => {
      if (!d.id) return false
      const before = baselineById.get(d.id)
      // Unbekannte id (Termin serverseitig weg) trotzdem als Update schicken —
      // der Endpunkt meldet dann sauber «nicht gefunden».
      return !before || !sameDraft(before, d)
    }),
    removeIds: [...baselineById.keys()].filter(id => !currentIds.has(id)),
  }
}

// ─── Anzeige ─────────────────────────────────────────────────────────────

// 'YYYY-MM-DD' → "Di, 18.08.2026". Aus dem ISO-String gebaut (mit T00:00:00),
// damit der Browser nicht in UTC interpretiert und einen Tag zurückspringt.
export function fmtDraftDate(iso: string): string {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-CH', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function fmtDraftTime(d: AppointmentDraft): string {
  if (d.startTime && d.endTime) return `${d.startTime}–${d.endTime}`
  if (d.startTime) return `ab ${d.startTime}`
  if (d.endTime) return `bis ${d.endTime}`
  return 'ganztägig'
}

// Eine Zeile «wann»: Datum (bei mehrtägig mit Enddatum) + Zeitfenster.
export function fmtDraftWhen(d: AppointmentDraft): string {
  if (!d.startDate) return 'Kein Datum'
  const datePart = d.endDate && d.endDate !== d.startDate
    ? `${fmtDraftDate(d.startDate)} – ${fmtDraftDate(d.endDate)}`
    : fmtDraftDate(d.startDate)
  return `${datePart} · ${fmtDraftTime(d)}`
}

// Überschrift eines Termins: bei 'sonstiges' der Freitext, sonst das Typ-Label.
export function draftTitle(d: AppointmentDraft): string {
  if (d.kind === 'sonstiges' && d.label.trim()) return d.label.trim()
  return APPOINTMENT_KIND_LABELS[d.kind]
}

// Wer ist dabei: eigenes Termin-Team, sonst (Fallback) das Projekt-Team.
export function draftTeamNames(
  d: AppointmentDraft,
  projectTeam: string[],
  staff: { id: string; name: string }[],
): { names: string; fromProject: boolean } {
  const ids = d.ownTeam && d.monteurIds.length ? d.monteurIds : projectTeam
  const byId = new Map(staff.map(s => [s.id, s.name]))
  return {
    names: ids.map(id => byId.get(id)).filter(Boolean).join(', '),
    fromProject: !(d.ownTeam && d.monteurIds.length),
  }
}

// Der nächste Termin ab heute (laufende mehrtägige Termine zählen als
// «nächster»). Ohne künftigen Termin null — die Maske zeigt dann den Hinweis,
// dass nichts geplant ist.
export function nextAppointment(list: AppointmentDraft[], todayISO: string): AppointmentDraft | null {
  const upcoming = sortDrafts(list.filter(d => d.startDate && (d.endDate || d.startDate) >= todayISO))
  return upcoming[0] ?? null
}

export { todayISO } from '../utils/format'

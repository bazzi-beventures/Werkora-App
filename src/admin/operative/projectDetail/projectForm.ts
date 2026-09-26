import type { Kontakt, Eigentuemer, Project, DisposalDetails } from '../../../api/admin/projects'
import { AppointmentDraft, emptyDraft, normalizeDrafts } from '../projectAppointments'
import { NewProjectPrefill } from '../newProjectPrefill'

// Der Formular-Vertrag der Projektmaske (Charge H, H3): welche Felder es gibt,
// wie ihr Ausgangsstand entsteht und wann die Maske als geaendert gilt. Bewusst
// ohne React — der Zustand dazu liegt in useProjectForm, die Maske in
// DetailsForm; diese Datei ist die gemeinsame, direkt testbare Grundlage.

const EMPTY_EIGENTUEMER: Eigentuemer = { name: '', adresse: '', telefon: '', email: '' }
const EMPTY_DISPOSAL: DisposalDetails = { material: '', menge: '', entsorger: '', nachweis_url: '', bemerkung: '' }

/**
 * Alle Felder der Projektmaske, die `handleSave` persistiert — und nur die.
 * Referenz für die „ungespeicherte Änderungen"-Abfrage beim Verlassen der Maske:
 * Der Ausgangsstand kommt aus `initialProjectForm(project)`, derselben Quelle wie
 * die useState-Initialwerte, damit beide nie auseinanderlaufen.
 */
export interface ProjectFormValues {
  name: string
  customerId: string
  objectName: string
  objectAddress: string
  billingDiffers: boolean
  billingName: string
  billingAddress: string
  artDerArbeit: string[]
  bemerkung: string
  geruestfach: string
  projektleiterId: string
  monteurIds: string[]
  /**
   * Termine des Projekts (project_appointments) als Entwürfe — mehrere je
   * Projekt, jeder mit eigenem Typ und optionalem eigenem Team. Sie liegen NICHT
   * auf der projects-Zeile: `initialProjectForm` startet deshalb leer, die
   * geladenen Termine ziehen den Ausgangsstand nach (siehe useEffect unten).
   * Die Legacy-Spalten start_date/end_date/start_time/end_time spiegelt der
   * Server aus dem Ersttermin — die Maske schreibt sie nicht mehr selbst.
   */
  appointments: AppointmentDraft[]
  kontakte: Kontakt[]
  eigentuemer: Eigentuemer
  disposal: DisposalDetails
  wartungInterval: string
  wartungLastAt: string
  wartungNextDueAt: string
  /**
   * Referenzprojekt einer Reparatur — das abgeschlossene Projekt, aus dem die
   * Nacharbeit stammt (Spec docs/specs/garantiefall.md §3.9). '' = keins.
   * Steht im Ausgangsstand, damit ein gesetzter Verweis die Maske als geändert
   * markiert und die Verlassen-Warnung greift.
   */
  parentProjectId: string
  /**
   * Garantiefall: dieses Projekt wird nicht (oder reduziert) verrechnet.
   * Unterdrückt Mindestrechnung und Werkora-Bonus und setzt das Garantie-Banner
   * aufs Rechnungs-PDF; die Rapporte erben es als Vorbelegung.
   */
  isWarranty: boolean
  /**
   * Abnahme (projects.completed_at) als 'YYYY-MM-DD' — Anker der Garantiefrist.
   * Der Server setzt sie beim Abschliessen selbst; hier steht sie, damit sie
   * nachgetragen werden kann, wo der Backfill nichts fand.
   */
  completedAt: string
}

// Aufgezogenes Zeitfenster → erster Termin-Entwurf. `endDate` bleibt leer,
// solange der Slot eintägig ist ('' = eintägig, siehe AppointmentDraft).
function slotToDraft(slot: NewProjectPrefill): AppointmentDraft {
  return {
    ...emptyDraft('montage'),
    startDate: slot.startDate,
    endDate: slot.endDate && slot.endDate !== slot.startDate ? slot.endDate : '',
    startTime: slot.startTime,
    endTime: slot.endTime,
  }
}

/**
 * Ausgangsstand der Maske.
 *
 * `prefill` kommt aus der Einsatzplanung («Zeitfenster aufgezogen → + Neues
 * Projekt anlegen») und gilt nur für ein NEUES Projekt: der Monteur der
 * angeklickten Zeile wird Projekt-Monteur, das Zeitfenster wird der erste
 * Termin. Bewusst `ownTeam: false` — der Termin erbt damit das Projekt-Team,
 * statt eine zweite, gleich lautende Mannschaft nur für diesen Termin zu führen.
 *
 * Die Vorbelegung steckt im BASELINE und nicht nur im Formularstand: sonst
 * gälte die frisch geöffnete Maske sofort als geändert und würde beim
 * Verlassen nach Speichern fragen, obwohl niemand etwas getippt hat. Angelegt
 * wird der Termin trotzdem — `diffAppointments` schickt jeden Entwurf ohne id
 * als `create`, unabhängig vom Baseline.
 */
export function initialProjectForm(
  project: Project | null,
  prefill?: NewProjectPrefill | null,
): ProjectFormValues {
  const slot = project ? null : prefill
  return {
    name: project?.name ?? '',
    customerId: project?.customer_id ?? '',
    objectName: project?.object_name ?? '',
    objectAddress: project?.object_address ?? '',
    billingDiffers: !!(project?.billing_name || project?.billing_address),
    billingName: project?.billing_name ?? '',
    billingAddress: project?.billing_address ?? '',
    artDerArbeit: project?.art_der_arbeit ?? [],
    bemerkung: project?.bemerkung ?? '',
    geruestfach: project?.geruestfach?.toString() ?? '',
    projektleiterId: project?.projektleiter_id ?? '',
    monteurIds: project?.monteur_ids ?? slot?.monteurIds ?? [],
    appointments: slot ? [slotToDraft(slot)] : [],
    kontakte: project?.kontakte ?? [],
    eigentuemer: project?.eigentuemer ?? EMPTY_EIGENTUEMER,
    disposal: project?.disposal_details ?? EMPTY_DISPOSAL,
    wartungInterval: project?.wartung_interval_months?.toString() ?? '',
    wartungLastAt: project?.wartung_last_at ?? '',
    wartungNextDueAt: project?.wartung_next_due_at ?? '',
    parentProjectId: project?.parent_project_id ?? '',
    isWarranty: !!project?.is_warranty,
    // Nur der Datumsteil: das Eingabefeld ist ein <input type="date">, und fuer
    // die Frist zaehlt ohnehin nur der Tag.
    completedAt: (project?.completed_at ?? '').slice(0, 10),
  }
}

// Kanonische Form für den Vergleich: sortierte Mehrfachauswahlen und
// aufgefüllte Optionalfelder. Ohne das gälte die Maske schon als geändert, wenn
// ein Monteur ab- und wieder angewählt wird oder eine vom Server ohne
// `is_site_contact` gelieferte Zeile einmal angefasst wurde. Die Schlüssel-
// reihenfolge macht `stabil()` weiter unten unschädlich.
function normalizeForm(v: ProjectFormValues) {
  return {
    ...v,
    artDerArbeit: [...v.artDerArbeit].sort(),
    monteurIds: [...v.monteurIds].sort(),
    appointments: normalizeDrafts(v.appointments),
    kontakte: v.kontakte.map(k => ({
      name: k.name ?? '',
      kommentar: k.kommentar ?? '',
      telefon: k.telefon ?? '',
      email: k.email ?? '',
      is_site_contact: !!k.is_site_contact,
      customer_id: k.customer_id ?? null,
    })),
    eigentuemer: {
      name: v.eigentuemer?.name ?? '',
      adresse: v.eigentuemer?.adresse ?? '',
      telefon: v.eigentuemer?.telefon ?? '',
      email: v.eigentuemer?.email ?? '',
    },
    disposal: {
      material: v.disposal?.material ?? '',
      menge: v.disposal?.menge ?? '',
      entsorger: v.disposal?.entsorger ?? '',
      nachweis_url: v.disposal?.nachweis_url ?? '',
      bemerkung: v.disposal?.bemerkung ?? '',
    },
  }
}

/**
 * Stabile Serialisierung: Schlüssel sortiert, damit der Vergleich nicht an der
 * REIHENFOLGE der Objektliterale hängt.
 *
 * `JSON.stringify` schreibt Schlüssel in Einfügereihenfolge, und
 * `initialProjectForm` (Ausgangsstand) und `currentForm` im Hook sind zwei
 * getrennte Literale. Wer ein Feld an verschiedenen Stellen einfügt, hat eine
 * Maske, die sich beim Öffnen sofort als geändert meldet — die Verlassen-Abfrage
 * kommt dann bei jedem Zurück, auch wenn niemand etwas angefasst hat. Genau das
 * ist beim Ergänzen der Garantie-Felder passiert (2026-09-22).
 */
function stabil(value: unknown): string {
  return JSON.stringify(value, (_key, val) => (
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(
          ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val
  ))
}

export function isProjectFormDirty(baseline: ProjectFormValues, current: ProjectFormValues): boolean {
  return stabil(normalizeForm(baseline)) !== stabil(normalizeForm(current))
}

/**
 * Naechster Wartungstermin = letzte Wartung + Intervall. Leer, solange eines von
 * beiden fehlt — ein geratenes Datum waere schlimmer als gar keines.
 */
export function recomputeNextDue(lastAt: string, intervalMonths: string): string {
  const n = parseInt(intervalMonths, 10)
  if (!lastAt || !Number.isFinite(n) || n <= 0) return ''
  const d = new Date(lastAt); d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

/** Entsorgungs-Angaben werden nur bei Demontage/Wiedermontage erfasst. */
export function hasEntsorgungsart(artDerArbeit: string[]): boolean {
  return artDerArbeit.includes('Demontage') || artDerArbeit.includes('Wiedermontage')
}

/** Komplett leerer Entsorgungsblock — dann geht `null` statt eines Leergeruests raus. */
export function disposalEmpty(d: DisposalDetails): boolean {
  return !d.material && !d.menge && !d.entsorger && !d.nachweis_url && !d.bemerkung
}

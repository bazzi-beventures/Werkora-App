import { useEffect, useMemo, useRef, useState } from 'react'
import {
  upsertProject, getSchedulingConfig, SchedulingConfig,
  ProjectAppointment, AppointmentKind, APPOINTMENT_KIND_LABELS, APPOINTMENT_KINDS,
  DEFAULT_APPOINTMENT_KIND, AppointmentRecurrence,
  listAppointments, createAppointment, updateAppointment, deleteAppointment,
} from '../../api/admin'
import {
  ProjectTask,
  listAdminProjectTasks, addAdminProjectTask, updateAdminProjectTask, deleteAdminProjectTask,
} from '../../api/projectTasks'
import {
  apptToDraft, draftPayload, emptyDraft, validateDraft,
  type AppointmentDraft,
} from './projectAppointments'
import { AdminScreen } from '../useAdminNav'
import { downloadSchedulePdf, getProject, getScheduleProjects } from '../../api/admin/projects'
import type { Project, ProjectKind } from '../../api/admin/projects'
import { listAllCustomers } from '../../api/admin/customers'
import { getAdminStaff } from '../../api/admin/staff'
import { PROJECT_KIND_LABELS, projectCustomerName } from '../utils/project'
import ProjectScheduleCalendar, { CalendarEntry } from './ProjectScheduleCalendar'
import { setNewProjectPrefill } from './newProjectPrefill'
import { ProjektleiterFilter } from '../components/ProjektleiterFilter'
import { shiftISO, hhmmToMin, minToHHMM, toDateStr } from '../utils/calendarHelpers'
import { useToast, ToastHost } from '../components/useToast'
import { ConfirmDialog } from '../components/ConfirmDialog'

interface StaffLite {
  id: string
  name: string
  projektleiter: boolean
  // Personal-Kürzel (z.B. "MW") — steht im Tagesplan vorne auf dem Balken.
  kuerzel?: string | null
}

interface CustomerLite {
  id: string
  name: string | null
  billing_name: string | null
}

// Projekt-Stammdaten im Panel. Die TERMINE liegen seit Phase 2 nicht mehr hier,
// sondern in project_appointments (eigener Editor-State ApptFormState).
interface FormState {
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

type RepeatPreset = '' | 'daily' | 'workdays' | 'weekly' | 'biweekly' | 'monthly'

const REPEAT_LABELS: Record<Exclude<RepeatPreset, ''>, string> = {
  daily: 'Täglich',
  workdays: 'Werktags (Mo–Fr)',
  weekly: 'Wöchentlich',
  biweekly: 'Alle 2 Wochen',
  monthly: 'Monatlich (gleicher Tag)',
}

function repeatToRecurrence(preset: RepeatPreset, until: string): AppointmentRecurrence | null {
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
type ApptFormState = AppointmentDraft & {
  // Beim Aufziehen eines neuen Termins gesetzt: mind. ein Monteur ist Pflicht.
  requireMonteur?: boolean
  // Serie, zu der dieser Termin gehört (null = Einzeltermin). Nur bei einem
  // BESTEHENDEN Termin gesetzt — beim Anlegen entsteht sie erst serverseitig.
  seriesId: string | null
  // Änderung auf alle Termine der Serie übertragen (Zeiten/Typ/Team, keine Daten).
  applyToSeries: boolean
  // Wiederholung eines NEUEN Termins ('' = Einzeltermin). Eine Serie braucht ein
  // Ende — repeatUntil ist Pflicht, sobald ein Muster gewählt ist.
  repeat: RepeatPreset
  repeatUntil: string
}

// Serien-Felder in ihrem Ausgangszustand — an drei Stellen gebraucht
// (bestehender Termin laden, leerer Termin, aufgezogener Slot).
const EMPTY_SERIES_FIELDS = {
  applyToSeries: false,
  repeat: '' as RepeatPreset,
  repeatUntil: '',
}

// Ein per Drag im Kalender aufgezogener, noch nicht zugeordneter Termin. Wird
// beim Wählen eines Projekts oder Anlegen eines internen Einsatzes übernommen.
interface PendingSlot {
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  monteurIds: string[]
}

function projectToForm(p: Project): FormState {
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

function apptToForm(a: ProjectAppointment): ApptFormState {
  return { ...apptToDraft(a), seriesId: a.series_id ?? null, ...EMPTY_SERIES_FIELDS }
}

function emptyApptForm(kind: AppointmentKind = 'montage'): ApptFormState {
  return { ...emptyDraft(kind), seriesId: null, ...EMPTY_SERIES_FIELDS }
}

function slotToApptForm(slot: PendingSlot, kind: AppointmentKind = 'montage'): ApptFormState {
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
function fmtSlotDate(iso: string): string {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-CH', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  })
}

function fmtApptRow(a: ProjectAppointment): string {
  const from = fmtSlotDate(a.start_date)
  const to = a.end_date && a.end_date !== a.start_date ? ` – ${fmtSlotDate(a.end_date)}` : ''
  const t = a.start_time
    ? `${a.start_time.slice(0, 5)}${a.end_time ? `–${a.end_time.slice(0, 5)}` : ''}`
    : 'ganztägig'
  return `${from}${to} · ${t}`
}

function emptyInternalForm(kind: ProjectKind): FormState {
  return {
    id: '',
    name: PROJECT_KIND_LABELS[kind],
    kind,
    customerId: '',
    projektleiterId: '',
    monteurIds: [],
    bemerkung: '',
  }
}

interface Props {
  canton?: string
  onNav?: (screen: AdminScreen, detailId?: string) => void
}

export default function ProjectScheduleScreen({ canton = 'ZH', onNav }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [appointments, setAppointments] = useState<ProjectAppointment[]>([])
  const [staff, setStaff] = useState<StaffLite[]>([])
  const [customers, setCustomers] = useState<CustomerLite[]>([])
  const [schedulingConfig, setSchedulingConfig] = useState<SchedulingConfig | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [apptForm, setApptForm] = useState<ApptFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast, showToast } = useToast()
  const [panelOpen, setPanelOpen] = useState(false)
  const [pendingSlot, setPendingSlot] = useState<PendingSlot | null>(null)
  // Offene Rückfrage «nur dieser Termin oder ganze Serie?» beim Löschen.
  const [seriesDeletePrompt, setSeriesDeletePrompt] = useState<ProjectAppointment | null>(null)
  const [visibleWeekIso, setVisibleWeekIso] = useState<string>('')
  const [visibleStaffIds, setVisibleStaffIds] = useState<string[] | null>(null)
  const [exporting, setExporting] = useState(false)
  const [projektleiterFilter, setProjektleiterFilter] = useState<string | null>(null)

  // Aufgaben (Checkliste) des im Panel geöffneten Projekts
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [newTaskText, setNewTaskText] = useState('')
  const [taskBusy, setTaskBusy] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTaskText, setEditingTaskText] = useState('')

  // Picker-State
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerWrapRef = useRef<HTMLDivElement>(null)

  async function loadAll() {
    setLoading(true)
    try {
      // Termine in einem grosszügigen Fenster um heute laden — deckt jede
      // realistische Kalender-Navigation ab, ohne Range-State durchzureichen.
      const todayIso = toDateStr(new Date())
      const [proj, appts, st, cust, sched] = await Promise.all([
        // /projects/schedule statt /projects: schon server-seitig auf planbare
        // Projekte gefiltert und ohne Offerten-/Rechnungs-Embeds. Vorher kamen
        // alle je angelegten Projekte samt beider Beleg-Tabellen über die
        // Leitung, nur damit die Zeile hier gleich wieder wegfiel.
        getScheduleProjects(),
        listAppointments(shiftISO(todayIso, -400), shiftISO(todayIso, 600)).catch(() => [] as ProjectAppointment[]),
        getAdminStaff(),
        listAllCustomers(),
        // Anzeige-Config ist optional — Fehler darf den Kalender nicht blockieren.
        // Aber nicht stumm: ohne sie gelten die System-Defaults (alle Ansichten,
        // keine Sperrstunde), der Planer sähe also klammheimlich einen anderen
        // Plan als der Rest des Mandanten.
        getSchedulingConfig().catch(() => null),
      ])
      setProjects(proj)
      setAppointments(appts)
      setStaff(st)
      setCustomers(cust)
      if (sched) {
        setSchedulingConfig({
          fields: { ...sched.defaults.fields, ...(sched.config.fields || {}) },
          colors: { ...sched.defaults.colors, ...(sched.config.colors || {}) },
          views: { ...(sched.defaults.views || {}), ...(sched.config.views || {}) },
          show_distances: sched.config.show_distances ?? sched.defaults.show_distances ?? true,
          grey_after: sched.config.grey_after ?? sched.defaults.grey_after ?? '',
          grey_until: sched.config.grey_until ?? sched.defaults.grey_until ?? '',
          day_capacity_hours: sched.config.day_capacity_hours ?? sched.defaults.day_capacity_hours,
        })
      } else {
        showToast('Anzeige-Einstellungen nicht geladen — Standardansicht aktiv.', 'error')
      }
    } catch {
      showToast('Daten konnten nicht geladen werden.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Click-outside für Picker-Dropdown
  useEffect(() => {
    if (!pickerOpen) return
    function onDocClick(e: MouseEvent) {
      if (!pickerWrapRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [pickerOpen])

  // Escape und Backdrop-Klick der Serien-Rückfrage kommen vom ConfirmDialog.

  // ─── Aufgaben ─────────────────────────────────────────────────────────────
  // Die Checkliste hängt am einzelnen Projekt und wird deshalb erst beim Öffnen
  // im Panel geladen — nicht in loadAll, das den ganzen Kalender füllt.
  useEffect(() => {
    setEditingTaskId(null)
    setEditingTaskText('')
    setNewTaskText('')
    const pid = form?.id
    if (!panelOpen || !pid) {
      setTasks([])
      return
    }
    let cancelled = false
    setTasksLoading(true)
    listAdminProjectTasks(pid)
      .then(t => { if (!cancelled) setTasks(t) })
      .catch(() => { if (!cancelled) setTasks([]) })
      .finally(() => { if (!cancelled) setTasksLoading(false) })
    return () => { cancelled = true }
  }, [form?.id, panelOpen])

  async function reloadTasks() {
    if (!form?.id) return
    try {
      setTasks(await listAdminProjectTasks(form.id))
    } catch { /* Liste bleibt wie sie ist */ }
  }

  async function handleAddTask() {
    const text = newTaskText.trim()
    if (!form?.id || !text || taskBusy) return
    setTaskBusy(true)
    try {
      await addAdminProjectTask(form.id, text)
      setNewTaskText('')
      await reloadTasks()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Aufgabe konnte nicht angelegt werden.', 'error')
    } finally {
      setTaskBusy(false)
    }
  }

  async function handleSaveTaskEdit() {
    const text = editingTaskText.trim()
    if (!form?.id || !editingTaskId || !text || taskBusy) return
    setTaskBusy(true)
    try {
      await updateAdminProjectTask(form.id, editingTaskId, text)
      setEditingTaskId(null)
      setEditingTaskText('')
      await reloadTasks()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Aufgabe konnte nicht gespeichert werden.', 'error')
    } finally {
      setTaskBusy(false)
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!form?.id || taskBusy) return
    if (!window.confirm('Aufgabe wirklich löschen?')) return
    setTaskBusy(true)
    try {
      await deleteAdminProjectTask(form.id, taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
      if (editingTaskId === taskId) { setEditingTaskId(null); setEditingTaskText('') }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Aufgabe konnte nicht gelöscht werden.', 'error')
    } finally {
      setTaskBusy(false)
    }
  }

  // Nächster (ab heute) Termin eines Projekts als Editor-State; ohne künftigen
  // Termin der letzte vergangene, ohne Termine null.
  function nextAppointment(projectId: string): ApptFormState | null {
    const own = appointments
      .filter(a => a.project_id === projectId)
      .slice()
      .sort((a, b) => (a.start_date + (a.start_time ?? '99'))
        .localeCompare(b.start_date + (b.start_time ?? '99')))
    if (own.length === 0) return null
    const todayIso = toDateStr(new Date())
    return apptToForm(own.find(a => a.start_date.slice(0, 10) >= todayIso) ?? own[own.length - 1])
  }

  function selectProject(p: Project, appt?: ProjectAppointment) {
    setForm(projectToForm(p))
    // Aus einem aufgezogenen Termin: neuen Termin mit den Zeiten vorbelegen;
    // sonst den geklickten Termin in den Editor laden (oder keinen).
    if (pendingSlot) {
      setApptForm(slotToApptForm(pendingSlot, p.kind === 'project' ? 'montage' : 'sonstiges'))
      setPendingSlot(null)
    } else if (appt) {
      setApptForm(apptToForm(appt))
    } else {
      // Projekt ohne konkreten Termin gewählt (Picker): den nächsten Termin in
      // den Editor laden. Sonst bliebe der Termin-Typ (Aufmass/Montage/Service …)
      // unerreichbar, obwohl er Symbol und Badge im Kalender bestimmt.
      setApptForm(nextAppointment(p.id))
    }
    setError(null)
    setPickerSearch('')
    setPickerOpen(false)
    setPanelOpen(true)
  }

  // Klick auf einen Kalenderblock: Entry-ID = Termin-ID → Termin + Projekt auflösen.
  function handleCalendarSelect(entry: Project) {
    const project = resolveEntryProject(entry)
    if (!project) return
    selectProject(project, appointments.find(a => a.id === entry.id))
  }

  // Doppelklick auf einen Kalenderblock: in die Projektmaske springen. Das Panel
  // rechts plant nur Termine — Adresse, Kunde, Kontakte, Dokumente hängen am
  // Projekt und lassen sich nur dort ändern.
  function handleCalendarOpen(entry: Project) {
    const project = resolveEntryProject(entry)
    if (project && onNav) onNav('projects', project.id)
  }

  // Entry-ID ist die TERMIN-ID (siehe calendarEntries); interne Einsätze ohne
  // Termin tragen die Projekt-ID. Beide Wege führen auf dasselbe Projekt.
  function resolveEntryProject(entry: Project): Project | undefined {
    const appt = appointments.find(a => a.id === entry.id)
    return projects.find(p => p.id === (appt?.project_id ?? entry.id))
  }

  function clearSelection() {
    setForm(null)
    setApptForm(null)
    setError(null)
  }

  function closePanel() {
    setPanelOpen(false)
    setForm(null)
    setApptForm(null)
    setPendingSlot(null)
    setError(null)
    setPickerOpen(false)
  }

  // Neuer Termin per Aufziehen im Wochenkalender: Panel im Auswahlmodus öffnen
  // (Projekt-Picker + interner Einsatz), Zeiten gemerkt, Monteur ggf. vorbelegt.
  function handleCreateSlot(dateISO: string, startTime: string, endTime: string, monteurId: string | null) {
    setForm(null)
    setApptForm(null)
    setPendingSlot({
      startDate: dateISO,
      endDate: dateISO,
      startTime,
      endTime,
      monteurIds: monteurId ? [monteurId] : [],
    })
    setPickerSearch('')
    setPickerOpen(false)
    setPanelOpen(true)
    setError(null)
  }

  // «+ Neues Projekt anlegen» aus dem Panel. Wurde vorher ein Zeitfenster
  // aufgezogen, nimmt die Neu-Maske Zeiten und Monteur mit — sonst müsste man
  // beides dort von Hand nachtragen, obwohl es im Kalender schon gewählt war.
  // Ohne Slot (Panel per «+ Einsatz planen» geöffnet) wird eine allenfalls
  // stehen gebliebene Vorbelegung ausdrücklich verworfen.
  function handleCreateNew() {
    if (!onNav) return
    setNewProjectPrefill(pendingSlot ? { ...pendingSlot } : null)
    onNav('projects', 'new')
  }

  // Drag-Verschiebung aus dem Kalender: id = TERMIN-ID. deltaDays = Tagesversatz;
  // startTime steuert die Uhrzeit: undefined = beibehalten (Monat), 'HH:MM' = neue
  // Startzeit (Dauer wird mitgezogen), null = Uhrzeit löschen (→ ganztägig).
  // monteurIds (Plantafel: Chip in andere Monteur-Zeile gezogen) = neues Team,
  // gespeichert als termin-eigenes Team; undefined = Team unverändert.
  async function handleReschedule(id: string, deltaDays: number, startTime?: string | null, monteurIds?: string[]) {
    const appt = appointments.find(a => a.id === id)
    if (!appt) return

    const teamChanged = monteurIds !== undefined &&
      JSON.stringify([...monteurIds].sort()) !== JSON.stringify([...(appt.monteur_ids ?? [])].sort())

    const newStartDate = shiftISO(appt.start_date, deltaDays)
    const newEndDate = appt.end_date ? shiftISO(appt.end_date, deltaDays) : null

    let newStartTime = appt.start_time ? appt.start_time.slice(0, 5) : null
    let newEndTime = appt.end_time ? appt.end_time.slice(0, 5) : null
    if (startTime === null) {
      newStartTime = null
      newEndTime = null
    } else if (startTime !== undefined) {
      const durMin = newStartTime && newEndTime ? hhmmToMin(newEndTime) - hhmmToMin(newStartTime) : null
      newStartTime = startTime
      newEndTime = durMin && durMin > 0 ? minToHHMM(hhmmToMin(startTime) + durMin) : null
    }

    // Nichts geändert → keinen Schreibzugriff/Audit-Eintrag auslösen.
    if (
      newStartDate === appt.start_date.slice(0, 10) &&
      (newEndDate ?? null) === (appt.end_date?.slice(0, 10) ?? null) &&
      newStartTime === (appt.start_time?.slice(0, 5) ?? null) &&
      newEndTime === (appt.end_time?.slice(0, 5) ?? null) &&
      !teamChanged
    ) return

    const optimistic: ProjectAppointment = {
      ...appt,
      start_date: newStartDate, end_date: newEndDate,
      start_time: newStartTime, end_time: newEndTime,
      monteur_ids: teamChanged ? monteurIds! : appt.monteur_ids,
    }
    setAppointments(prev => prev.map(a => a.id === id ? optimistic : a))
    try {
      // Partial-PATCH: '' = Feld explizit löschen (ganztägig), fehlend = unverändert.
      const payload: Partial<ProjectAppointment> = { start_date: newStartDate }
      if (appt.end_date) payload.end_date = newEndDate ?? ''
      if (startTime !== undefined) {
        payload.start_time = newStartTime ?? ''
        payload.end_time = newEndTime ?? ''
      }
      if (teamChanged) payload.monteur_ids = monteurIds
      await updateAppointment(id, payload)
    } catch {
      setAppointments(prev => prev.map(a => a.id === id ? appt : a))
      showToast('Verschieben fehlgeschlagen.', 'error')
    }
  }

  async function handleSave() {
    if (!form) return
    setError(null)
    if (!form.name.trim()) {
      setError('Titel ist erforderlich.'); return
    }
    if (apptForm) {
      // Ein leeres Formular für einen NEUEN Termin ist kein Fehler — es wird beim
      // Speichern übersprungen (siehe unten). Nur ein bestehender Termin darf sein
      // Datum nicht verlieren; dafür gibt es das ✕ in der Liste.
      if (apptForm.id && !apptForm.startDate) {
        setError('Startdatum des Termins fehlt — zum Entfernen das ✕ in der Terminliste nutzen.'); return
      }
      // Datums-/Zeit-Konsistenz kommt aus validateDraft — dieselbe Prüfung wie im
      // Projekt-Detail-Editor.
      if (apptForm.startDate) {
        const err = validateDraft(apptForm)
        if (err) { setError(err); return }
      }
      const effectiveTeam = apptForm.ownTeam ? apptForm.monteurIds : form.monteurIds
      if (apptForm.requireMonteur && effectiveTeam.length === 0) {
        setError('Mindestens ein Mitarbeiter ist erforderlich.'); return
      }
      // Eine Serie wird beim Speichern in echte Termine aufgelöst — ohne Ende
      // wüsste der Server nicht, wie viele. Deshalb hier hart verlangt statt
      // still gedeckelt.
      if (!apptForm.id && apptForm.repeat) {
        if (!apptForm.repeatUntil) {
          setError('Serientermin: bitte ein Enddatum der Serie angeben.'); return
        }
        if (apptForm.repeatUntil < apptForm.startDate) {
          setError('Das Serien-Ende liegt vor dem ersten Termin.'); return
        }
      }
    }
    setSaving(true)
    const isInternal = form.kind !== 'project'
    let savedMsg = form.id ? 'Eintrag aktualisiert.' : 'Eintrag erstellt.'
    try {
      // Projekt-Stammdaten OHNE Terminfelder — Termine laufen über die
      // appointment-Endpunkte (der Server spiegelt den Ersttermin selbst).
      const saved = await upsertProject({
        id: form.id || undefined,
        name: form.name,
        customer_id: isInternal ? null : (form.customerId || null),
        ...({
          kind: form.kind,
          projektleiter_id: form.projektleiterId || null,
          monteur_ids: form.monteurIds,
          bemerkung: form.bemerkung || null,
        } as Record<string, unknown>),
      }) as unknown as { project?: { id?: string } } & { id?: string }
      const targetId = form.id || saved.project?.id || saved.id
      if (apptForm && apptForm.startDate && targetId) {
        // Payload wie im Detail-Editor: '' leert ein Feld explizit (Partial-PATCH
        // kann mit null nichts löschen), monteur_ids [] gibt das Projekt-Team
        // zurück, und die Bezeichnung geht nur bei kind 'sonstiges' mit.
        const payload = draftPayload(apptForm)
        if (apptForm.id) {
          await updateAppointment(
            apptForm.id, payload,
            apptForm.seriesId && apptForm.applyToSeries ? 'series' : 'single',
          )
        } else {
          const created = await createAppointment(targetId, {
            ...payload,
            recurrence: repeatToRecurrence(apptForm.repeat, apptForm.repeatUntil),
          })
          // Wie viele Termine aus der Serie wurden, weiss erst der Server
          // (ausgefallene Monatstage, Deckel) — deshalb aus der Antwort melden.
          if ((created.series_count ?? 1) > 1) savedMsg = `Serie mit ${created.series_count} Terminen angelegt.`
        }
      }
      showToast(savedMsg, 'success')
      await loadAll()
      if (targetId) {
        // Nur das eine gespeicherte Projekt nachladen — die ganze Liste dafür zu
        // holen war schon vor dem Umbau reine Verschwendung.
        const fresh = await getProject(targetId).catch(() => null)
        if (fresh) setForm(projectToForm(fresh))
      }
      setApptForm(null)
    } catch {
      setError('Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  function handleNewInternal(kind: ProjectKind) {
    setForm(emptyInternalForm(kind))
    // Aus einem aufgezogenen Termin: Zeiten + vorausgewählten Monteur übernehmen.
    setApptForm(pendingSlot ? slotToApptForm(pendingSlot, 'sonstiges') : emptyApptForm('sonstiges'))
    setPendingSlot(null)
    setPickerSearch('')
    setPickerOpen(false)
    setPanelOpen(true)
    setError(null)
  }

  // Löschen eines Serientermins ist mehrdeutig — «nur dieser» und «ganze Serie»
  // sind beide plausibel und die Serie ist nicht wiederherstellbar. Deshalb eine
  // Rückfrage statt einer Annahme. Einzeltermine löschen wie bisher direkt.
  function requestDeleteAppt(a: ProjectAppointment) {
    if (a.series_id) setSeriesDeletePrompt(a)
    else void handleDeleteAppt(a)
  }

  async function handleDeleteAppt(a: ProjectAppointment, scope: 'single' | 'series' = 'single') {
    setSeriesDeletePrompt(null)
    setSaving(true)
    try {
      await deleteAppointment(a.id, scope)
      setAppointments(prev => scope === 'series' && a.series_id
        ? prev.filter(x => x.series_id !== a.series_id)
        : prev.filter(x => x.id !== a.id))
      if (apptForm?.id === a.id) setApptForm(null)
      showToast(scope === 'series' ? 'Serie entfernt.' : 'Termin entfernt.', 'success')
    } catch {
      showToast('Entfernen fehlgeschlagen.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleClearSchedule() {
    if (!form || !form.id) return
    setSaving(true)
    try {
      for (const a of appointments.filter(x => x.project_id === form.id)) {
        await deleteAppointment(a.id)
      }
      showToast('Termine entfernt.', 'success')
      setApptForm(null)
      await loadAll()
    } catch {
      showToast('Entfernen fehlgeschlagen.', 'error')
    } finally {
      setSaving(false)
    }
  }

  function setAllMonteurs(value: boolean) {
    setForm(f => f && ({
      ...f,
      monteurIds: value ? monteurOptions.map(s => s.id) : [],
    }))
  }

  const projektleiterOptions = useMemo(() => staff.filter(s => s.projektleiter), [staff])
  const monteurOptions = staff
  const staffLite = useMemo(
    () => staff.map(s => ({ id: s.id, name: s.name, kuerzel: s.kuerzel })),
    [staff],
  )
  const projektleiterFilterOptions = useMemo(
    () => projektleiterOptions
      .map(s => ({ id: s.id, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [projektleiterOptions],
  )

  const filteredByPl = useMemo(
    () => projektleiterFilter
      ? projects.filter(p => p.projektleiter_id === projektleiterFilter)
      : projects,
    [projects, projektleiterFilter],
  )

  // Kalender-Einträge: EIN Eintrag je Termin. id = Termin-ID (eindeutige Keys/
  // Lanes/Drag), Terminfelder überlagern das Projekt; Team = Termin-Team,
  // Fallback Projekt-Team. Badge nur bei Nicht-Standard-Typ (Aufmass/Service/…),
  // damit der Normalfall (Montage) ruhig bleibt.
  const calendarEntries = useMemo<CalendarEntry[]>(() => {
    const projById = new Map(filteredByPl.map(p => [p.id, p]))
    const entries: CalendarEntry[] = []
    for (const a of appointments) {
      const p = projById.get(a.project_id)
      if (!p) continue // geschlossen/archiviert/gefiltert → nicht im Kalender
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
  }, [filteredByPl, appointments])

  const scheduledProjectIds = useMemo(
    () => new Set(appointments.map(a => a.project_id)),
    [appointments],
  )

  // Picker-Suche: Filter über Name + Kundenname
  const filteredProjects = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    const list = q
      ? projects.filter(p =>
          p.name.toLowerCase().includes(q) ||
          projectCustomerName(p).toLowerCase().includes(q)
        )
      : projects
    return list.slice().sort((a, b) => a.name.localeCompare(b.name))
  }, [projects, pickerSearch])

  // Termine des im Panel geöffneten Projekts, chronologisch.
  const panelAppointments = useMemo(
    () => form && form.id
      ? appointments
          .filter(a => a.project_id === form.id)
          .slice()
          .sort((a, b) => (a.start_date + (a.start_time ?? '99')).localeCompare(b.start_date + (b.start_time ?? '99')))
      : [],
    [appointments, form],
  )

  async function exportSchedulePdf() {
    if (!visibleWeekIso || exporting) return
    setExporting(true)
    try {
      // staff_ids nur senden, wenn der Monteure-Filter aktiv ist — sonst nimmt
      // das Backend automatisch alle Monteure mit Einsatz in dieser Woche.
      const { blob, filename } = await downloadSchedulePdf(visibleWeekIso, visibleStaffIds)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      showToast('PDF-Export fehlgeschlagen.', 'error')
    } finally {
      setExporting(false)
    }
  }

  function toggleMonteur(id: string) {
    if (!form) return
    setForm(f => f && ({
      ...f,
      monteurIds: f.monteurIds.includes(id)
        ? f.monteurIds.filter(x => x !== id)
        : [...f.monteurIds, id],
    }))
  }

  function toggleApptMonteur(id: string) {
    setApptForm(a => a && ({
      ...a,
      monteurIds: a.monteurIds.includes(id)
        ? a.monteurIds.filter(x => x !== id)
        : [...a.monteurIds, id],
    }))
  }

  const slotMonteurNames = pendingSlot
    ? pendingSlot.monteurIds.map(id => staff.find(s => s.id === id)?.name).filter(Boolean).join(', ')
    : ''

  // Der Termin-Editor (Typ/Team-Sektion) gilt nur für Kundenprojekte — interne
  // Einsätze behalten ihren einen Termin ohne Typ-/Team-Verwaltung.
  const showApptExtras = form?.kind === 'project'

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Einsatzplanung</div>
          <div className="admin-page-subtitle">
            {calendarEntries.length} geplante Einsätze · {filteredByPl.filter(p => !scheduledProjectIds.has(p.id)).length} ohne Termin
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ProjektleiterFilter
            options={projektleiterFilterOptions}
            value={projektleiterFilter}
            onChange={setProjektleiterFilter}
          />
          <button
            className="admin-btn admin-btn-primary"
            onClick={exportSchedulePdf}
            disabled={!visibleWeekIso || exporting || loading}
            title="Aktuell sichtbare Kalenderwoche als PDF exportieren"
          >
            {exporting ? 'Exportiere…' : 'Wochenplan-PDF'}
          </button>
          {!panelOpen && (
            <>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => handleNewInternal('blocker')}
                title="Zeit provisorisch blocken — die Projektzuordnung bleibt vorerst offen"
              >
                + Blocker
              </button>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => handleNewInternal('lagerarbeit')}
                title="Internen Einsatz (Lagerarbeit, Teamsitzung, …) anlegen"
              >
                + Interner Einsatz
              </button>
              <button
                className="admin-btn admin-btn-primary solid"
                onClick={() => setPanelOpen(true)}
              >
                + Einsatz planen
              </button>
            </>
          )}
        </div>
      </div>

      <div className={`project-schedule-layout${panelOpen ? '' : ' panel-collapsed'}`}>
        <div className="project-schedule-calendar">
          <ProjectScheduleCalendar
            projects={calendarEntries}
            staff={staffLite}
            loading={loading}
            canton={canton}
            onSelect={handleCalendarSelect}
            onOpenProject={onNav ? handleCalendarOpen : undefined}
            onReschedule={handleReschedule}
            onCreateSlot={handleCreateSlot}
            onVisibleWeekChange={setVisibleWeekIso}
            onVisibleStaffChange={setVisibleStaffIds}
            schedulingConfig={schedulingConfig}
          />
        </div>

        {panelOpen && (
        <aside className="project-schedule-panel">
          <div className="project-schedule-panel-header">
            <div className="project-schedule-panel-title">
              {pendingSlot ? 'Neuer Termin' : form ? 'Einsatz planen' : 'Projekt wählen'}
            </div>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={closePanel}>
              Schließen
            </button>
          </div>

          <div className="project-schedule-panel-body">
            {/* Vorschau des aufgezogenen Termins (Zeiten + ggf. vorgewählter Monteur) */}
            {pendingSlot && (
              <div className="project-schedule-slot-banner">
                <div className="project-schedule-slot-banner-time">
                  {fmtSlotDate(pendingSlot.startDate)} · {pendingSlot.startTime}–{pendingSlot.endTime}
                </div>
                <div className="project-schedule-slot-banner-staff">
                  {slotMonteurNames
                    ? `Mitarbeiter: ${slotMonteurNames}`
                    : 'Mitarbeiter erforderlich – nach der Auswahl festlegen.'}
                </div>
              </div>
            )}

            {/* Projekt-Picker */}
            <div className="project-schedule-field" ref={pickerWrapRef} style={{ position: 'relative' }}>
              <span>Projekt</span>
              <input
                className="admin-input"
                value={form ? form.name : pickerSearch}
                onChange={e => {
                  if (form) clearSelection()
                  setPickerSearch(e.target.value)
                  setPickerOpen(true)
                }}
                onFocus={() => { if (!form) setPickerOpen(true) }}
                placeholder="Projekt suchen oder auswählen…"
                readOnly={!!form}
              />
              {pickerOpen && !form && (
                <div className="project-schedule-picker-list">
                  {filteredProjects.length === 0 ? (
                    <div className="project-schedule-picker-empty">
                      Kein Projekt gefunden.
                    </div>
                  ) : (
                    filteredProjects.map(p => {
                      const cust = projectCustomerName(p)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="project-schedule-picker-item"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => selectProject(p)}
                        >
                          <div className="project-schedule-picker-name">{p.name}</div>
                          <div className="project-schedule-picker-meta">
                            {cust || '—'}{scheduledProjectIds.has(p.id) ? ` · geplant` : ''}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={handleCreateNew}
              style={{ width: '100%' }}
            >
              + Neues Projekt anlegen
            </button>

            {pendingSlot && (
              <>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => handleNewInternal('blocker')}
                  style={{ width: '100%' }}
                  title="Diesen Zeitraum provisorisch blocken — Projektzuordnung bleibt offen"
                >
                  + Blocker (provisorisch)
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => handleNewInternal('sonstiges')}
                  style={{ width: '100%' }}
                  title="Internen Einsatz (Lagerarbeit, Teamsitzung, …) mit diesen Zeiten anlegen"
                >
                  + Interner Einsatz
                </button>
              </>
            )}

            {form && (
              <>
                <div className="project-schedule-divider" />

                <label className="project-schedule-field">
                  <span>Art des Einsatzes</span>
                  <select
                    className="admin-input"
                    value={form.kind}
                    onChange={e => setForm(f => {
                      if (!f) return f
                      const nextKind = e.target.value as ProjectKind
                      // Titel automatisch mitziehen, solange er noch dem Default-
                      // Label der bisherigen Art entspricht (Nutzer hat ihn nicht
                      // angepasst). Ein manuell getippter Titel bleibt erhalten.
                      const titleUntouched = !f.name.trim() || f.name === PROJECT_KIND_LABELS[f.kind]
                      const nextName = titleUntouched && nextKind !== 'project'
                        ? PROJECT_KIND_LABELS[nextKind]
                        : f.name
                      return { ...f, kind: nextKind, name: nextName }
                    })}
                    disabled={!!form.id && form.kind === 'project'}
                  >
                    {/* „Kundenprojekt" ist das normale, über den Picker gewählte
                        Projekt — nur zur Anzeige eines bestehenden Kundenprojekts,
                        nicht als umschaltbare Art für interne Einsätze. */}
                    {form.kind === 'project' && <option value="project">Kundenprojekt</option>}
                    <option value="teamsitzung">Teamsitzung</option>
                    <option value="weiterbildung">Weiterbildung / Kurs</option>
                    <option value="lagerarbeit">Lagerarbeit</option>
                    <option value="werkstatt">Werkstatt / Vorbereitung</option>
                    <option value="reservation">Mitarbeiter-Reservation</option>
                    <option value="blocker">Blocker (provisorisch)</option>
                    <option value="sonstiges">Sonstiges</option>
                  </select>
                </label>

                {form.kind !== 'project' && (
                  <label className="project-schedule-field">
                    <span>Titel</span>
                    <input
                      className="admin-input"
                      value={form.name}
                      onChange={e => setForm(f => f && ({ ...f, name: e.target.value }))}
                      placeholder={PROJECT_KIND_LABELS[form.kind]}
                    />
                  </label>
                )}

                {form.kind === 'project' && (
                  <label className="project-schedule-field">
                    <span>Kunde</span>
                    <select
                      className="admin-input"
                      value={form.customerId}
                      onChange={e => setForm(f => f && ({ ...f, customerId: e.target.value }))}
                    >
                      <option value="">— kein Kunde —</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.billing_name || c.name || c.id}</option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="project-schedule-field">
                  <span>Projektleiter</span>
                  <select
                    className="admin-input"
                    value={form.projektleiterId}
                    onChange={e => setForm(f => f && ({ ...f, projektleiterId: e.target.value }))}
                  >
                    <option value="">— kein Projektleiter —</option>
                    {projektleiterOptions.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>

                <div className="project-schedule-field">
                  <div className="project-schedule-field-head">
                    <span>Monteure (Projekt-Team)</span>
                    {monteurOptions.length > 0 && (
                      <button
                        type="button"
                        className="project-schedule-mini-btn"
                        onClick={() => setAllMonteurs(form.monteurIds.length < monteurOptions.length)}
                      >
                        {form.monteurIds.length < monteurOptions.length ? 'Alle wählen' : 'Alle abwählen'}
                      </button>
                    )}
                  </div>
                  <div className="project-schedule-monteur-chips">
                    {monteurOptions.length === 0 && (
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>Keine Mitarbeiter verfügbar.</div>
                    )}
                    {monteurOptions.map(s => {
                      const active = form.monteurIds.includes(s.id)
                      const lead = form.monteurIds[0] === s.id
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`project-schedule-chip${active ? ' active' : ''}${lead ? ' lead' : ''}`}
                          onClick={() => toggleMonteur(s.id)}
                          title={lead ? 'Lead-Monteur (zuerst gewählt)' : undefined}
                        >
                          {s.name}
                        </button>
                      )
                    })}
                  </div>
                  {form.monteurIds.length > 1 && (
                    <div className="project-schedule-lead-hint">
                      Rot = Lead-Monteur (der zuerst gewählte). Abwählen und neu wählen ändert ihn.
                    </div>
                  )}
                </div>

                {/* ── Termine ──────────────────────────────────────── */}
                <div className="project-schedule-divider" />

                {showApptExtras && (
                  <div className="project-schedule-field">
                    <div className="project-schedule-field-head">
                      <span>Termine</span>
                      <button
                        type="button"
                        className="project-schedule-mini-btn"
                        onClick={() => { setApptForm(emptyApptForm('montage')); setError(null) }}
                      >
                        + Termin
                      </button>
                    </div>
                    {panelAppointments.length === 0 && !apptForm && (
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>Noch keine Termine geplant.</div>
                    )}
                    {panelAppointments.map(a => (
                      <div
                        key={a.id}
                        className={`project-schedule-appt-row${apptForm?.id === a.id ? ' active' : ''}`}
                        onClick={() => { setApptForm(apptToForm(a)); setError(null) }}
                      >
                        <span className="project-schedule-appt-kind">
                          {a.series_id && (
                            <span title="Teil einer Serie" aria-label="Serientermin">🔁 </span>
                          )}
                          {a.kind === 'sonstiges' && a.label ? a.label : APPOINTMENT_KIND_LABELS[a.kind]}
                        </span>
                        <span className="project-schedule-appt-when">{fmtApptRow(a)}</span>
                        <button
                          type="button"
                          className="admin-btn-icon danger"
                          title={a.series_id ? 'Termin oder Serie entfernen' : 'Termin entfernen'}
                          onClick={e => { e.stopPropagation(); requestDeleteAppt(a) }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {apptForm && (
                  <>
                    {showApptExtras && (
                      <div className="project-schedule-row">
                        <label className="project-schedule-field">
                          <span>Termin-Typ</span>
                          <select
                            className="admin-input"
                            value={apptForm.kind}
                            onChange={e => setApptForm(a => a && ({ ...a, kind: e.target.value as AppointmentKind }))}
                          >
                            {APPOINTMENT_KINDS.map(k => (
                              <option key={k} value={k}>{APPOINTMENT_KIND_LABELS[k]}</option>
                            ))}
                          </select>
                        </label>
                        {apptForm.kind === 'sonstiges' && (
                          <label className="project-schedule-field">
                            <span>Bezeichnung</span>
                            <input
                              className="admin-input"
                              value={apptForm.label}
                              onChange={e => setApptForm(a => a && ({ ...a, label: e.target.value }))}
                              placeholder="z.B. Besprechung"
                            />
                          </label>
                        )}
                      </div>
                    )}

                    <div className="project-schedule-row">
                      <label className="project-schedule-field">
                        <span>Start</span>
                        <input
                          type="date"
                          className="admin-input"
                          value={apptForm.startDate}
                          onChange={e => setApptForm(a => {
                            if (!a) return a
                            const v = e.target.value
                            // Enddatum vorbelegen bzw. nachziehen: leer oder vor dem Start → gleicher Tag.
                            const endDate = (v && (!a.endDate || a.endDate < v)) ? v : a.endDate
                            return { ...a, startDate: v, endDate }
                          })}
                        />
                      </label>
                      <label className="project-schedule-field">
                        <span>Ende</span>
                        <input
                          type="date"
                          className="admin-input"
                          value={apptForm.endDate}
                          min={apptForm.startDate || undefined}
                          onChange={e => setApptForm(a => a && ({ ...a, endDate: e.target.value }))}
                        />
                      </label>
                    </div>

                    <div className="project-schedule-row">
                      <label className="project-schedule-field">
                        <span>Startzeit</span>
                        <input
                          type="time"
                          className="admin-input"
                          value={apptForm.startTime}
                          onChange={e => setApptForm(a => a && ({ ...a, startTime: e.target.value }))}
                        />
                      </label>
                      <label className="project-schedule-field">
                        <span>Endzeit</span>
                        <input
                          type="time"
                          className="admin-input"
                          value={apptForm.endTime}
                          onChange={e => setApptForm(a => a && ({ ...a, endTime: e.target.value }))}
                        />
                      </label>
                    </div>

                    {/* Wiederholung: nur beim ANLEGEN. Ein bestehender Serientermin
                        ist eine echte Zeile — sein Muster nachträglich zu ändern
                        hiesse, die ganze Serie neu zu bauen. Dafür: löschen und
                        neu anlegen. */}
                    {!apptForm.id && (
                      <div className="project-schedule-row">
                        <label className="project-schedule-field">
                          <span>Wiederholung</span>
                          <select
                            className="admin-input"
                            value={apptForm.repeat}
                            onChange={e => setApptForm(a => a && ({ ...a, repeat: e.target.value as RepeatPreset }))}
                          >
                            <option value="">Einmalig</option>
                            {(Object.keys(REPEAT_LABELS) as Exclude<RepeatPreset, ''>[]).map(k => (
                              <option key={k} value={k}>{REPEAT_LABELS[k]}</option>
                            ))}
                          </select>
                        </label>
                        {apptForm.repeat && (
                          <label className="project-schedule-field">
                            <span>Serie bis<span className="project-schedule-req"> *</span></span>
                            <input
                              type="date"
                              className="admin-input"
                              value={apptForm.repeatUntil}
                              min={apptForm.startDate || undefined}
                              onChange={e => setApptForm(a => a && ({ ...a, repeatUntil: e.target.value }))}
                            />
                          </label>
                        )}
                      </div>
                    )}

                    {/* Bestehender Serientermin: Umfang der Änderung wählen. Die
                        Daten bleiben immer am einzelnen Termin (siehe api/admin.ts). */}
                    {apptForm.id && apptForm.seriesId && (
                      <div className="project-schedule-field">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={apptForm.applyToSeries}
                            onChange={e => setApptForm(a => a && ({ ...a, applyToSeries: e.target.checked }))}
                          />
                          🔁 Änderung auf die ganze Serie anwenden
                        </label>
                        <div className="project-schedule-lead-hint">
                          Betrifft Uhrzeit, Termin-Typ, Bezeichnung und Team. Datum und
                          Enddatum bleiben immer nur an diesem Termin.
                        </div>
                      </div>
                    )}

                    {showApptExtras && (
                      <div className="project-schedule-field">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={apptForm.ownTeam}
                            onChange={e => setApptForm(a => a && ({ ...a, ownTeam: e.target.checked }))}
                          />
                          Eigenes Team für diesen Termin
                          {apptForm.requireMonteur && <span className="project-schedule-req"> *</span>}
                        </label>
                        {apptForm.ownTeam && (
                          <div className="project-schedule-monteur-chips" style={{ marginTop: 6 }}>
                            {monteurOptions.map(s => {
                              const active = apptForm.monteurIds.includes(s.id)
                              const lead = apptForm.monteurIds[0] === s.id
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  className={`project-schedule-chip${active ? ' active' : ''}${lead ? ' lead' : ''}`}
                                  onClick={() => toggleApptMonteur(s.id)}
                                  title={lead ? 'Lead-Monteur (zuerst gewählt)' : undefined}
                                >
                                  {s.name}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                <label className="project-schedule-field">
                  <span>Bemerkung</span>
                  <textarea
                    className="admin-input"
                    rows={3}
                    value={form.bemerkung}
                    onChange={e => setForm(f => f && ({ ...f, bemerkung: e.target.value }))}
                  />
                </label>

                {/* ── Aufgaben (Checkliste) ────────────────────────── */}
                <div className="project-schedule-divider" />

                <div className="project-schedule-field">
                  <div className="project-schedule-field-head">
                    <span>Aufgaben</span>
                    {tasks.length > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {tasks.filter(t => t.is_done).length}/{tasks.length} erledigt
                      </span>
                    )}
                  </div>

                  {!form.id ? (
                    // Aufgaben brauchen eine Projekt-ID — die entsteht erst beim
                    // ersten Speichern (neuer interner Einsatz).
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                      Nach dem Speichern lassen sich hier Aufgaben erfassen.
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          className="admin-input"
                          style={{ flex: 1 }}
                          value={newTaskText}
                          onChange={e => setNewTaskText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); void handleAddTask() }
                          }}
                          placeholder="Neue Aufgabe… (z.B. Schlüssel beim Hauswart abholen)"
                        />
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={handleAddTask}
                          disabled={taskBusy || !newTaskText.trim()}
                        >
                          + Aufgabe
                        </button>
                      </div>

                      {tasksLoading && tasks.length === 0 && (
                        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>Lade Aufgaben…</div>
                      )}
                      {!tasksLoading && tasks.length === 0 && (
                        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                          Noch keine Aufgaben. Der Monteur hakt sie in der App ab.
                        </div>
                      )}

                      {tasks.map(t => (
                        <div key={t.id} className="project-schedule-task-row">
                          {editingTaskId === t.id ? (
                            <>
                              <input
                                className="admin-input"
                                style={{ flex: 1, minWidth: 0 }}
                                value={editingTaskText}
                                onChange={e => setEditingTaskText(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); void handleSaveTaskEdit() }
                                  if (e.key === 'Escape') { setEditingTaskId(null); setEditingTaskText('') }
                                }}
                                autoFocus
                              />
                              <button
                                type="button"
                                className="project-schedule-mini-btn"
                                onClick={handleSaveTaskEdit}
                                disabled={taskBusy || !editingTaskText.trim()}
                              >
                                {/* Bewusst nicht «Speichern»: das steht unten am
                                    Panel und meint die Projekt-Stammdaten. */}
                                Übernehmen
                              </button>
                              <button
                                type="button"
                                className="project-schedule-mini-btn"
                                onClick={() => { setEditingTaskId(null); setEditingTaskText('') }}
                                disabled={taskBusy}
                              >
                                Abbrechen
                              </button>
                            </>
                          ) : (
                            <>
                              <span
                                className={`project-schedule-task-text${t.is_done ? ' done' : ''}`}
                                title={t.is_done && t.done_by_name ? `Erledigt von ${t.done_by_name}` : t.text}
                              >
                                {t.is_done ? '✓ ' : ''}{t.text}
                              </span>
                              <button
                                type="button"
                                className="project-schedule-mini-btn"
                                onClick={() => { setEditingTaskId(t.id); setEditingTaskText(t.text) }}
                                disabled={taskBusy}
                              >
                                Bearbeiten
                              </button>
                              <button
                                type="button"
                                className="admin-btn-icon danger"
                                title="Aufgabe löschen"
                                onClick={() => void handleDeleteTask(t.id)}
                                disabled={taskBusy}
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {error && <div className="project-schedule-error">{error}</div>}

                <div className="project-schedule-actions">
                  <button
                    className="admin-btn admin-btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Speichern…' : 'Speichern'}
                  </button>
                  {panelAppointments.length > 0 && (
                    <button
                      className="admin-btn admin-btn-secondary"
                      onClick={handleClearSchedule}
                      disabled={saving}
                      title="Alle Termine des Projekts aus dem Kalender entfernen, Stammdaten bleiben"
                    >
                      Termine entfernen
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
        )}
      </div>

      {/* Drei Möglichkeiten (dieser / Serie / abbrechen) — der mittlere Knopf ist
          die extraAction des ConfirmDialog. */}
      {seriesDeletePrompt && (
        <ConfirmDialog
          title="Serientermin entfernen"
          message={
            <>
              <strong>{fmtApptRow(seriesDeletePrompt)}</strong> gehört zu einer Serie.
              Soll nur dieser Termin entfernt werden oder die ganze Serie?
            </>
          }
          warning="«Ganze Serie» entfernt auch die bereits vergangenen Termine der Serie und lässt sich nicht rückgängig machen."
          extraAction={{
            label: 'Nur dieser Termin',
            onClick: () => void handleDeleteAppt(seriesDeletePrompt, 'single'),
          }}
          confirmLabel="Ganze Serie"
          variant="danger"
          busy={saving}
          onConfirm={() => void handleDeleteAppt(seriesDeletePrompt, 'series')}
          onCancel={() => setSeriesDeletePrompt(null)}
        />
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

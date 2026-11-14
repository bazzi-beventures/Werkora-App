import { useEffect, useMemo, useRef, useState } from 'react'
import { useEinsatzStaende } from './useEinsatzStaende'
import { RESERVATION_PREFIX, reservationEntries, reservationHinweis, useTerminwahlPlanung } from './useTerminwahlPlanung'
import { TerminwahlLeiste } from './TerminwahlLeiste'
import {
  upsertProject, loadSchedulingConfig, readCachedSchedulingConfig, SchedulingConfig,
  ProjectAppointment, createAppointment, updateAppointment, deleteAppointment,
  absenceConflictMessage, getProjectAppointments, SERIES_ACTIVITY_CODE, type AppointmentScope, type SeriesExtras,
} from '../../api/admin'
import { ApiError } from '../../api/client'
import {
  seriesChangeError, seriesEnd, seriesRows, seriesSavedMessage,
} from './seriesEdit'
import { useScheduleTasks } from './useScheduleTasks'
import { useScheduleData } from './useScheduleData'
import { ScheduleTasksSection } from './ScheduleTasksSection'
import { ScheduleApptEditor } from './ScheduleApptEditor'
import { ScheduleApptList } from './ScheduleApptList'
import { AbsenzRueckfrageDialog, SerienLoeschenDialog, TeamFrageDialog } from './ScheduleDialogs'
import {
  draftPayload, effectiveTeamIds, isOpenAppointment,
  NO_MONTEUR_ERROR, suggestAppointmentKind, teamlessFollowersError, teamsDiffer, todayISO, validateDraft,
} from './projectAppointments'
import { AdminScreen } from '../useAdminNav'
import { downloadSchedulePdf, getProject } from '../../api/admin/projects'
import type { ProjectKind, ScheduleProject } from '../../api/admin/projects'
import { listAllCustomers } from '../../api/admin/customers'
import { PROJECT_KIND_LABELS, kindHasProjektleiter, projectCustomerName } from '../utils/project'
import ProjectScheduleCalendar, { CalendarEntry, type CalendarFocus } from './ProjectScheduleCalendar'
import ScheduleSearch from './ScheduleSearch'
import { filterPickerProjects, pickerLabel } from './projectPicker'
import { setNewProjectPrefill } from './newProjectPrefill'
import { ProjektleiterFilter } from '../components/ProjektleiterFilter'
import { shiftISO, hhmmToMin, minToHHMM, toDateStr } from '../utils/calendarHelpers'
import { useToast, ToastHost } from '../components/useToast'
import { useVisibilityPolling } from '../../hooks/useVisibilityPolling'
import { patchVormerkung, type Vormerkung } from '../../api/admin/hagelschadenDispo'
import { VorschlagPanel } from './hagelschaden/dispo/VorschlagPanel'
import {
  findStaffOverlaps, formatStaffOverlaps, isVorschlag, VORSCHLAG_PREFIX, vorschlagVerschoben,
  type PlannedSlot,
} from './scheduleShared'
import { STATUS_LABELS as VORSCHLAG_STATUS } from './hagelschaden/dispo/dispoFormat'
import { anforderung, fehlende, pillenJeMitarbeiter } from '../utils/skillMatch'
import { SkillPill } from '../components/SkillPills'
import {
  repeatToRecurrence,
  appointmentEntries,
  projectToForm,
  apptToForm,
  emptyApptForm,
  newApptForm,
  slotToApptForm,
  fmtSlotDate,
  internalFormTitle,
  leerbar,
  emptyInternalForm,
  APPT_WINDOW_BACK_DAYS,
  APPT_WINDOW_AHEAD_DAYS,
  LIVE_REFRESH_MS,
  overlapsWindow,
  type CustomerLite,
  type FormState,
  type ApptFormState,
  type PendingSlot,
} from './scheduleScreenModel'

interface Props {
  canton?: string
  onNav?: (screen: AdminScreen, detailId?: string) => void
  /** Ebene «Vorschläge» der Hagelschaden-Disposition (Modul + Feature). */
  hagelVorschlaege?: boolean
  /** Servicebegleitung, Unterwegs-Meldung: Stand der heutigen Einsätze in der Plantafel. */
  einsatzStand?: boolean
  /** Servicebegleitung, Terminwahl: Reservationen; `ohneBoard` zeigt zusätzlich den Zähler. */
  terminwahl?: boolean
  ohneBoard?: boolean
}

const VORSCHLAEGE_KEY = 'einsatzplanung-vorschlaege-zeigen'

function vorschlaegeZeigenGespeichert(): boolean {
  try { return window.localStorage.getItem(VORSCHLAEGE_KEY) !== '0' } catch { return true }
}

export default function ProjectScheduleScreen({
  canton = 'ZH', onNav, hagelVorschlaege = false, einsatzStand = false, terminwahl = false, ohneBoard = false,
}: Props) {
  const einsatzStaende = useEinsatzStaende(einsatzStand)
  const twPlanung = useTerminwahlPlanung(terminwahl, terminwahl && ohneBoard)
  // §7.3: ein Termin über einer Reservation warnt in derselben Rückfrage wie die Doppelbelegung.
  const reservationWarnung = (slot: PlannedSlot) => reservationHinweis(
    twPlanung.reservationen, slot, staffLite, id => projects.find(p => p.id === id)?.name ?? 'Projekt') ?? ''
  const [vorschlaegeZeigen, setVorschlaegeZeigen] = useState(vorschlaegeZeigenGespeichert)
  const [vorschlagOffen, setVorschlagOffen] = useState<Vormerkung | null>(null)
  // Kundenstamm: nur für die «Kunde»-Auswahl im Planungs-Panel. Er lag früher im
  // Erst-Ladepaket des Kalenders und hielt ihn auf — eine volle Tabelle, die der
  // Planer erst sieht, wenn er das Panel überhaupt öffnet.
  const [customers, setCustomers] = useState<CustomerLite[]>([])
  const customersLoaded = useRef(false)
  // Anzeige-Config: aus dem Cache vorbelegt, damit die Reiterleiste beim
  // Wiederöffnen sofort stimmt. `configPending` bleibt true, bis die Antwort da
  // ist — ohne Cache zeigt der Kalender solange gar keine Reiter statt aller.
  const [schedulingConfig, setSchedulingConfig] = useState<SchedulingConfig | undefined>(
    readCachedSchedulingConfig,
  )
  const [configPending, setConfigPending] = useState(true)
  // Titel-Vorschläge für provisorische Blocker (Konfiguration → Einsatzplanung).
  // Getrimmt und ohne Leereinträge — eine ältere, von Hand geschriebene Config
  // darf im Dropdown keine leere Zeile erzeugen.
  const blockerCategories = useMemo(
    () => (schedulingConfig?.blocker_categories ?? []).map(c => c.trim()).filter(Boolean),
    [schedulingConfig],
  )
  const [form, setForm] = useState<FormState | null>(null)
  const [apptForm, setApptForm] = useState<ApptFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast, showToast } = useToast()
  const [panelOpen, setPanelOpen] = useState(false)
  const [pendingSlot, setPendingSlot] = useState<PendingSlot | null>(null)
  // Offene Rückfrage «nur dieser Termin oder ganze Serie?» beim Löschen.
  const [seriesDeletePrompt, setSeriesDeletePrompt] = useState<ProjectAppointment | null>(null)
  const [seriesDeleteScope, setSeriesDeleteScope] = useState<AppointmentScope>('single')
  // Rückfrage «trotzdem einplanen?»: der Server lehnt einen Einsatz in einer
  // genehmigten Absenz mit 409 ab, überstimmbar. `onConfirm` wiederholt genau
  // denselben Schreibvorgang mit gesetztem Override. Dieselbe Rückfrage stellt
  // die Doppelbelegungs-Warnung (WW-70, «analog Ferien») — mit eigenem Titel.
  const [absencePrompt, setAbsencePrompt] = useState<
    { message: string; onConfirm: () => void; onCancel?: () => void; kind?: 'absence' | 'overlap' } | null
  >(null)
  // Projekte, Termine, Absenzen, Mitarbeiter, Vorschläge und Skills samt
  // Live-Aktualisierung (seit Charge M4b in useScheduleData).
  const {
    projects, appointments, setAppointments, absences, vorschlaege, setVorschlaege,
    skillKatalog, staffPillen, projektPillen, staff, loading,
    beginWrite, endWrite, verwerfeLaufendeAbrufe, refreshLive, ladeVorschlaege, loadAll,
  } = useScheduleData({ hagelVorschlaege, showToast, pausiert: absencePrompt !== null })
  // Vor den Handlern deklariert, die sie lesen (Doppelbelegungs-Prüfung): der
  // React Compiler bewahrt die Memoisierung sonst nicht (preserve-manual-memoization).
  const staffLite = useMemo(
    () => staff.map(s => ({ id: s.id, name: s.name, kuerzel: s.kuerzel })),
    [staff],
  )

  // Für die Doppelbelegungs-Warnung (WW-70) alle Termine, auch die, die der
  // Projektleiter-Filter gerade ausblendet: ein Monteur ist auch dann besetzt,
  // wenn sein anderer Einsatz einem anderen Projektleiter gehört.
  const allEntries = useMemo(() => appointmentEntries(projects, appointments), [projects, appointments])
  const [visibleWeekIso, setVisibleWeekIso] = useState<string>('')
  const [visibleStaffIds, setVisibleStaffIds] = useState<string[] | null>(null)
  const [exporting, setExporting] = useState(false)
  const [projektleiterFilter, setProjektleiterFilter] = useState<string | null>(null)


  // Picker-State
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerWrapRef = useRef<HTMLDivElement>(null)

  function vorschlaegeUmschalten() {
    setVorschlaegeZeigen(v => {
      try { window.localStorage.setItem(VORSCHLAEGE_KEY, v ? '0' : '1') } catch { /* egal */ }
      return !v
    })
  }


  // «Serie bis» beim Öffnen eines Serientermins: das echte Ende steht in den
  // Zeilen, nicht im geladenen Kalenderfenster — deshalb die Termine des
  // Projekts holen. Scheitert das, bleibt das Ende aus der gespeicherten Regel.
  const apptIdForSeries = apptForm?.id ?? null
  const apptSeriesId = apptForm?.seriesId ?? null
  const projectIdForSeries = form?.id ?? null
  useEffect(() => {
    if (!apptIdForSeries || !apptSeriesId || !projectIdForSeries) return
    let alive = true
    getProjectAppointments(projectIdForSeries)
      .then(all => {
        if (!alive) return
        const rows = seriesRows(all, apptSeriesId)
        setApptForm(a => {
          if (!a || a.id !== apptIdForSeries) return a
          const end = seriesEnd(rows, a.seriesRule)
          // Hat der Planer schon ein Ende getippt, bleibt seine Eingabe stehen.
          const untouched = a.seriesUntil === a.seriesUntilOriginal
          return {
            ...a,
            seriesUntilOriginal: end,
            seriesUntil: untouched ? end : a.seriesUntil,
            seriesRule: a.seriesRule ?? rows.find(r => r.series_rule)?.series_rule ?? null,
          }
        })
      })
      .catch(() => { /* ohne Liste: Ende aus der gespeicherten Regel */ })
    return () => { alive = false }
  }, [apptIdForSeries, apptSeriesId, projectIdForSeries])

  // Anzeige-Config bewusst NEBEN loadAll und nicht darin: sie ist ein winziger
  // Tenant-Lookup, die Kalenderdaten sind Projekte, ~1000 Tage Termine und die
  // Absenzen. Im gemeinsamen Promise.all hing die Reiterleiste am langsamsten
  // dieser Requests — sichtbar als Ansichten, die es im Mandanten nicht gibt.
  useEffect(() => {
    let alive = true
    loadSchedulingConfig()
      .then(cfg => { if (alive) setSchedulingConfig(cfg) })
      .catch(() => {
        // Fehler darf den Kalender nicht blockieren, aber auch nicht stumm
        // bleiben: ohne Config gelten die System-Defaults (alle Ansichten,
        // keine Sperrstunde), der Planer sähe also klammheimlich einen anderen
        // Plan als der Rest des Mandanten.
        if (alive) showToast('Anzeige-Einstellungen nicht geladen — Standardansicht aktiv.', 'error')
      })
      .finally(() => { if (alive) setConfigPending(false) })
    return () => { alive = false }
  }, [])

  // Erster Aufruf: loadAll (mit Spinner), danach alle 2 s refreshLive.
  useVisibilityPolling(
    ({ background }) => (background ? refreshLive() : loadAll()),
    LIVE_REFRESH_MS,
  )

  // Kundenstamm erst beim ersten Öffnen des Panels — und dann nur einmal.
  useEffect(() => {
    if (!panelOpen || customersLoaded.current) return
    customersLoaded.current = true
    listAllCustomers()
      .then(setCustomers)
      .catch(() => {
        // Erneut versuchen, wenn das Panel das nächste Mal aufgeht: ohne Liste
        // liesse sich einem Einsatz kein Kunde zuordnen.
        customersLoaded.current = false
        showToast('Kundenstamm nicht geladen.', 'error')
      })
  }, [panelOpen])

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
  // Die Checkliste des geöffneten Projekts: Zustand und Laden in useScheduleTasks,
  // Darstellung in ScheduleTasksSection (beide seit Charge M4a).
  const aufgaben = useScheduleTasks(form?.id, panelOpen, showToast)

  // Nächster (ab heute) Termin eines Projekts als Editor-State; ohne künftigen
  // Termin der letzte vergangene, ohne Termine null. «Ab heute» ist
  // isOpenAppointment (Ende, nicht Start) — sonst sprang der Editor mitten in
  // einem laufenden mehrtägigen Einsatz auf den übernächsten Termin.
  function nextAppointment(projectId: string): ApptFormState | null {
    const own = appointments
      .filter(a => a.project_id === projectId)
      .slice()
      .sort((a, b) => (a.start_date + (a.start_time ?? '99'))
        .localeCompare(b.start_date + (b.start_time ?? '99')))
    if (own.length === 0) return null
    const todayIso = toDateStr(new Date())
    return apptToForm(
      own.find(a => isOpenAppointment(a.start_date, a.end_date, todayIso)) ?? own[own.length - 1],
    )
  }

  function selectProject(p: ScheduleProject, appt?: ProjectAppointment) {
    setForm(projectToForm(p))
    // Aus einem aufgezogenen Termin: neuen Termin mit den Zeiten vorbelegen;
    // sonst den geklickten Termin in den Editor laden (oder keinen).
    if (pendingSlot) {
      // Termin-Typ aus der Art der Arbeit des Projekts (WW-67) statt immer «Montage».
      const kind = p.kind === 'project'
        ? suggestAppointmentKind(p, appointments.filter(a => a.project_id === p.id).map(a => a.kind))
        : 'sonstiges'
      setApptForm(slotToApptForm(pendingSlot, kind))
      setPendingSlot(null)
    } else if (appt) {
      setApptForm(apptToForm(appt))
    } else {
      // Projekt ohne konkreten Termin gewählt (Picker): den nächsten Termin in
      // den Editor laden. Sonst bliebe der Termin-Typ (Ausmass/Montage/Service …)
      // unerreichbar, obwohl er Symbol und Badge im Kalender bestimmt.
      setApptForm(nextAppointment(p.id))
    }
    setError(null)
    setPickerSearch('')
    setPickerOpen(false)
    setPanelOpen(true)
  }

  function vorschlagZu(id: string): Vormerkung | undefined {
    return vorschlaege.find(v => `${VORSCHLAG_PREFIX}${v.id}` === id)
  }

  // Klick auf einen Kalenderblock: Entry-ID = Termin-ID → Termin + Projekt auflösen.
  function handleCalendarSelect(entry: ScheduleProject) {
    if (isVorschlag(entry.id)) {
      const v = vorschlagZu(entry.id)
      if (v) setVorschlagOffen(v)
      return
    }
    const project = resolveEntryProject(entry)
    if (!project) return
    selectProject(project, appointments.find(a => a.id === entry.id))
  }

  // Treffer der Suche (WW-69): Kalender auf den Tag, Termin ins Panel — wie ein
  // Klick auf die Kachel, nur ohne sie erst suchen zu müssen.
  const [calendarFocus, setCalendarFocus] = useState<CalendarFocus | null>(null)
  function handleSearchPick(entry: CalendarEntry) {
    if (!entry.start_date) return
    const date = entry.start_date.slice(0, 10)
    setCalendarFocus(prev => ({
      date,
      staffIds: entry.monteur_ids ?? [],
      nonce: (prev?.nonce ?? 0) + 1,
    }))
    handleCalendarSelect(entry)
  }

  // Doppelklick auf einen Kalenderblock: in die Projektmaske springen. Das Panel
  // rechts plant nur Termine — Adresse, Kunde, Kontakte, Dokumente hängen am
  // Projekt und lassen sich nur dort ändern.
  function handleCalendarOpen(entry: ScheduleProject) {
    if (isVorschlag(entry.id)) {
      const v = vorschlagZu(entry.id)
      const r = twPlanung.reservationen.find(x => `${RESERVATION_PREFIX}${x.id}` === entry.id)
      if ((v || r) && onNav) onNav('projects', (v ?? r)!.project_id)
      return
    }
    const project = resolveEntryProject(entry)
    if (project && onNav) onNav('projects', project.id)
  }

  // Entry-ID ist die TERMIN-ID (siehe calendarEntries); interne Einsätze ohne
  // Termin tragen die Projekt-ID. Beide Wege führen auf dasselbe Projekt.
  function resolveEntryProject(entry: ScheduleProject): ScheduleProject | undefined {
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
  // Verschieben eines Vorschlags ändert die Vormerkung, nie einen Termin. Die
  // Equipe wechselt man in der Disposition — eine Plantafel-Zeile ist eine
  // Person, eine Vormerkung gehört einer Equipe.
  async function verschiebeVorschlag(v: Vormerkung, deltaDays: number, startTime?: string | null, monteurIds?: string[]) {
    if (monteurIds !== undefined && JSON.stringify([...monteurIds].sort()) !== JSON.stringify([...(v.equipe?.monteur_ids ?? [])].sort())) {
      showToast('Vorschlag: die Equipe ändert man in der Disposition. Verschoben wird nur der Tag.', 'info')
    }
    const felder = vorschlagVerschoben(v, deltaDays, startTime)
    const vorher = vorschlaege
    setVorschlaege(list => list.map(x => (x.id === v.id ? { ...x, ...felder } : x)))
    try {
      // end_datum zieht der Server selbst mit — gesendet wird nur, was der Nutzer bewegt hat.
      await patchVormerkung(v.id, { datum: felder.datum, start_time: felder.start_time, end_time: felder.end_time })
    } catch (e) {
      setVorschlaege(vorher)
      showToast(e instanceof Error ? e.message : 'Vorschlag konnte nicht verschoben werden.', 'error')
    }
  }

  async function handleReschedule(
    id: string, deltaDays: number, startTime?: string | null, monteurIds?: string[], overlapOk = false,
  ) {
    if (isVorschlag(id)) {
      const v = vorschlagZu(id)
      if (v) await verschiebeVorschlag(v, deltaDays, startTime, monteurIds)
      return
    }
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

    // Doppelbelegung (WW-70): Verschieben in einen besetzten Slot fragt wie das
    // Panel. Der Chip bleibt bis zur Antwort, wo er war.
    if (!overlapOk) {
      const team = teamChanged
        ? monteurIds!
        : ((appt.monteur_ids?.length ? appt.monteur_ids : projects.find(p => p.id === appt.project_id)?.monteur_ids) ?? [])
      const ziel = { start_date: newStartDate, end_date: newEndDate,
        start_time: newStartTime, end_time: newEndTime, staffIds: team }
      const hits = findStaffOverlaps(allEntries, ziel, staffLite, [appt.id])
      const warnung = [hits.length ? formatStaffOverlaps(hits) : '', reservationWarnung(ziel)].filter(Boolean).join(' ')
      if (warnung) {
        setAbsencePrompt({
          kind: 'overlap',
          message: warnung,
          onConfirm: () => void handleReschedule(id, deltaDays, startTime, monteurIds, true),
        })
        return
      }
    }

    const optimistic: ProjectAppointment = {
      ...appt,
      start_date: newStartDate, end_date: newEndDate,
      start_time: newStartTime, end_time: newEndTime,
      monteur_ids: teamChanged ? monteurIds! : appt.monteur_ids,
    }
    beginWrite()
    setAppointments(prev => prev.map(a => a.id === id ? optimistic : a))
    // Partial-PATCH: '' = Feld explizit löschen (ganztägig), fehlend = unverändert.
    const payload: Partial<ProjectAppointment> = { start_date: newStartDate }
    if (appt.end_date) payload.end_date = newEndDate ?? ''
    if (startTime !== undefined) {
      payload.start_time = newStartTime ?? ''
      payload.end_time = newEndTime ?? ''
    }
    if (teamChanged) payload.monteur_ids = monteurIds
    const revert = () => setAppointments(prev => prev.map(a => a.id === id ? appt : a))
    try {
      await updateAppointment(id, payload)
    } catch (e) {
      const conflict = absenceConflictMessage(e)
      if (!conflict) {
        revert()
        showToast('Verschieben fehlgeschlagen.', 'error')
        return
      }
      // Die optimistische Anzeige bleibt vorerst stehen: der Chip liegt schon
      // dort, wo der Planer ihn hingezogen hat, und die Rückfrage entscheidet
      // nur noch, ob es dabei bleibt. Beim Abbrechen springt er zurück.
      // Solange die Rückfrage offen ist, pausiert die Live-Aktualisierung
      // (siehe refreshLive), während des zweiten Schreibens ebenso.
      setAbsencePrompt({
        message: conflict,
        onConfirm: async () => {
          beginWrite()
          try {
            await updateAppointment(id, { ...payload, ignore_absence_conflicts: true })
          } catch {
            revert()
            showToast('Verschieben fehlgeschlagen.', 'error')
          } finally {
            endWrite()
          }
        },
        onCancel: () => { verwerfeLaufendeAbrufe(); revert() },
      })
    } finally {
      endWrite()
    }
  }

  // Rückfrage «Projekt-Team geändert» — wie in der Projektmaske ein
  // Promise-Tor: `handleSave` legt die Frage hin und wartet, der Dialog löst
  // sie auf. Antworten: 'keep' schreibt den bestehenden Terminen das BISHERIGE
  // Projekt-Team fest, 'apply' lässt sie das neue übernehmen, 'cancel' bricht
  // das Speichern ab.
  const [teamQuestion, setTeamQuestion] = useState<{ count: number } | null>(null)
  const teamAnswer = useRef<((answer: 'keep' | 'apply' | 'cancel') => void) | null>(null)

  function answerTeamQuestion(answer: 'keep' | 'apply' | 'cancel') {
    setTeamQuestion(null)
    teamAnswer.current?.(answer)
    teamAnswer.current = null
  }

  // Doppelbelegungs-Text für den Termin im Panel, oder null. Ein bestehender
  // Termin wird nur geprüft, wenn sich Tag, Zeit oder Team geändert haben — sonst
  // fragte jedes Umbenennen eines längst überschneidenden Termins von Neuem.
  function draftOverlapMessage(): string | null {
    if (!form || !apptForm?.startDate) return null
    const team = effectiveTeamIds(apptForm, form.monteurIds)
    const slot: PlannedSlot = {
      start_date: apptForm.startDate,
      end_date: apptForm.endDate || null,
      start_time: apptForm.startTime || null,
      end_time: apptForm.endTime || null,
      staffIds: team,
    }
    const original = apptForm.id ? appointments.find(a => a.id === apptForm.id) : undefined
    if (original) {
      const before = (original.monteur_ids?.length ? original.monteur_ids : projects.find(p => p.id === original.project_id)?.monteur_ids) ?? []
      const same = original.start_date.slice(0, 10) === slot.start_date
        && (original.end_date?.slice(0, 10) || original.start_date.slice(0, 10)) === (slot.end_date || slot.start_date)
        && (original.start_time?.slice(0, 5) ?? null) === slot.start_time
        && (original.end_time?.slice(0, 5) ?? null) === slot.end_time
        && !teamsDiffer(before, team)
      if (same) return null
    }
    // Serien-Änderung: die Geschwister wandern mit und zählen nicht als Konflikt.
    const exclude = new Set<string>(apptForm.id ? [apptForm.id] : [])
    if (apptForm.seriesId && apptForm.scope !== 'single') {
      for (const a of appointments) if (a.series_id === apptForm.seriesId) exclude.add(a.id)
    }
    const hits = findStaffOverlaps(allEntries, slot, staffLite, exclude)
    return [hits.length ? formatStaffOverlaps(hits) : '', reservationWarnung(slot)].filter(Boolean).join(' ') || null
  }

  /**
   * `override`/`savedProjectId` setzt nur die Absenz-Rückfrage (siehe unten):
   * `override` schickt denselben Request mit gesetzter Übersteuerung, und
   * `savedProjectId` überspringt den Projekt-Teil, wenn der im ersten Anlauf
   * schon durchgelaufen ist — sonst entstünde beim Neuanlegen ein zweites
   * Projekt. Der Speichern-Knopf ruft die Funktion ohne Argumente auf.
   */
  async function handleSave(override = false, savedProjectId?: string, overlapOk = false) {
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
      // Kundenprojekt-Termine brauchen einen Monteur — dieselbe Regel wie in der
      // Projektmaske (validateDraftTeams). Interne Einsätze (Teamsitzung,
      // Blocker …) bleiben frei: dort ist «noch niemand» ein gültiger Stand.
      if (form.kind === 'project' && apptForm.startDate
        && effectiveTeamIds(apptForm, form.monteurIds).length === 0) {
        setError(NO_MONTEUR_ERROR); return
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
      // Bestehende Serie: eine Art Serien-Änderung pro Speichern (Server-Regel
      // `one_series_change_at_a_time`) — die Rückmeldung kommt hier sofort.
      if (apptForm.id && apptForm.seriesId) {
        const err = seriesChangeError({
          scope: apptForm.scope,
          dateChanged: apptForm.startDate !== apptForm.originalStartDate,
          untilChanged: apptForm.scope !== 'single' && !apptForm.seriesRhythm
            && !!apptForm.seriesUntil && apptForm.seriesUntil !== apptForm.seriesUntilOriginal,
          rhythmChanged: !!apptForm.seriesRhythm,
        })
        if (err) { setError(err); return }
      }
    }
    // Doppelbelegung (WW-70): vor jedem Schreiben fragen, wie bei Ferien. Nach
    // einer Absenz-Rückfrage (override) ist die Frage schon beantwortet.
    if (!override && !overlapOk && apptForm?.startDate) {
      const message = draftOverlapMessage()
      if (message) {
        setAbsencePrompt({ kind: 'overlap', message, onConfirm: () => void handleSave(false, undefined, true) })
        return
      }
    }
    setSaving(true)
    beginWrite()
    const isInternal = form.kind !== 'project'
    let savedMsg = form.id ? 'Eintrag aktualisiert.' : 'Eintrag erstellt.'
    let targetId = savedProjectId
    try {
      if (!savedProjectId) {
        // Ein Termin ohne eigenes Team erbt das Projekt-Team live. Ein Wechsel
        // besetzt sonst still jeden bereits geplanten Termin ohne eigenes Team
        // um — auch vergangene. Der gerade geöffnete Termin ist ausgenommen:
        // dort ist die Änderung ja gewollt.
        const previousTeam = projects.find(p => p.id === form.id)?.monteur_ids ?? []
        const followers = form.id && previousTeam.length > 0 && teamsDiffer(previousTeam, form.monteurIds)
          ? appointments.filter(a =>
              a.project_id === form.id && !a.monteur_ids?.length && a.id !== apptForm?.id)
          : []
        if (followers.length > 0) {
          const answer = await new Promise<'keep' | 'apply' | 'cancel'>(resolve => {
            teamAnswer.current = resolve
            setTeamQuestion({ count: followers.length })
          })
          if (answer === 'cancel') return
          if (answer === 'apply' && form.monteurIds.length === 0 && form.kind === 'project') {
            setError(teamlessFollowersError(followers.length)); return
          }
          if (answer === 'keep') {
            // VOR dem Projekt-Write: danach sähe der Termin-Änderungs-Push das
            // schon neue Projekt-Team als Vorher-Zustand und meldete jedem
            // Monteur eine Änderung, die es gar nicht gibt
            // (services/project_change_push_service.py::diff_appointment_change).
            // `override` muss mit: sonst fragt der zweite Anlauf nach einer
            // bestätigten Absenz-Übersteuerung genau hier wieder nach.
            for (const a of followers) {
              await updateAppointment(a.id, {
                monteur_ids: previousTeam,
                ...(override ? { ignore_absence_conflicts: true } : {}),
              })
            }
          }
        }

        // Projekt-Stammdaten OHNE Terminfelder — Termine laufen über die
        // appointment-Endpunkte (der Server spiegelt den Ersttermin selbst).
        const saved = await upsertProject({
          id: form.id || undefined,
          name: form.name,
          customer_id: isInternal ? null : (form.customerId || null),
          ...(override ? { ignore_absence_conflicts: true } : {}),
          ...({
            kind: form.kind,
            // Bei Teamsitzung, Lager, «Büro» … gibt es keinen Projektleiter:
            // ein alter Eintrag (früher trug sich der Erfasser selbst ein) wird
            // beim Speichern geleert, auch wenn das Feld gar nicht mehr zu sehen ist.
            projektleiter_id: leerbar(
              kindHasProjektleiter(form.kind) ? form.projektleiterId : '', !!form.id),
            monteur_ids: form.monteurIds,
            bemerkung: leerbar(form.bemerkung, !!form.id),
          } as Record<string, unknown>),
        }) as unknown as { project?: { id?: string } } & { id?: string }
        targetId = form.id || saved.project?.id || saved.id
      }
      if (apptForm && apptForm.startDate && targetId) {
        // Payload wie im Detail-Editor: '' leert ein Feld explizit (Partial-PATCH
        // kann mit null nichts löschen), monteur_ids [] gibt das Projekt-Team
        // zurück, und die Bezeichnung geht nur bei kind 'sonstiges' mit.
        const payload = { ...draftPayload(apptForm), ...(override ? { ignore_absence_conflicts: true } : {}) }
        if (apptForm.id) {
          const scope: AppointmentScope = apptForm.seriesId ? apptForm.scope : 'single'
          const rhythm = scope === 'following' ? repeatToRecurrence(apptForm.seriesRhythm, apptForm.seriesUntil) : null
          const untilChanged = scope !== 'single' && !!apptForm.seriesUntil
            && apptForm.seriesUntil !== apptForm.seriesUntilOriginal
          // Ein neuer Rhythmus nimmt «Serie bis» als sein Ende mit — dann ist
          // das kein eigenes «Ende ändern».
          const extras: SeriesExtras = rhythm
            ? { recurrence: rhythm }
            : untilChanged ? { series_until: apptForm.seriesUntil } : {}
          const res = await updateAppointment(apptForm.id, payload, scope, extras)
          if (scope !== 'single') savedMsg = seriesSavedMessage(res)
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
    } catch (e) {
      const conflict = absenceConflictMessage(e)
      if (conflict) {
        setAbsencePrompt({
          message: conflict,
          onConfirm: () => void handleSave(true, targetId || undefined, true),
        })
        return
      }
      // Serien-Änderungen, die der Server begründet ablehnt (Rapport an einem
      // Termin, der beim Verkürzen wegfiele; Rhythmus unbekannt; zu lang):
      // seinen Text zeigen statt eines blanken «fehlgeschlagen».
      if (e instanceof ApiError && (e.code === SERIES_ACTIVITY_CODE || e.status === 400) && e.message) {
        setError(e.message)
        return
      }
      setError('Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
      endWrite()
    }
  }

  function handleNewInternal(kind: ProjectKind) {
    setForm(emptyInternalForm(kind, blockerCategories))
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
    if (a.series_id) {
      setSeriesDeleteScope('single')
      setSeriesDeletePrompt(a)
    } else void handleDeleteAppt(a)
  }

  async function handleDeleteAppt(a: ProjectAppointment, scope: AppointmentScope = 'single') {
    setSeriesDeletePrompt(null)
    setSaving(true)
    beginWrite()
    try {
      await deleteAppointment(a.id, scope)
      setAppointments(prev => {
        if (!a.series_id || scope === 'single') return prev.filter(x => x.id !== a.id)
        if (scope === 'series') return prev.filter(x => x.series_id !== a.series_id)
        return prev.filter(x => x.series_id !== a.series_id || x.start_date < a.start_date)
      })
      if (apptForm?.id === a.id) setApptForm(null)
      showToast(
        scope === 'series' ? 'Serie entfernt.'
          : scope === 'following' ? 'Termin und alle folgenden entfernt.' : 'Termin entfernt.',
        'success',
      )
    } catch {
      showToast('Entfernen fehlgeschlagen.', 'error')
    } finally {
      setSaving(false)
      endWrite()
    }
  }

  async function handleClearSchedule() {
    if (!form || !form.id) return
    setSaving(true)
    beginWrite()
    try {
      // Die Termine des Projekts beim Server holen statt aus der Kalenderliste:
      // die ist in der ersten Sekunde nach dem Öffnen nur das nahe Fenster
      // (−14 … +100 Tage), und «Termine entfernen» liesse dann alles Spätere
      // still stehen. Gelöscht wird weiter, was der Kalender zeigt — das volle
      // Fenster; was davor liegt, ist Geschichte und war nie gemeint.
      const todayIso = toDateStr(new Date())
      const from = shiftISO(todayIso, -APPT_WINDOW_BACK_DAYS)
      const to = shiftISO(todayIso, APPT_WINDOW_AHEAD_DAYS)
      const own = (await getProjectAppointments(form.id)).filter(a => overlapsWindow(a, from, to))
      for (const a of own) {
        await deleteAppointment(a.id)
      }
      showToast('Termine entfernt.', 'success')
      setApptForm(null)
      await loadAll()
    } catch {
      showToast('Entfernen fehlgeschlagen.', 'error')
    } finally {
      setSaving(false)
      endWrite()
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
  const projektleiterFilterOptions = useMemo(
    () => projektleiterOptions
      .map(s => ({ id: s.id, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [projektleiterOptions],
  )

  // Interne Einsätze ohne Projektleiter-Bezug (Teamsitzung, Lager, «Büro» …)
  // bleiben im Filter stehen: sie gehören keinem Portfolio, zeigen aber, dass
  // der Monteur an dem Tag belegt ist. Ausgeblendet sah der Projektleiter einen
  // freien Monteur, den er gar nicht hat.
  const filteredByPl = useMemo(
    () => projektleiterFilter
      ? projects.filter(p => !kindHasProjektleiter(p.kind) || p.projektleiter_id === projektleiterFilter)
      : projects,
    [projects, projektleiterFilter],
  )

  // Kalender-Einträge: EIN Eintrag je Termin. id = Termin-ID (eindeutige Keys/
  // Lanes/Drag), Terminfelder überlagern das Projekt; Team = Termin-Team,
  // Fallback Projekt-Team. Badge nur bei Nicht-Standard-Typ (Ausmass/Service/…),
  // damit der Normalfall (Montage) ruhig bleibt.
  const calendarEntries = useMemo<CalendarEntry[]>(() => {
    const projById = new Map(filteredByPl.map(p => [p.id, p]))
    const entries: CalendarEntry[] = appointmentEntries(filteredByPl, appointments)
    // Vorschläge (Phase 2b): eigene Einträge mit VORSCHLAG_PREFIX — gestrichelt
    // (pillClass), Klick und Verschieben fangen die Handler oben ab.
    if (vorschlaegeZeigen) {
      for (const v of vorschlaege) {
        const p = projById.get(v.project_id)
        if (!p) continue
        entries.push({
          ...p,
          id: `${VORSCHLAG_PREFIX}${v.id}`,
          start_date: v.datum,
          end_date: v.end_datum ?? v.datum,
          start_time: v.start_time,
          end_time: v.end_time,
          monteur_ids: v.equipe?.monteur_ids ?? [],
          termin_badge: `Vorschlag · ${VORSCHLAG_STATUS[v.status]}`,
          termin_kind: undefined,
        })
      }
    }
    if (twPlanung.zeigen) entries.push(...reservationEntries(projById, twPlanung.reservationen))
    return entries
  }, [filteredByPl, appointments, vorschlaege, vorschlaegeZeigen, twPlanung.zeigen, twPlanung.reservationen])


  const scheduledProjectIds = useMemo(
    () => new Set(appointments.map(a => a.project_id)),
    [appointments],
  )

  // Picker-Suche: Projektnummer + Name + Kundenname (siehe projectPicker.ts).
  const filteredProjects = useMemo(
    () => filterPickerProjects(projects, pickerSearch),
    [projects, pickerSearch],
  )

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

  // Welche Pillen das Projekt-Team (Montage) bzw. dieser Termin braucht, und wem
  // was fehlt. Ein Ausmass braucht nur die «immer nötig»-Pillen (Ausmessen).
  const pillenJeStaff = useMemo(() => pillenJeMitarbeiter(staffPillen), [staffPillen])
  const skillLabel = useMemo(() => new Map(skillKatalog.map(s => [s.id, s])), [skillKatalog])
  const projektPillenIds = form && showApptExtras ? (projektPillen.get(form.id) ?? []) : []
  const teamBraucht = showApptExtras ? anforderung('montage', projektPillenIds, skillKatalog) : []
  const terminBraucht = showApptExtras && apptForm ? anforderung(apptForm.kind, projektPillenIds, skillKatalog) : []

  function skillChip(staffId: string, braucht: string[]): { cls: string; title?: string; marke: string } {
    if (braucht.length === 0) return { cls: '', marke: '' }
    const fehlt = fehlende(staffId, braucht, pillenJeStaff)
    if (fehlt.length === 0) return { cls: ' skill-ok', title: 'hat alle nötigen Skills', marke: ' ✓' }
    return { cls: ' skill-fehlt', title: `fehlt: ${fehlt.map(k => skillLabel.get(k)?.label ?? '?').join(', ')}`, marke: '' }
  }

  function brauchtZeile(braucht: string[]) {
    if (braucht.length === 0) return null
    return (
      <div className="project-schedule-skills">
        <span>Braucht:</span>
        {braucht.map(k => skillLabel.get(k) && <SkillPill key={k} skill={skillLabel.get(k)!} />)}
      </div>
    )
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Einsatzplanung</div>
          <div className="admin-page-subtitle">
            {calendarEntries.length} geplante Einsätze · {filteredByPl.filter(p => !scheduledProjectIds.has(p.id)).length} ohne Termin
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ScheduleSearch entries={calendarEntries} todayIso={todayISO()} onPick={handleSearchPick} />
          <ProjektleiterFilter
            options={projektleiterFilterOptions}
            value={projektleiterFilter}
            onChange={setProjektleiterFilter}
          />
          {terminwahl && (
            <TerminwahlLeiste planung={twPlanung} onOpenProject={onNav ? id => onNav('projects', id) : undefined}
              projektName={id => projects.find(p => p.id === id)?.name ?? 'Projekt'} />
          )}
          {hagelVorschlaege && (
            <button
              className="admin-btn admin-btn-secondary"
              onClick={vorschlaegeUmschalten}
              aria-pressed={vorschlaegeZeigen}
              title="Vorgemerkte Hagel-Einsätze (noch keine Termine) gestrichelt anzeigen"
            >
              Vorschläge {vorschlaegeZeigen ? 'ausblenden' : 'zeigen'}{vorschlaege.length ? ` (${vorschlaege.length})` : ''}
            </button>
          )}
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
            configPending={configPending && !schedulingConfig}
            absences={absences}
            focus={calendarFocus}
            einsatzStaende={einsatzStaende}
          />
        </div>

        {panelOpen && (
        <aside className="project-schedule-panel">
          <div className="project-schedule-panel-header">
            <div className="project-schedule-panel-title">
              {pendingSlot ? 'Neuer Termin' : form ? 'Einsatz planen' : 'Projekt wählen'}
            </div>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={closePanel}>
              Schliessen
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
                          <div className="project-schedule-picker-name">{pickerLabel(p)}</div>
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
                        ? internalFormTitle(nextKind, blockerCategories)
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

                {/* Blocker-Kategorien (Konfiguration → Einsatzplanung): setzen den
                    Titel per Auswahl. Das Titelfeld bleibt darunter stehen — eine
                    Kategorie kann man ergänzen («Wartet auf Material – Storen Muster»),
                    und wer eine Bezeichnung ausserhalb der Liste braucht, tippt sie. */}
                {form.kind === 'blocker' && blockerCategories.length > 0 && (
                  <label className="project-schedule-field">
                    <span>Kategorie</span>
                    <select
                      className="admin-input"
                      value={blockerCategories.includes(form.name) ? form.name : ''}
                      onChange={e => setForm(f => f && ({ ...f, name: e.target.value }))}
                    >
                      <option value="">— Kategorie wählen —</option>
                      {blockerCategories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                )}

                {form.kind !== 'project' && (
                  <label className="project-schedule-field">
                    <span>Titel</span>
                    <input
                      className="admin-input"
                      value={form.name}
                      onChange={e => setForm(f => f && ({ ...f, name: e.target.value }))}
                      placeholder={form.kind === 'blocker' && blockerCategories.length > 0
                        ? 'Kategorie wählen oder eigenen Titel eingeben'
                        : PROJECT_KIND_LABELS[form.kind]}
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

                {kindHasProjektleiter(form.kind) && (
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
                )}

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
                      const sk = skillChip(s.id, teamBraucht)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`project-schedule-chip${active ? ' active' : ''}${lead ? ' lead' : ''}${sk.cls}`}
                          onClick={() => toggleMonteur(s.id)}
                          title={[lead ? 'Lead-Monteur (zuerst gewählt)' : '', sk.title ?? ''].filter(Boolean).join(' · ') || undefined}
                        >
                          {s.name}{sk.marke}
                        </button>
                      )
                    })}
                  </div>
                  {brauchtZeile(teamBraucht)}
                  {form.monteurIds.length > 1 && (
                    <div className="project-schedule-lead-hint">
                      Rot = Lead-Monteur (der zuerst gewählte). Abwählen und neu wählen ändert ihn.
                    </div>
                  )}
                </div>

                {/* ── Termine ──────────────────────────────────────── */}
                <div className="project-schedule-divider" />

                {showApptExtras && (
                  <ScheduleApptList
                    appointments={panelAppointments}
                    activeId={apptForm?.id}
                    editorOffen={apptForm !== null}
                    onNew={() => {
                      // Vorbelegt aus der Art der Arbeit des Projekts (WW-67).
                      const project = projects.find(p => p.id === form.id)
                      setApptForm(newApptForm(suggestAppointmentKind(project, panelAppointments.map(a => a.kind))))
                      setError(null)
                    }}
                    onSelect={a => { setApptForm(apptToForm(a)); setError(null) }}
                    onDelete={requestDeleteAppt}
                  />
                )}

                {apptForm && (
                  <ScheduleApptEditor
                    apptForm={apptForm}
                    setApptForm={setApptForm}
                    showApptExtras={showApptExtras}
                    monteurOptions={monteurOptions}
                    terminBraucht={terminBraucht}
                    skillChip={skillChip}
                    brauchtZeile={brauchtZeile}
                    toggleApptMonteur={toggleApptMonteur}
                  />
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

                {/* ── Aufgaben (Checkliste) — ScheduleTasksSection.tsx ── */}
                <ScheduleTasksSection projectId={form.id} aufgaben={aufgaben} />

                {error && <div className="project-schedule-error">{error}</div>}

                <div className="project-schedule-actions">
                  <button
                    className="admin-btn admin-btn-primary"
                    onClick={() => void handleSave()}
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

      {teamQuestion && (
        <TeamFrageDialog count={teamQuestion.count} onAnswer={answerTeamQuestion} />
      )}

      {/* Reichweite wie beim Bearbeiten — Vorgabe «nur dieser» (ScheduleDialogs.tsx). */}
      {seriesDeletePrompt && (
        <SerienLoeschenDialog
          appt={seriesDeletePrompt}
          scope={seriesDeleteScope}
          setScope={setSeriesDeleteScope}
          busy={saving}
          onConfirm={() => void handleDeleteAppt(seriesDeletePrompt, seriesDeleteScope)}
          onCancel={() => setSeriesDeletePrompt(null)}
        />
      )}

      {/* Absenz- bzw. Doppelbelegungs-Rückfrage (ScheduleDialogs.tsx). */}
      {absencePrompt && (
        <AbsenzRueckfrageDialog
          prompt={absencePrompt}
          onConfirm={() => {
            const { onConfirm } = absencePrompt
            setAbsencePrompt(null)
            onConfirm()
          }}
          onCancel={() => {
            absencePrompt.onCancel?.()
            setAbsencePrompt(null)
          }}
        />
      )}

      {vorschlagOffen && (
        <VorschlagPanel
          v={vorschlagOffen}
          onClose={() => setVorschlagOffen(null)}
          onGeaendert={() => { void ladeVorschlaege(); void loadAll() }}
          onFehler={t => showToast(t, 'error')}
          onErfolg={t => showToast(t, 'success')}
          onProjekt={onNav ? pid => onNav('projects', pid) : undefined}
        />
      )}
      <ToastHost toast={toast} />
    </div>
  )
}

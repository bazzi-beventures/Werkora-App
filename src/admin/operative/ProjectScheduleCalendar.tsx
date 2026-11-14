import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { ScheduleProject } from '../../api/admin/projects'
import type { ScheduleAbsence } from '../../api/admin/scheduling'
import { SCHEDULING_VIEWS, type SchedulingConfig, type SchedulingViewKey } from '../../api/admin'
import { useIsMobile } from '../useIsMobile'
import { getSwissHolidays, getWeekDays, toDateStr, diffDays, addDays, kwLabel, parseDateStr } from '../utils/calendarHelpers'
import { WEEK_ZOOM_LEVELS, WEEK_ZOOM_LABELS, WEEK_ZOOM_DEFAULT } from '../utils/weekGrid'
import { GANTT_DAY_CAPACITY_FALLBACK_H as DAY_CAPACITY_FALLBACK_H, GANTT_SPANS, GANTT_SPAN_DEFAULT, GANTT_SPAN_LABELS, GANTT_ZOOM_DEFAULT, GANTT_ZOOM_LABELS, GANTT_ZOOM_LEVELS, ganttDays, ganttStepStart } from '../utils/ganttGrid'
import ProjectScheduleGantt from './ProjectScheduleGantt'
import { staffShortLabel, scheduledDayIsoSet, weekendOnlyEntries, type CalendarEntry, type StaffLite } from './scheduleShared'
import { parseViewDate, readScheduleView, writeScheduleView } from './scheduleViewState'
import MiniMonthPicker from './MiniMonthPicker'
import type { EinsatzStaende } from './useEinsatzStaende'
import { CalendarLegend } from './scheduleCalendarParts'
import { MonthView } from './ScheduleMonthView'
import { WeekView } from './ScheduleWeekView'
import { PlantafelView } from './SchedulePlantafelView'
import { AgendaView } from './ScheduleAgendaView'

// Nachgeladen statt statisch importiert — und das ist keine Feinoptimierung:
// die Kartenansicht zieht maplibre-gl mit, gebaut 250 KB gzip plus WebGL. Ein
// statischer Import legte das in das gemeinsame Bundle, also auch auf das
// Handy jedes Monteurs, der nie eine Karte öffnet.
const ProjectScheduleMap = lazy(() => import('./ProjectScheduleMap'))

export type { CalendarEntry }

interface Props {
  projects: CalendarEntry[]
  staff: StaffLite[]
  loading: boolean
  canton?: string
  onSelect: (p: ScheduleProject) => void
  // Doppelklick auf einen Einsatz: springt in die Projektmaske. Das Panel rechts
  // plant nur Termine — Adresse, Kunde, Kontakte usw. lassen sich nur dort ändern.
  // Fehlt der Handler (z.B. ohne Navigation im Test), bleibt es beim Einfachklick.
  onOpenProject?: (p: ScheduleProject) => void
  // Verschiebt einen Einsatz im Kalender. deltaDays = Tagesversatz; startTime
  // steuert die Uhrzeit: undefined = Zeit beibehalten (Monat / Ganztägig-Strip),
  // 'HH:MM' = neue Startzeit (Drop ins Zeitraster), null = Zeit löschen (ganztägig).
  // monteurIds = neues Termin-Team (Plantafel: Drop in andere Monteur-Zeile),
  // undefined = Team unverändert.
  onReschedule: (id: string, deltaDays: number, startTime?: string | null, monteurIds?: string[]) => Promise<void> | void
  // Neuer Termin per Aufziehen im Wochen-Zeitraster. monteurId ist in der
  // Mitarbeiteransicht der fokussierte Mitarbeiter (vorausgewählt), sonst null.
  onCreateSlot?: (dateISO: string, startTime: string, endTime: string, monteurId: string | null) => void
  // Meldet die aktuell sichtbare Kalenderwoche (Mo, ISO-Datum) hoch — für PDF-Export.
  onVisibleWeekChange?: (mondayIso: string) => void
  // Meldet die aktuell im Filter aktiven Staff-IDs hoch (alle ohne Hide-Flag).
  // Wenn null gemeldet wird, ist kein Filter aktiv (Default = alle Monteure).
  onVisibleStaffChange?: (visibleIds: string[] | null) => void
  // Tenant-Anzeige-Config: Einsatz-Art-Farben + optionale Kachel-Felder.
  schedulingConfig?: SchedulingConfig
  // Die Config ist noch unterwegs. Ohne sie gilt «fehlender Key = Ansicht an» —
  // die Reiterleiste zeigte also alle sechs Ansichten und blendete die
  // abgeschalteten erst beim Eintreffen aus. Solange dieses Flag steht, bleibt
  // die Leiste stattdessen leer und der Inhalt im Ladezustand: lieber kurz
  // nichts als kurz eine Ansicht, die es im Mandanten nicht gibt.
  configPending?: boolean
  // Genehmigte Absenzen im geladenen Fenster. Die Plantafel schraffiert damit
  // die Zellen der Abwesenden — der Konflikt ist so sichtbar, BEVOR jemand
  // hineinzieht; der Server lehnt danach ohnehin ab (mit Rückfrage).
  absences?: ScheduleAbsence[]
  // Sprung von aussen (Suche, WW-69): auf diesen Tag, und das Team des Termins
  // sichtbar machen. `nonce` unterscheidet zwei Sprünge auf denselben Tag.
  focus?: CalendarFocus | null
  // Stand der Kundeneinsätze von heute (Servicebegleitung, Unterwegs-Meldung) —
  // Punkt an der Kachel in der Plantafel. null = Werkzeug aus.
  einsatzStaende?: EinsatzStaende | null
}

export interface CalendarFocus {
  date: string
  staffIds: string[]
  nonce: number
}

// ─── Main Component ───────────────────────────────────────────────────────────

// Gewählte Zoom-Stufe der Zeitraster. Reine Anzeige-Vorliebe pro Browser —
// bewusst localStorage statt Tenant-Config, weil sie vom Bildschirm abhängt.
// Wochenraster (Zeilenhöhe) und Tagesplan (Stundenbreite) haben eigene Stufen
// und darum eigene Keys. Beide müssen in storageMigrations.isKnownKey stehen,
// sonst räumt der Schema-Wechsel sie als Legacy-Müll weg.
const ZOOM_KEY = 'schedule-week-zoom'
const GANTT_ZOOM_KEY = 'schedule-gantt-zoom'
// Sichtbarer Zeitraum des Tagesplans (1 / 3 / 5 / 6 Tage) — gleiche Logik wie der
// Zoom: reine Anzeige-Vorliebe pro Browser, defensiv geparst.
const GANTT_SPAN_KEY = 'schedule-gantt-span'

function readStoredLevel(key: string, count: number, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key)
    const n = raw === null ? NaN : parseInt(raw, 10)
    return Number.isInteger(n) && n >= 0 && n < count ? n : fallback
  } catch {
    return fallback
  }
}

function readZoom(): number {
  return readStoredLevel(ZOOM_KEY, WEEK_ZOOM_LEVELS.length, WEEK_ZOOM_DEFAULT)
}

function readGanttZoom(): number {
  return readStoredLevel(GANTT_ZOOM_KEY, GANTT_ZOOM_LEVELS.length, GANTT_ZOOM_DEFAULT)
}

// Sa/So ausblenden (WW-56), pro Browser gemerkt.
const HIDE_WEEKEND_KEY = 'schedule-hide-weekend'

function readHideWeekend(): boolean {
  try {
    return window.localStorage.getItem(HIDE_WEEKEND_KEY) === '1'
  } catch {
    return false
  }
}

function readGanttSpan(): number {
  try {
    const raw = window.localStorage.getItem(GANTT_SPAN_KEY)
    const n = raw === null ? NaN : parseInt(raw, 10)
    return (GANTT_SPANS as readonly number[]).includes(n) ? n : GANTT_SPAN_DEFAULT
  } catch {
    return GANTT_SPAN_DEFAULT
  }
}

export default function ProjectScheduleCalendar({
  projects, staff, loading, canton = 'ZH', onSelect, onOpenProject, onReschedule, onCreateSlot,
  onVisibleWeekChange, onVisibleStaffChange, schedulingConfig, configPending = false, absences,
  focus, einsatzStaende = null,
}: Props) {
  // Gemerkter Ansichtszustand der Sitzung (scheduleViewState.ts): ein Ausflug in
  // die Projektmaske soll nicht wieder bei «Monat / heute» enden.
  const [saved] = useState(readScheduleView)
  const [viewMode, setViewMode] = useState<SchedulingViewKey>(saved.view ?? 'month')
  const isMobile = useIsMobile()
  const fields = schedulingConfig?.fields
  const greyAfter = schedulingConfig?.grey_after
  const greyUntil = schedulingConfig?.grey_until
  // Tenant-schaltbare Ansichten: fehlender Key = an (Default). Liegt die aktuell
  // gewählte Ansicht ausserhalb der erlaubten, greift die erste erlaubte —
  // abgeleitet statt per Effect, damit auch die async nachladende Config sofort wirkt.
  const viewEnabled = (k: SchedulingViewKey) => schedulingConfig?.views?.[k] !== false
  const availableViews = SCHEDULING_VIEWS.filter(v => viewEnabled(v.key))
  // Ersatz-Reihenfolge aus einem Sprung von aussen (scheduleViewState.viewFallback);
  // nur bekannte Ansichten — ein fehlender views-Key gälte sonst als «an».
  const [viewFallback] = useState<SchedulingViewKey[]>(() =>
    (Array.isArray(saved.viewFallback) ? saved.viewFallback : [])
      .filter(k => SCHEDULING_VIEWS.some(v => v.key === k)))
  const view: SchedulingViewKey = viewEnabled(viewMode)
    ? viewMode
    : (viewFallback.find(viewEnabled) ?? availableViews[0]?.key ?? 'month')
  // Solange die Config fehlt, steht `view` nur auf dem Default und nicht auf der
  // Ansicht, die der Mandant tatsächlich zuerst sieht — alles, was daran hängt
  // (Reiter, Filterzeilen, Zoom, Inhalt), wartet deshalb wie beim Datenladen.
  const busy = loading || configPending
  // Einsatz-Art-Farben als scoped CSS-Variablen (--kind-*) auf dem Kalender-Root.
  const kindColorVars: React.CSSProperties = {}
  for (const [k, v] of Object.entries(schedulingConfig?.colors || {})) {
    ;(kindColorVars as Record<string, string>)[`--kind-${k}`] = v
  }
  const [currentDate, setCurrentDate] = useState(() => parseViewDate(saved.date) ?? new Date())
  const [zoom, setZoom] = useState(readZoom)
  const [ganttZoom, setGanttZoom] = useState(readGanttZoom)
  // Sichtbare Tage im Tagesplan (1 / 3 / 5 / 6), pro Browser gemerkt.
  const [ganttSpan, setGanttSpan] = useState<number>(readGanttSpan)
  const [hiddenStaff, setHiddenStaff] = useState<Set<string>>(() => new Set(saved.hiddenStaff ?? []))
  // Sa/So in Woche, Mitarbeiter, Plantafel und Tagesplan ausblenden (WW-56) —
  // Vorliebe pro Browser wie Zoom und Zeitraum, nicht pro Sitzung. Ein Haken für
  // alle Ansichten: wer ihn in der Woche setzt, will das Wochenende auch im
  // Tagesplan nicht sehen.
  const [hideWeekend, setHideWeekend] = useState<boolean>(readHideWeekend)
  const weekendToggleVisible =
    view === 'week' || view === 'staff' || view === 'plantafel' || view === 'gantt'
  // Sichtbare Tage des Tagesplans — mit Haken nur Werktage (Sa-Start → ab Mo).
  const ganttVisibleDays = ganttDays(currentDate, ganttSpan, hideWeekend)
  // Gemeldet wird, was im gewählten Zeitraum am Wochenende verschwindet: in der
  // Woche die ganze Woche, im Tagesplan vom gewählten Tag bis zum letzten
  // sichtbaren Werktag (ein Wochenende dazwischen oder davor zählt mit).
  const weekendCheckDays = view === 'gantt'
    ? ganttDays(currentDate, diffDays(toDateStr(currentDate), toDateStr(ganttVisibleDays[ganttVisibleDays.length - 1])) + 1)
    : getWeekDays(currentDate)
  const weekendHiddenCount = hideWeekend && weekendToggleVisible
    ? weekendOnlyEntries(projects, weekendCheckDays)
    : 0

  function toggleHideWeekend(next: boolean) {
    setHideWeekend(next)
    // Private-Mode / voller Storage darf die Auswahl nicht blockieren.
    try { window.localStorage.setItem(HIDE_WEEKEND_KEY, next ? '1' : '0') } catch { /* egal */ }
  }

  // Zoom-Stufe der gerade aktiven Ansicht: Wochenraster = Zeilenhöhe,
  // Tagesplan = Stundenbreite.
  const zoomLevels: readonly number[] = view === 'gantt' ? GANTT_ZOOM_LEVELS : WEEK_ZOOM_LEVELS
  const zoomLabels: readonly string[] = view === 'gantt' ? GANTT_ZOOM_LABELS : WEEK_ZOOM_LABELS
  const zoomIndex = view === 'gantt' ? ganttZoom : zoom

  function changeZoom(delta: number) {
    const isGantt = view === 'gantt'
    const key = isGantt ? GANTT_ZOOM_KEY : ZOOM_KEY
    const max = (isGantt ? GANTT_ZOOM_LEVELS.length : WEEK_ZOOM_LEVELS.length) - 1
    const apply = (prev: number) => {
      const next = Math.max(0, Math.min(max, prev + delta))
      // Private-Mode / voller Storage darf den Zoom nicht blockieren.
      try { window.localStorage.setItem(key, String(next)) } catch { /* egal */ }
      return next
    }
    if (isGantt) setGanttZoom(apply)
    else setZoom(apply)
  }

  // Mitarbeiteransicht: Index des aktuell fokussierten Mitarbeiters (in staff).
  const [staffIndex, setStaffIndex] = useState(0)
  // Index bei geänderter Staff-Liste in gültige Grenzen ziehen.
  const curStaffIndex = staff.length ? Math.min(staffIndex, staff.length - 1) : 0
  const focusedStaff = staff[curStaffIndex] ?? null

  // Gemerkten Mitarbeiter wieder fokussieren, sobald die Liste da ist — die
  // Ablage hält die id, der Index stimmt nach einem Neuladen nicht zwingend.
  const pendingStaffIdRef = useRef(saved.staffId ?? null)
  useEffect(() => {
    const id = pendingStaffIdRef.current
    if (!id || staff.length === 0) return
    pendingStaffIdRef.current = null
    const idx = staff.findIndex(s => s.id === id)
    if (idx >= 0) setStaffIndex(idx)
  }, [staff])

  useEffect(() => {
    writeScheduleView({
      view: viewMode,
      date: toDateStr(currentDate),
      // Solange die Liste noch lädt, bleibt der gemerkte Mitarbeiter stehen.
      staffId: focusedStaff?.id ?? pendingStaffIdRef.current,
      hiddenStaff: [...hiddenStaff],
      viewFallback,
    })
  }, [viewMode, currentDate, focusedStaff, hiddenStaff, viewFallback])

  // Sprung aus Plantafel/Tagesplan auf einen Monteur (WW-68): Datum bleibt, die
  // Mitarbeiter-Ansicht zeigt seine Woche. Nur wenn der Mandant die Ansicht hat —
  // sonst bleibt der Name Text, statt auf eine abgeschaltete Ansicht zu zeigen.
  const openStaff = viewEnabled('staff')
    ? (id: string) => {
        const idx = staff.findIndex(s => s.id === id)
        if (idx < 0) return
        setStaffIndex(idx)
        setViewMode('staff')
      }
    : undefined

  // Sprung von aussen (WW-69) — als Zustands-Anpassung beim Rendern statt in einem
  // Effect: der Kalender zeichnet so gleich den richtigen Tag statt erst den alten.
  // In der Mitarbeiter-Ansicht rückt einer aus dem Team des Termins in den Fokus,
  // und ist das ganze Team im Filter ausgeblendet, wird es wieder eingeblendet —
  // sonst landete der Sprung auf einem Tag, an dem der gesuchte Termin fehlt.
  const [seenFocus, setSeenFocus] = useState<number | null>(focus?.nonce ?? null)
  if (focus && focus.nonce !== seenFocus) {
    setSeenFocus(focus.nonce)
    setCurrentDate(parseDateStr(focus.date))
    const team = focus.staffIds.filter(id => staff.some(s => s.id === id))
    if (view === 'staff' && team.length && !(focusedStaff && team.includes(focusedStaff.id))) {
      setStaffIndex(staff.findIndex(s => s.id === team[0]))
    }
    if (team.length && team.every(id => hiddenStaff.has(id))) {
      setHiddenStaff(prev => new Set([...prev].filter(id => !team.includes(id))))
    }
  }

  function stepStaff(delta: number) {
    if (staff.length === 0) return
    setStaffIndex(((curStaffIndex + delta) % staff.length + staff.length) % staff.length)
  }

  // Wochenstart der aktuell sichtbaren Ansicht nach oben melden, damit der
  // PDF-Export-Button im Screen-Header weiß, welche Woche er anfordern muss.
  useEffect(() => {
    if (!onVisibleWeekChange) return
    onVisibleWeekChange(toDateStr(getWeekDays(currentDate)[0]))
  }, [currentDate, onVisibleWeekChange])

  // Filter-Auswahl an den Screen melden: null = kein Filter (alle), sonst Liste der sichtbaren IDs.
  // In der Mitarbeiteransicht ist das genau der fokussierte Mitarbeiter → dessen
  // Woche landet auch im Wochenplan-PDF.
  useEffect(() => {
    if (!onVisibleStaffChange) return
    if (view === 'staff') {
      onVisibleStaffChange(focusedStaff ? [focusedStaff.id] : [])
      return
    }
    if (hiddenStaff.size === 0) onVisibleStaffChange(null)
    else onVisibleStaffChange(staff.filter(s => !hiddenStaff.has(s.id)).map(s => s.id))
  }, [hiddenStaff, staff, onVisibleStaffChange, view, focusedStaff])

  function toggleStaff(id: string) {
    setHiddenStaff(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Filter: Projekt sichtbar, wenn kein Filter aktiv oder mind. ein zugewiesener
  // Monteur nicht ausgeblendet ist. Projekte ohne Monteure verschwinden, sobald
  // ein Filter gesetzt ist — sonst würden sie das "Alle ausblenden" ignorieren.
  // Stale monteur_ids (nicht mehr in staff) werden ignoriert, sonst könnten sie
  // das Filter aushebeln (hiddenStaff enthält nur bekannte Staff-IDs).
  const staffIds = new Set(staff.map(s => s.id))
  // Wessen Abwesenheit die Ansichten zeigen (§7): in der Mitarbeiter-Ansicht der
  // fokussierte, sonst die sichtbaren Mitarbeiter — ausgeblendete auch hier nicht.
  const absenceStaff: StaffLite[] = view === 'staff'
    ? (focusedStaff ? [focusedStaff] : [])
    : staff.filter(s => !hiddenStaff.has(s.id))
  const visibleProjects = projects.filter(p => {
    // Mitarbeiteransicht: nur Einsätze, auf denen der fokussierte Mitarbeiter
    // tatsächlich draussen ist — Termin-Team, Fallback Projekt-Team (das steckt
    // schon in `monteur_ids` der Kalender-Einträge).
    //
    // Die Projektleitung zählt hier bewusst NICHT als Zuweisung — gleiche Regel
    // wie in `_assigned_open_projects` (agents/routers/admin_projects.py) und im
    // Wochenplan-PDF (services/schedule_export.py), das schon immer nur nach
    // `monteur_ids` sektioniert. Vorher schwemmte es dem Projektleiter jeden
    // Termin seines Portfolios in den eigenen Plan, obwohl er dort nicht mitfährt;
    // sein Plan war damit unbrauchbar, und was der Bildschirm zeigte, wich vom
    // gedruckten Wochenplan derselben Woche ab. Wer als Projektleiter auch aufs
    // Feld geht, steht im Team des Einsatzes und kommt darüber in die Ansicht.
    // Alle seine Projekte sieht er weiterhin über den Projektleiter-Filter der
    // Einsatzplanung.
    if (view === 'staff') {
      if (!focusedStaff) return false
      return p.monteur_ids?.includes(focusedStaff.id) ?? false
    }
    if (hiddenStaff.size === 0) return true
    if (!p.monteur_ids || p.monteur_ids.length === 0) return false
    return p.monteur_ids.some(id => staffIds.has(id) && !hiddenStaff.has(id))
  })

  // Tage mit Einsätzen für die Punkte im Mini-Monatskalender — bewusst aus den
  // SICHTBAREN Einsätzen, damit der Punkt zeigt, was man nach dem Sprung auch
  // wirklich sieht (Monteur-Filter, Mitarbeiteransicht).
  const eventDays = scheduledDayIsoSet(visibleProjects)

  const year = currentDate.getFullYear()
  const holidays = new Map<string, string>([
    ...getSwissHolidays(year - 1, canton),
    ...getSwissHolidays(year, canton),
    ...getSwissHolidays(year + 1, canton),
  ])

  // Auf Mobile ist die Ansicht immer die Wochen-Agenda → Navigation wochenweise,
  // unabhängig vom (dort ausgeblendeten) Monatsmodus.
  const monthNav = view === 'month' && !isMobile
  // Der Tagesplan navigiert in seinem eigenen Zeitraum (1/3/5/6 Tage), nicht wochenweise.
  const ganttNav = view === 'gantt' && !isMobile

  function stepDays(days: number) {
    setCurrentDate(d => addDays(d, days))
  }

  function handlePrev() {
    if (monthNav) setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    else if (ganttNav) setCurrentDate(d => ganttStepStart(d, ganttSpan, -1, hideWeekend))
    else stepDays(-7)
  }

  function handleNext() {
    if (monthNav) setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
    else if (ganttNav) setCurrentDate(d => ganttStepStart(d, ganttSpan, 1, hideWeekend))
    else stepDays(7)
  }

  // Neuer Termin aus dem Zeitraster: in der Mitarbeiteransicht ist der aktuell
  // fokussierte Mitarbeiter automatisch vorausgewählt, sonst kein Monteur.
  function handleCreateSlot(dayISO: string, startTime: string, endTime: string) {
    const monteurId = view === 'staff' ? focusedStaff?.id ?? null : null
    onCreateSlot?.(dayISO, startTime, endTime, monteurId)
  }

  // Jede Ansicht ausser dem Monat nennt vorne die Kalenderwoche (WW-65) — im
  // Monat stünden vier bis sechs Wochen, dort sagt «November 2026» mehr.
  const title = monthNav
    ? currentDate.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })
    : ganttNav
    ? (() => {
        // Titel nach den sichtbaren Tagen: mit ausgeblendetem Wochenende und
        // Samstag als Start steht hier der Montag, nicht der Samstag.
        const first = ganttVisibleDays[0]
        const from = first.toLocaleDateString('de-CH', {
          weekday: 'short', day: '2-digit', month: '2-digit', year: ganttSpan > 1 ? undefined : 'numeric',
        })
        if (ganttSpan === 1) return `${kwLabel(first)} · ${from}`
        const last = ganttVisibleDays[ganttVisibleDays.length - 1]
        return `${kwLabel(first, last)} · ${from} – ${last.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}`
      })()
    : (() => {
        const days = getWeekDays(currentDate)
        const from = days[0].toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
        const to = days[6].toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
        return `${kwLabel(days[0])} · ${from} – ${to}`
      })()

  return (
    <div style={kindColorVars}>
      <div className="absence-cal-toolbar">
        {/* Ohne Config wird hier NICHT gerendert (siehe configPending): welche
            Ansichten es gibt, entscheidet der Mandant — eine Leiste, die erst
            alle sechs zeigt und dann auf drei zusammenfällt, verrät Ansichten,
            die dieser Mandant gar nicht gebucht hat. */}
        <div style={{ display: 'flex', gap: 6 }}>
          {configPending ? null : isMobile ? (
            <>
              <button
                className={`admin-btn admin-btn-sm ${view !== 'staff' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                onClick={() => setViewMode('week')}
              >Alle</button>
              {viewEnabled('staff') && (
                <button
                  className={`admin-btn admin-btn-sm ${view === 'staff' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                  onClick={() => setViewMode('staff')}
                >Mitarbeiter</button>
              )}
            </>
          ) : (
            availableViews.map(v => (
              <button
                key={v.key}
                className={`admin-btn admin-btn-sm ${view === v.key ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                onClick={() => setViewMode(v.key)}
              >{v.label}</button>
            ))
          )}
        </div>

        {/* Titel = Auslöser des Mini-Monatskalenders: ein Klick auf einen Tag
            springt die aktive Ansicht dorthin, statt sich tageweise vorzuklicken.
            Die Karte hat ihren eigenen Zeitraum-Wähler und ignoriert currentDate —
            Datums-Navigation, die dort nichts bewegt, wäre ein Defekt, kein Beiwerk. */}
        {view !== 'map' && (
          <div className="absence-cal-title">
            <MiniMonthPicker
              label={title}
              value={currentDate}
              onPick={setCurrentDate}
              eventDays={eventDays}
              holidays={holidays}
            />
          </div>
        )}

        {view !== 'map' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={handlePrev}>←</button>
            <button
              className="admin-btn admin-btn-secondary admin-btn-sm"
              onClick={() => setCurrentDate(new Date())}
            >Heute</button>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={handleNext}>→</button>
          </div>
        )}
      </div>

      {!busy && view === 'staff' && staff.length > 0 && (
        <div className="project-cal-staff-switcher">
          <span className="project-cal-filter-label">Mitarbeiter</span>
          <div className="project-cal-staff-switcher-nav">
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              onClick={() => stepStaff(-1)}
              title="Vorheriger Mitarbeiter"
            >←</button>
            <select
              className="admin-input project-cal-staff-switcher-select"
              value={focusedStaff?.id ?? ''}
              onChange={e => {
                const idx = staff.findIndex(s => s.id === e.target.value)
                if (idx >= 0) setStaffIndex(idx)
              }}
            >
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              onClick={() => stepStaff(1)}
              title="Nächster Mitarbeiter"
            >→</button>
          </div>
          <span className="project-cal-filter-count">{curStaffIndex + 1} / {staff.length}</span>
        </div>
      )}

      {!busy && view !== 'staff' && staff.length > 0 && (
        <div className="project-cal-filter">
          <div className="project-cal-filter-head">
            <span>
              <span className="project-cal-filter-label">Monteure</span>
              <span className="project-cal-filter-count">
                {staff.length - hiddenStaff.size} von {staff.length} sichtbar
              </span>
            </span>
            <button
              type="button"
              className="project-schedule-mini-btn"
              onClick={() => {
                const allHidden = hiddenStaff.size === staff.length
                setHiddenStaff(allHidden ? new Set() : new Set(staff.map(s => s.id)))
              }}
            >
              {hiddenStaff.size === staff.length ? 'Alle anzeigen' : 'Alle ausblenden'}
            </button>
          </div>
          <div className="absence-cal-staff-filter">
            {staff.map(s => (
              <button
                key={s.id}
                className={`absence-cal-staff-chip${hiddenStaff.has(s.id) ? ' hidden' : ''}`}
                onClick={() => toggleStaff(s.id)}
                // Kürzel wie auf den Kacheln (§4); der volle Name bleibt
                // Tooltip und zugänglicher Name des Knopfs.
                title={s.name}
                aria-label={s.name}
              >
                {staffShortLabel(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!busy && !isMobile && weekendToggleVisible && (
        <div className="project-cal-zoom">
          <label className="project-cal-filter-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={hideWeekend}
              onChange={e => toggleHideWeekend(e.target.checked)}
            />
            Wochenende ausblenden
          </label>
          {weekendHiddenCount > 0 && (
            <span className="project-cal-weekend-hint" role="status">
              {weekendHiddenCount === 1
                ? '1 Einsatz am Wochenende ausgeblendet'
                : `${weekendHiddenCount} Einsätze am Wochenende ausgeblendet`}
            </span>
          )}
        </div>
      )}

      {!busy && !isMobile && (view === 'week' || view === 'staff' || view === 'gantt') && (
        <div className="project-cal-zoom">
          {view === 'gantt' && (
            <>
              <span className="project-cal-filter-label">Zeitraum</span>
              <div className="project-cal-gantt-spans">
                {GANTT_SPANS.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`admin-btn admin-btn-sm ${ganttSpan === s ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    onClick={() => {
                      setGanttSpan(s)
                      // Private-Mode / voller Storage darf die Auswahl nicht blockieren.
                      try { window.localStorage.setItem(GANTT_SPAN_KEY, String(s)) } catch { /* egal */ }
                    }}
                  >{GANTT_SPAN_LABELS[s]}</button>
                ))}
              </div>
            </>
          )}
          <span className="project-cal-filter-label">{view === 'gantt' ? 'Stundenbreite' : 'Zeilenhöhe'}</span>
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => changeZoom(-1)}
            disabled={zoomIndex === 0}
            aria-label={view === 'gantt' ? 'Stundenbreite verkleinern' : 'Zeilenhöhe verkleinern'}
          >−</button>
          <span className="project-cal-zoom-value">{zoomLabels[zoomIndex]}</span>
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => changeZoom(1)}
            disabled={zoomIndex === zoomLevels.length - 1}
            aria-label={view === 'gantt' ? 'Stundenbreite vergrössern' : 'Zeilenhöhe vergrössern'}
          >+</button>
        </div>
      )}

      {busy ? (
        <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
      ) : view === 'staff' && !focusedStaff ? (
        <div className="admin-empty">Keine Mitarbeiter verfügbar.</div>
      ) : view === 'map' ? (
        // Bewusst vor dem isMobile-Zweig: wer die Karte wählt, will die Karte —
        // auf dem Tablet mit Tap statt Hover, nicht die Agenda-Liste.
        <Suspense fallback={<div className="admin-loading"><div className="admin-spinner" /> Karte wird geladen…</div>}>
          <ProjectScheduleMap
            projects={visibleProjects}
            staff={staff}
            canton={canton}
            dayCapacityHours={schedulingConfig?.day_capacity_hours ?? DAY_CAPACITY_FALLBACK_H}
            onOpenProject={onOpenProject}
          />
        </Suspense>
      ) : isMobile ? (
        <AgendaView
          projects={visibleProjects}
          staff={staff}
          fields={fields}
          currentDate={currentDate}
          onSelect={onSelect}
          onOpenProject={onOpenProject}
          onCreateSlot={onCreateSlot ? handleCreateSlot : undefined}
          holidays={holidays}
          absences={absences}
          absenceStaff={absenceStaff}
          staffMode={view === 'staff'}
        />
      ) : view === 'gantt' ? (
        <ProjectScheduleGantt
          projects={visibleProjects}
          staff={staff}
          rowStaff={hiddenStaff.size > 0 ? staff.filter(s => !hiddenStaff.has(s.id)) : staff}
          fields={fields}
          currentDate={currentDate}
          span={ganttSpan}
          hideWeekend={hideWeekend}
          hourWidth={GANTT_ZOOM_LEVELS[ganttZoom]}
          onSelect={onSelect}
          onOpenProject={onOpenProject}
          onReschedule={(id, d, t, m) => { void onReschedule(id, d, t, m) }}
          onCreateSlot={onCreateSlot}
          holidays={holidays}
          greyAfter={greyAfter}
          greyUntil={greyUntil}
          dayCapacityHours={schedulingConfig?.day_capacity_hours ?? DAY_CAPACITY_FALLBACK_H}
          showDistances={schedulingConfig?.show_distances !== false}
          absences={absences}
          onOpenStaff={openStaff}
        />
      ) : view === 'plantafel' ? (
        <PlantafelView
          projects={visibleProjects}
          staff={staff}
          rowStaff={hiddenStaff.size > 0 ? staff.filter(s => !hiddenStaff.has(s.id)) : staff}
          fields={fields}
          currentDate={currentDate}
          onSelect={onSelect}
          onOpenProject={onOpenProject}
          onReschedule={(id, d, t, m) => { void onReschedule(id, d, t, m) }}
          onCreateCell={onCreateSlot
            ? (dayISO, monteurId) => onCreateSlot(dayISO, '08:00', '09:00', monteurId)
            : undefined}
          holidays={holidays}
          showDistances={schedulingConfig?.show_distances !== false}
          absences={absences}
          hideWeekend={hideWeekend}
          onOpenStaff={openStaff}
          einsatzStaende={einsatzStaende}
        />
      ) : view === 'month' ? (
        <MonthView
          projects={visibleProjects}
          staff={staff}
          fields={fields}
          currentDate={currentDate}
          onSelect={onSelect}
          onOpenProject={onOpenProject}
          onReschedule={(id, d, t) => { void onReschedule(id, d, t) }}
          holidays={holidays}
          absences={absences}
          absenceStaff={absenceStaff}
        />
      ) : (
        <WeekView
          projects={visibleProjects}
          staff={staff}
          fields={fields}
          currentDate={currentDate}
          onSelect={onSelect}
          onOpenProject={onOpenProject}
          onReschedule={(id, d, t) => { void onReschedule(id, d, t) }}
          onCreateSlot={onCreateSlot ? handleCreateSlot : undefined}
          holidays={holidays}
          greyAfter={greyAfter}
          greyUntil={greyUntil}
          hourHeight={WEEK_ZOOM_LEVELS[zoom]}
          absences={absences}
          absenceStaff={absenceStaff}
          staffMode={view === 'staff'}
          hideWeekend={hideWeekend}
        />
      )}

      {/* Die Karte bringt ihre eigene Legende mit (Farbskala, Gewichtung) —
          zwei Legenden übereinander sind Lärm. */}
      {!busy && !isMobile && view !== 'map' && <CalendarLegend canton={canton} />}
      {!busy && isMobile && (
        <div className="project-cal-agenda-hint">
          Einsatz antippen zum Bearbeiten, <strong>+</strong> für neuen Einsatz.
        </div>
      )}
    </div>
  )
}

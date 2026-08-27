import { Fragment, Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { Project } from '../../api/admin/projects'
import {
  SCHEDULING_VIEWS,
  type SchedulingConfig, type SchedulingViewKey,
} from '../../api/admin'
import { useIsMobile } from '../useIsMobile'
import {
  getSwissHolidays, getWeekDays, getMonthDays, toDateStr, isToday,
  diffDays, hhmmToMin, minToHHMM, addDays,
} from '../utils/calendarHelpers'
import {
  computeWeekHours, computeLanes, laneStyle, tileLayout, timeOffsetPx, timedBlockHeightPx,
  yToSnappedTime, WEEK_SNAP_MIN, WEEK_ZOOM_LEVELS, WEEK_ZOOM_LABELS, WEEK_ZOOM_DEFAULT,
  type TileLayout,
} from '../utils/weekGrid'
import {
  GANTT_DAY_CAPACITY_FALLBACK_H as DAY_CAPACITY_FALLBACK_H,
  GANTT_SPANS, GANTT_SPAN_DEFAULT, GANTT_SPAN_LABELS,
  GANTT_ZOOM_DEFAULT, GANTT_ZOOM_LABELS, GANTT_ZOOM_LEVELS,
} from '../utils/ganttGrid'
import ProjectScheduleGantt from './ProjectScheduleGantt'
import {
  crewMembers, entryTitle, fmtTime, fmtTimeRange, hasUnassignedEntries, kindSymbol,
  neededDistancePairs, overlapConflictIds, pillBg, pillClass, pillExtraLines,
  projectCoversDay, projectMonteurNames, readDragPayload, reassignTeam, rowEntries,
  scheduledDayIsoSet, setDragPayload, terminLegend, useHoverCard, useScheduleDistances,
  type CalendarEntry, type StaffLite,
} from './scheduleShared'
import EventHoverCard from './EventHoverCard'
import MiniMonthPicker from './MiniMonthPicker'

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
  onSelect: (p: Project) => void
  // Doppelklick auf einen Einsatz: springt in die Projektmaske. Das Panel rechts
  // plant nur Termine — Adresse, Kunde, Kontakte usw. lassen sich nur dort ändern.
  // Fehlt der Handler (z.B. ohne Navigation im Test), bleibt es beim Einfachklick.
  onOpenProject?: (p: Project) => void
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pillLabel(p: Project): string {
  const t = fmtTime(p.start_time)
  const name = entryTitle(p)
  return t ? `${t} ${name}` : name
}

// Doppelklick öffnet das Projekt. Der Einfachklick (Panel) feuert dabei zwangsläufig
// mit — er ist folgenlos, weil die Projektmaske den Screen ohnehin ersetzt. Die
// Textauswahl, die ein Doppelklick sonst auslöst, wird unterdrückt.
function openBinding(p: CalendarEntry, onOpenProject?: (p: Project) => void) {
  if (!onOpenProject) return {}
  return {
    onDoubleClick: (e: React.MouseEvent) => {
      e.preventDefault()
      window.getSelection()?.removeAllRanges()
      onOpenProject(p)
    },
  }
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function CalendarLegend({ canton }: { canton: string }) {
  return (
    <div className="absence-cal-legend">
      <div className="absence-cal-legend-item">
        <span className="absence-cal-legend-dot absence-cal-legend-dot--holiday" />
        Feiertag {canton.toUpperCase()}
      </div>
      <div className="absence-cal-legend-item" style={{ color: 'var(--muted)' }}>
        {terminLegend()} · 👥 Teamsitzung · 📦 Lager · ⚙️ Werkstatt · 🚧 Blocker (schraffiert = provisorisch)
      </div>
      <div className="absence-cal-legend-item" style={{ color: 'var(--muted)' }}>
        Tipp: Einsatz greifen und auf einen anderen Tag ziehen — in der Wochenansicht auch auf eine andere Uhrzeit. Auf freier Fläche einen Zeitraum aufziehen, um einen neuen Termin zu planen. Mit der Maus auf einem Einsatz stehen bleiben zeigt alle Angaben, <strong>Doppelklick</strong> öffnet das Projekt.
      </div>
    </div>
  )
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({
  projects, staff, fields, currentDate, onSelect, onOpenProject, onReschedule, holidays,
}: {
  projects: CalendarEntry[]
  staff: StaffLite[]
  fields?: Record<string, boolean>
  currentDate: Date
  onSelect: (p: Project) => void
  onOpenProject?: (p: Project) => void
  onReschedule: (id: string, deltaDays: number, startTime?: string | null) => void
  holidays: Map<string, string>
}) {
  const days = getMonthDays(currentDate)
  const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  const [hoverDay, setHoverDay] = useState<string | null>(null)
  const { hover, bind } = useHoverCard()
  const projById = new Map(projects.map(p => [p.id, p]))

  function handleDrop(e: React.DragEvent, dropDay: Date) {
    e.preventDefault()
    setHoverDay(null)
    const payload = readDragPayload(e)
    if (!payload) return
    const proj = projById.get(payload.projectId)
    if (!proj) return
    // Monatsansicht kennt keine Uhrzeit — nur Tagesversatz, Zeit bleibt erhalten.
    const delta = diffDays(payload.grabDayISO, toDateStr(dropDay))
    if (delta !== 0) onReschedule(proj.id, delta)
  }

  return (
    <div>
      <div className="absence-cal-month-grid" style={{ marginBottom: 1 }}>
        {DOW.map(d => (
          <div key={d} className="absence-cal-day-header">{d}</div>
        ))}
      </div>

      <div className="absence-cal-month-grid">
        {days.map((day, i) => {
          if (!day) {
            return <div key={i} className="absence-cal-day-cell outside-month" />
          }
          const dayISO = toDateStr(day)
          const today = isToday(day)
          const holidayName = holidays.get(dayISO)
          const dayProjects = projects.filter(p => projectCoversDay(p, day))

          return (
            <div
              key={i}
              className={`absence-cal-day-cell${today ? ' today' : ''}${holidayName ? ' holiday' : ''}${hoverDay === dayISO ? ' project-cal-drop-hover' : ''}`}
              onDragOver={e => { e.preventDefault(); setHoverDay(dayISO) }}
              onDragLeave={() => setHoverDay(prev => prev === dayISO ? null : prev)}
              onDrop={e => handleDrop(e, day)}
            >
              <div className="absence-cal-day-top">
                <span className="absence-cal-day-num">{day.getDate()}</span>
                {holidayName && (
                  <span className="absence-cal-holiday-label" title={holidayName}>
                    {holidayName}
                  </span>
                )}
              </div>
              {dayProjects.map((p, j) => {
                const extra = pillExtraLines(p, staff, fields)
                return (
                  <div
                    key={j}
                    className={`absence-cal-pill project-cal-pill${extra.length ? ' has-extra' : ''}${pillClass(p)}`}
                    draggable
                    onDragStart={e => setDragPayload(e, p.id, dayISO)}
                    style={{ background: pillBg(p) }}
                    onClick={() => onSelect(p)}
                    {...openBinding(p, onOpenProject)}
                    {...bind(p)}
                  >
                    {kindSymbol(p) && <span className="project-cal-kind-symbol">{kindSymbol(p)}</span>}
                    {p.termin_badge && <span className="project-cal-termin-badge">{p.termin_badge}</span>}
                    {pillLabel(p)}
                    {extra.map((line, k) => (
                      <div key={k} className="project-cal-pill-extra">{line}</div>
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {hover && <EventHoverCard hover={hover} staff={staff} />}
    </div>
  )
}

// ─── Week View (Zeitraster: Stunden links, Tage als Spalten) ─────────────────
// Rasterlogik (Zeitbereich, Zoom, Kachelhöhen, Lanes, Zeilen-Budget) liegt in
// utils/weekGrid.ts — hier bleibt nur das Rendern.

function WeekView({
  projects, staff, fields, currentDate, onSelect, onOpenProject, onReschedule, onCreateSlot, holidays,
  greyAfter, greyUntil, hourHeight,
}: {
  projects: CalendarEntry[]
  staff: StaffLite[]
  fields?: Record<string, boolean>
  currentDate: Date
  onSelect: (p: Project) => void
  onOpenProject?: (p: Project) => void
  onReschedule: (id: string, deltaDays: number, startTime?: string | null) => void
  onCreateSlot?: (dayISO: string, startTime: string, endTime: string) => void
  holidays: Map<string, string>
  // Nicht-Arbeitszeit-Fenster: ab greyAfter grau ('' = aus), bis greyUntil
  // ('' = bis Rasterende). Nur Werktage, rein visuell.
  greyAfter?: string
  greyUntil?: string
  // Zeilenhöhe pro Stunde in px (Zoom-Stufe).
  hourHeight: number
}) {
  const days = getWeekDays(currentDate)
  const [hoverDayISO, setHoverDayISO] = useState<string | null>(null)
  const { hover, bind } = useHoverCard()
  // Live-Vorschau beim Ziehen ins Zeitraster: an welchem Tag/Höhe der Block landet.
  const [dropPreview, setDropPreview] = useState<{ dayISO: string; topPx: number; time: string } | null>(null)
  // Greif-Offset (px ab Block-Oberkante) des laufenden Drags. dataTransfer ist
  // während dragover nicht lesbar, darum hier zwischengespeichert.
  const dragGrabYRef = useRef(0)
  // Neuen Termin aufziehen: laufender Zug (Ref, für die Fenster-Listener) +
  // sichtbare Vorschaubox (State). colTop = Rasteroberkante der gegriffenen Spalte.
  const createRef = useRef<{ dayISO: string; colTop: number; startPx: number; endPx: number } | null>(null)
  const [createBox, setCreateBox] = useState<{ dayISO: string; topPx: number; heightPx: number; startTime: string; endTime: string } | null>(null)
  const projById = new Map(projects.map(p => [p.id, p]))

  const projectsByDay: CalendarEntry[][] = days.map(d => projects.filter(p => projectCoversDay(p, d)))

  // Rastergrenzen aus der sichtbaren Woche — leere Randstunden fallen weg.
  const { startHour, endHour } = computeWeekHours(projectsByDay.flat())
  const hours: number[] = []
  for (let h = startHour; h <= endHour; h++) hours.push(h)
  const gridHeight = (endHour - startHour) * hourHeight

  // Ausgrau-Fenster (Nicht-Arbeitszeit): Y-Positionen des grauen Bereichs an
  // Werktagen (Mo–Fr). greyTopPx = Fenster-Start (null = aus). greyBottomPx =
  // Fenster-Ende; greyUntil leer/ungültig => bis Rasterende (Feierabend).
  // Beide auf das sichtbare Raster begrenzt.
  const greyTopPx = greyAfter && /^\d{2}:\d{2}$/.test(greyAfter)
    ? Math.max(0, Math.min(gridHeight, timeOffsetPx(greyAfter, startHour, hourHeight)))
    : null
  const greyBottomPx = greyUntil && /^\d{2}:\d{2}$/.test(greyUntil)
    ? Math.max(0, Math.min(gridHeight, timeOffsetPx(greyUntil, startHour, hourHeight)))
    : gridHeight

  // Vorschaubox aus dem laufenden Zug berechnen (auf das Raster begrenzt).
  function createBoxFrom(c: { dayISO: string; startPx: number; endPx: number }) {
    const a = Math.max(0, Math.min(gridHeight, Math.min(c.startPx, c.endPx)))
    const b = Math.max(0, Math.min(gridHeight, Math.max(c.startPx, c.endPx)))
    return {
      dayISO: c.dayISO,
      topPx: a,
      heightPx: b - a,
      startTime: yToSnappedTime(a, startHour, endHour, hourHeight),
      endTime: yToSnappedTime(b, startHour, endHour, hourHeight),
    }
  }

  // Aufziehen starten — nur auf leerer Rasterfläche, nicht auf einem Block
  // (dort greift der native Drag zum Verschieben). Fenster-Listener, damit das
  // Ziehen auch ausserhalb der Spalte weiterläuft.
  function beginCreate(e: React.MouseEvent, dayISO: string) {
    if (!onCreateSlot || e.button !== 0) return
    if ((e.target as HTMLElement).closest('.project-cal-week-event')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    createRef.current = { dayISO, colTop: rect.top, startPx: y, endPx: y }
    setCreateBox(createBoxFrom(createRef.current))
    window.addEventListener('mousemove', onCreateMove)
    window.addEventListener('mouseup', onCreateUp)
    e.preventDefault()
  }
  function onCreateMove(e: MouseEvent) {
    const c = createRef.current
    if (!c) return
    c.endPx = e.clientY - c.colTop
    setCreateBox(createBoxFrom(c))
  }
  function onCreateUp() {
    window.removeEventListener('mousemove', onCreateMove)
    window.removeEventListener('mouseup', onCreateUp)
    const c = createRef.current
    createRef.current = null
    setCreateBox(null)
    if (!c || !onCreateSlot) return
    const a = Math.max(0, Math.min(gridHeight, Math.min(c.startPx, c.endPx)))
    const b = Math.max(0, Math.min(gridHeight, Math.max(c.startPx, c.endPx)))
    const startTime = yToSnappedTime(a, startHour, endHour, hourHeight)
    let endTime = yToSnappedTime(b, startHour, endHour, hourHeight)
    // Klick oder winziger Zug → 1-Stunden-Default ab Startzeit.
    if (hhmmToMin(endTime) - hhmmToMin(startTime) < WEEK_SNAP_MIN) {
      endTime = minToHHMM(Math.min(endHour * 60, hhmmToMin(startTime) + 60))
    }
    onCreateSlot(c.dayISO, startTime, endTime)
  }

  // Drop auf den Ganztägig-Strip: Tag verschieben, Uhrzeit löschen (→ ganztägig).
  function handleAllDayDrop(e: React.DragEvent, dropDay: Date) {
    e.preventDefault()
    setHoverDayISO(null)
    const payload = readDragPayload(e)
    if (!payload) return
    const proj = projById.get(payload.projectId)
    if (!proj) return
    const delta = diffDays(payload.grabDayISO, toDateStr(dropDay))
    onReschedule(proj.id, delta, null)
  }

  // Drop ins Zeitraster: Tag verschieben + Startzeit aus der Y-Position setzen.
  function handleTimedDrop(e: React.DragEvent, dropDay: Date) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setDropPreview(null)
    const payload = readDragPayload(e)
    if (!payload) return
    const proj = projById.get(payload.projectId)
    if (!proj) return
    const delta = diffDays(payload.grabDayISO, toDateStr(dropDay))
    const time = yToSnappedTime(e.clientY - rect.top - payload.grabOffset, startHour, endHour, hourHeight)
    onReschedule(proj.id, delta, time)
  }

  // Kachel-Innenleben. Symbol und Badge stehen immer beim Namen, damit die
  // Einsatz-Art auch auf der flachsten Kachel erkennbar bleibt.
  function tileBody(p: CalendarEntry, timeLabel: string, extra: string[], layout: TileLayout) {
    const head = (
      <>
        {kindSymbol(p) && <span className="project-cal-kind-symbol">{kindSymbol(p)}</span>}
        {p.termin_badge && <span className="project-cal-termin-badge">{p.termin_badge}</span>}
        {entryTitle(p)}
      </>
    )
    if (layout.inline) {
      return (
        <div className="project-cal-week-event-inline">
          {timeLabel && <span className="project-cal-week-event-time">{fmtTime(p.start_time)}</span>}
          <span className="project-cal-week-event-name">{head}</span>
        </div>
      )
    }
    return (
      <>
        {timeLabel && <div className="project-cal-week-event-time">{timeLabel}</div>}
        <div
          className="project-cal-week-event-name"
          style={{ WebkitLineClamp: layout.nameLines } as React.CSSProperties}
        >{head}</div>
        {extra.slice(0, layout.extraLines).map((line, k) => (
          <div key={k} className="project-cal-week-event-extra">{line}</div>
        ))}
      </>
    )
  }

  function renderBlock(
    p: CalendarEntry,
    dayISO: string,
    allDay: boolean,
    lane?: { col: number; total: number },
  ) {
    const timeLabel = fmtTimeRange(p)
    const extra = pillExtraLines(p, staff, fields)
    // key wird bewusst separat gesetzt — React 19 warnt, wenn er mitgespreadet wird.
    const common = {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        dragGrabYRef.current = Math.round(e.nativeEvent.offsetY) || 0
        setDragPayload(e, p.id, dayISO)
      },
      onClick: () => onSelect(p),
      ...openBinding(p, onOpenProject),
      ...bind(p),
    }

    // Der Ganztägig-Strip hat keine Höhenbeschränkung — dort wächst die Kachel
    // mit ihrem Inhalt, nichts muss gekürzt werden.
    if (allDay) {
      return (
        <div
          key={p.id}
          {...common}
          className={`project-cal-week-event allday${extra.length ? ' has-extra' : ''}${pillClass(p)}`}
          style={{ background: pillBg(p) }}
        >
          <div className="project-cal-week-event-name">
            {kindSymbol(p) && <span className="project-cal-kind-symbol">{kindSymbol(p)}</span>}
            {p.termin_badge && <span className="project-cal-termin-badge">{p.termin_badge}</span>}
            {entryTitle(p)}
          </div>
          {extra.map((line, k) => (
            <div key={k} className="project-cal-week-event-extra">{line}</div>
          ))}
        </div>
      )
    }

    // Getaktete Kachel: Höhe = Dauer. Was nicht ganz hineinpasst, wird weggelassen
    // statt mitten in der Zeile abgeschnitten — die vollen Angaben liefert die
    // Hover-Karte.
    const heightPx = timedBlockHeightPx(p, hourHeight)
    const layout = tileLayout(heightPx, extra.length, lane?.total ?? 1)
    return (
      <div
        key={p.id}
        {...common}
        className={
          `project-cal-week-event${layout.inline ? ' tight' : ''}` +
          `${(lane?.total ?? 1) > 1 ? ' stacked' : ''}${pillClass(p)}`
        }
        style={{
          background: pillBg(p),
          top: timeOffsetPx(p.start_time!, startHour, hourHeight),
          height: heightPx,
          ...laneStyle(lane),
        }}
      >
        {tileBody(p, timeLabel, extra, layout)}
      </div>
    )
  }

  return (
    <div className="project-cal-week">
      {/* Header */}
      <div className="project-cal-week-header">
        <div className="project-cal-week-corner" />
        {days.map((d, i) => {
          const holidayName = holidays.get(toDateStr(d))
          return (
            <div key={i} className={`project-cal-week-day-head${isToday(d) ? ' today' : ''}`}>
              <div className="project-cal-week-day-wd">{d.toLocaleDateString('de-CH', { weekday: 'short' })}</div>
              <div className="project-cal-week-day-num">{d.getDate()}.{d.getMonth() + 1}.</div>
              {holidayName && <div className="project-cal-week-day-holiday">{holidayName}</div>}
            </div>
          )
        })}
      </div>

      {/* Ganztägig-Strip (Projekte ohne Startzeit) */}
      {projectsByDay.some(list => list.some(p => !p.start_time)) && (
        <div className="project-cal-week-allday-row">
          <div className="project-cal-week-allday-label">Ganztägig</div>
          {days.map((d, i) => {
            const dayISO = toDateStr(d)
            const allDayProjects = projectsByDay[i].filter(p => !p.start_time)
            return (
              <div
                key={i}
                className={`project-cal-week-allday-cell${hoverDayISO === dayISO ? ' project-cal-drop-hover' : ''}`}
                onDragOver={e => { e.preventDefault(); setHoverDayISO(dayISO) }}
                onDragLeave={() => setHoverDayISO(prev => prev === dayISO ? null : prev)}
                onDrop={e => handleAllDayDrop(e, d)}
              >
                {allDayProjects.map(p => renderBlock(p, dayISO, true))}
              </div>
            )
          })}
        </div>
      )}

      {/* Zeitraster */}
      <div className="project-cal-week-body" style={{ height: gridHeight + 1 }}>
        <div className="project-cal-week-hours">
          {hours.slice(0, -1).map(h => (
            <div key={h} className="project-cal-week-hour-label" style={{ height: hourHeight }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {days.map((d, i) => {
          const dayISO = toDateStr(d)
          const timed = projectsByDay[i].filter(p => p.start_time)
          const lanes = computeLanes(timed, hourHeight)
          // Nur Werktage (Mo–Fr) ausgrauen; Wochenende bleibt normal.
          const dow = d.getDay() // 0 = So, 6 = Sa
          const showDim = greyTopPx !== null && dow >= 1 && dow <= 5 && greyBottomPx > greyTopPx
          return (
            <div
              key={i}
              className={`project-cal-week-day-col${dropPreview?.dayISO === dayISO ? ' project-cal-drop-hover' : ''}${onCreateSlot ? ' creatable' : ''}`}
              onMouseDown={e => beginCreate(e, dayISO)}
              onDragOver={e => {
                e.preventDefault()
                const rect = e.currentTarget.getBoundingClientRect()
                const topPx = e.clientY - rect.top - dragGrabYRef.current
                setDropPreview({ dayISO, topPx, time: yToSnappedTime(topPx, startHour, endHour, hourHeight) })
              }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropPreview(prev => prev?.dayISO === dayISO ? null : prev)
                }
              }}
              onDrop={e => handleTimedDrop(e, d)}
            >
              {hours.slice(0, -1).map(h => (
                <div key={h} className="project-cal-week-hour-cell" style={{ height: hourHeight }} />
              ))}
              {showDim && (
                <div
                  className="project-cal-week-dim"
                  style={{ top: greyTopPx!, height: greyBottomPx - greyTopPx! }}
                  aria-hidden="true"
                />
              )}
              {timed.map(p => renderBlock(p, dayISO, false, lanes.get(p.id)))}
              {dropPreview?.dayISO === dayISO && (
                <div
                  className="project-cal-week-drop-line"
                  style={{ top: Math.max(0, Math.min(gridHeight, dropPreview.topPx)) }}
                >
                  <span className="project-cal-week-drop-time">{dropPreview.time}</span>
                </div>
              )}
              {createBox?.dayISO === dayISO && (
                <div
                  className="project-cal-week-create-box"
                  style={{ top: createBox.topPx, height: Math.max(2, createBox.heightPx) }}
                >
                  <span className="project-cal-week-create-time">
                    {createBox.startTime}–{createBox.endTime}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {hover && <EventHoverCard hover={hover} staff={staff} />}
    </div>
  )
}

// ─── Plantafel (Monteure als Zeilen × Wochentage) ───────────────────────────
// Dispositions-Sicht: eine Zeile pro Monteur, Spalten Mo–So. Ein Termin mit
// mehreren Monteuren erscheint in jeder betroffenen Zeile; Termine ohne
// (bekannten) Monteur sammeln sich in der Zeile «Ohne Monteur». Drag&Drop
// verschiebt den Tag; ein Drop in einer anderen Monteur-Zeile weist zusätzlich
// den Quell-Monteur auf den Ziel-Monteur um (restliches Team bleibt erhalten).

function PlantafelView({
  projects, staff, rowStaff, fields, currentDate, onSelect, onOpenProject, onReschedule, onCreateCell, holidays,
  showDistances,
}: {
  projects: CalendarEntry[]
  staff: StaffLite[]
  // Zeilen der Tafel = Monteure nach aktivem Filter (staff bleibt die volle
  // Liste für Namensauflösung in Tooltips/Zusatzfeldern).
  rowStaff: StaffLite[]
  fields?: Record<string, boolean>
  currentDate: Date
  onSelect: (p: Project) => void
  onOpenProject?: (p: Project) => void
  onReschedule: (id: string, deltaDays: number, startTime?: string | null, monteurIds?: string[]) => void
  // Klick auf leere Zelle → neuer Termin an diesem Tag mit dem Zeilen-Monteur
  // vorbelegt (null = Zeile «Ohne Monteur»).
  onCreateCell?: (dayISO: string, monteurId: string | null) => void
  holidays: Map<string, string>
  // Fahrdistanzen zwischen aufeinanderfolgenden Einsätzen anzeigen (Tenant-Config).
  showDistances?: boolean
}) {
  const days = getWeekDays(currentDate)
  // Hover-Zelle beim Drag: `${dayISO}|${rowId}` (rowId '' = «Ohne Monteur»).
  const [hoverCell, setHoverCell] = useState<string | null>(null)
  const projById = new Map(projects.map(p => [p.id, p]))
  const staffIds = new Set(staff.map(s => s.id))

  // Einträge einer Zelle: rowId = Monteur-Zeile, null = «Ohne Monteur».
  // Ganztägige zuerst, danach chronologisch. Geteilt mit der Gantt-Ansicht.
  function cellEntries(rowId: string | null, day: Date): CalendarEntry[] {
    return rowEntries(projects, staffIds, rowId, day)
  }

  const hasUnassigned = hasUnassignedEntries(projects, staffIds, days)

  const distBetween = useScheduleDistances(
    showDistances ? neededDistancePairs(projects, staffIds, rowStaff, days) : [],
  )


  function handleDrop(e: React.DragEvent, day: Date, rowId: string | null) {
    e.preventDefault()
    setHoverCell(null)
    const payload = readDragPayload(e)
    if (!payload) return
    const proj = projById.get(payload.projectId)
    if (!proj) return
    const delta = diffDays(payload.grabDayISO, toDateStr(day))
    // Zeilenwechsel = Umzuweisung (geteilt mit dem Gantt, siehe reassignTeam):
    // Quell-Monteur raus, Ziel-Monteur rein. Drop in «Ohne Monteur» ändert das
    // Team nicht — dann bleibt nur der Tagesversatz.
    const newTeam = reassignTeam(proj.monteur_ids, rowId, payload.sourceRowId || null)
    if (delta !== 0 || newTeam) onReschedule(proj.id, delta, undefined, newTeam)
  }

  function renderChip(p: CalendarEntry, dayISO: string, rowId: string | null, conflict: boolean) {
    const timeLabel = fmtTimeRange(p)
    const extra = pillExtraLines(p, staff, fields)
    const monteurs = projectMonteurNames(p, staff)
    const symbol = kindSymbol(p)
    // In der Plantafel steht jeder Monteur in seiner eigenen Zeile — der Lead
    // bekommt deshalb keine eigene Pille, sondern seine Kachel eine rote Kante.
    const isLead = !!rowId && crewMembers(p, staff)[0]?.id === rowId
    return (
      <div
        key={p.id}
        className={`project-cal-board-chip${conflict ? ' conflict' : ''}${isLead ? ' lead' : ''}${pillClass(p)}`}
        draggable
        onDragStart={e => setDragPayload(e, p.id, dayISO, rowId ?? '')}
        onClick={() => onSelect(p)}
        {...openBinding(p, onOpenProject)}
        style={{ background: pillBg(p) }}
        title={[
          entryTitle(p), timeLabel, monteurs, ...extra,
          isLead ? 'Lead-Monteur' : '',
          conflict ? '⚠ Zeitliche Überschneidung mit einem anderen Einsatz dieses Monteurs' : '',
        ].filter(Boolean).join(' · ')}
      >
        <span className="project-cal-board-chip-time">
          {symbol && <span className="project-cal-kind-symbol">{symbol}</span>}
          {timeLabel || 'ganztägig'}
          {conflict && <span className="project-cal-board-chip-warn">⚠</span>}
        </span>
        <span className="project-cal-board-chip-name">
          {p.termin_badge && <span className="project-cal-termin-badge">{p.termin_badge}</span>}
          {entryTitle(p)}
        </span>
      </div>
    )
  }

  function renderRow(rowId: string | null, label: string) {
    return (
      <div key={rowId ?? '∅'} className="project-cal-board-row">
        <div className={`project-cal-board-staff${rowId === null ? ' unassigned' : ''}`}>{label}</div>
        {days.map(d => {
          const dayISO = toDateStr(d)
          const cellKey = `${dayISO}|${rowId ?? ''}`
          const entries = cellEntries(rowId, d)
          const conflicts = rowId !== null ? overlapConflictIds(entries) : new Set<string>()
          return (
            <div
              key={dayISO}
              className={
                `project-cal-board-cell${isToday(d) ? ' today' : ''}` +
                `${holidays.has(dayISO) ? ' holiday' : ''}` +
                `${hoverCell === cellKey ? ' project-cal-drop-hover' : ''}` +
                `${onCreateCell ? ' creatable' : ''}`
              }
              onDragOver={e => { e.preventDefault(); setHoverCell(cellKey) }}
              onDragLeave={() => setHoverCell(prev => prev === cellKey ? null : prev)}
              onDrop={e => handleDrop(e, d, rowId)}
              onClick={e => {
                // Nur Klicks auf die freie Zellfläche — Chips öffnen ihr Panel selbst.
                if (onCreateCell && e.target === e.currentTarget) onCreateCell(dayISO, rowId)
              }}
              title={onCreateCell ? 'Klicken, um hier einen Einsatz zu planen' : undefined}
            >
              {entries.map((p, i) => {
                const next = entries[i + 1]
                const km = showDistances && rowId !== null && next ? distBetween(p, next) : null
                return (
                  <Fragment key={p.id}>
                    {renderChip(p, dayISO, rowId, conflicts.has(p.id))}
                    {km !== null && (
                      <div
                        className="project-cal-board-dist"
                        title={`Fahrstrecke ${p.object_address} → ${next.object_address}`}
                      >
                        ↓ {km.toLocaleString('de-CH', { maximumFractionDigits: 1 })} km
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="project-cal-board">
      <div className="project-cal-board-row project-cal-board-header">
        <div className="project-cal-board-staff">Monteur</div>
        {days.map(d => {
          const holidayName = holidays.get(toDateStr(d))
          return (
            <div key={toDateStr(d)} className={`project-cal-board-day-head${isToday(d) ? ' today' : ''}`}>
              <span className="project-cal-week-day-wd">{d.toLocaleDateString('de-CH', { weekday: 'short' })}</span>{' '}
              <span className="project-cal-week-day-num">{d.getDate()}.{d.getMonth() + 1}.</span>
              {holidayName && <div className="project-cal-week-day-holiday">{holidayName}</div>}
            </div>
          )
        })}
      </div>
      {rowStaff.map(s => renderRow(s.id, s.name))}
      {hasUnassigned && renderRow(null, 'Ohne Monteur')}
      {rowStaff.length === 0 && !hasUnassigned && (
        <div className="admin-empty">Keine Monteure sichtbar.</div>
      )}
    </div>
  )
}

// ─── Agenda-Ansicht (Mobile) ────────────────────────────────────────────────
// Vertikale Wochen-Agenda: Tage untereinander, Einsätze als Karten. Ersetzt auf
// dem Handy das Zeitraster (dessen Drag&Drop/Aufziehen auf Touch nicht geht).
// Verschieben passiert über das Bearbeitungs-Panel (Tap → onSelect), neue
// Einsätze über den +-Button im Tag-Header (Default-Slot 08:00–09:00).
function AgendaView({
  projects, staff, fields, currentDate, onSelect, onOpenProject, onCreateSlot, holidays,
}: {
  projects: CalendarEntry[]
  staff: StaffLite[]
  fields?: Record<string, boolean>
  currentDate: Date
  onSelect: (p: Project) => void
  onOpenProject?: (p: Project) => void
  onCreateSlot?: (dayISO: string, startTime: string, endTime: string) => void
  holidays: Map<string, string>
}) {
  const days = getWeekDays(currentDate)
  const projectsByDay: CalendarEntry[][] = days.map(d => projects.filter(p => projectCoversDay(p, d)))
  return (
    <div className="project-cal-agenda">
      {days.map((day, i) => {
        const dayISO = toDateStr(day)
        const holiday = holidays.get(dayISO)
        const dayProjects = projectsByDay[i]
        return (
          <div key={dayISO} className="project-cal-agenda-day">
            <div className={`project-cal-agenda-day-head${isToday(day) ? ' today' : ''}`}>
              <span>{day.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
              {holiday && <span className="project-cal-week-day-holiday">{holiday}</span>}
              {onCreateSlot && (
                <button
                  type="button"
                  className="project-cal-agenda-add"
                  onClick={() => onCreateSlot(dayISO, '08:00', '09:00')}
                  aria-label="Einsatz hinzufügen"
                >+</button>
              )}
            </div>
            {dayProjects.length === 0 ? (
              <div className="project-cal-agenda-empty">–</div>
            ) : dayProjects.map(p => {
              const extra = pillExtraLines(p, staff, fields)
              const crew = crewMembers(p, staff)
              return (
                <div
                  key={p.id}
                  className={`project-cal-agenda-event${pillClass(p)}`}
                  style={{ background: pillBg(p) }}
                  onClick={() => onSelect(p)}
                  {...openBinding(p, onOpenProject)}
                >
                  <span className="project-cal-agenda-event-time">{fmtTimeRange(p) || 'Ganztägig'}</span>
                  <strong>{kindSymbol(p) ? `${kindSymbol(p)} ` : ''}{p.termin_badge ? `${p.termin_badge} · ` : ''}{entryTitle(p)}</strong>
                  {crew.length > 0 && (
                    <span className="project-cal-agenda-event-sub">
                      {crew.map((m, k) => (
                        <span key={m.id}>
                          {k > 0 && ', '}
                          <span className={m.lead ? 'schedule-lead-chip' : undefined}>{m.name}</span>
                        </span>
                      ))}
                    </span>
                  )}
                  {extra.map((line, j) => <span key={j} className="project-cal-agenda-event-sub">{line}</span>)}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

// Gewählte Zoom-Stufe der Zeitraster. Reine Anzeige-Vorliebe pro Browser —
// bewusst localStorage statt Tenant-Config, weil sie vom Bildschirm abhängt.
// Wochenraster (Zeilenhöhe) und Tagesplan (Stundenbreite) haben eigene Stufen
// und darum eigene Keys. Beide müssen in storageMigrations.isKnownKey stehen,
// sonst räumt der Schema-Wechsel sie als Legacy-Müll weg.
const ZOOM_KEY = 'schedule-week-zoom'
const GANTT_ZOOM_KEY = 'schedule-gantt-zoom'
// Sichtbarer Zeitraum des Tagesplans (1 / 3 / 5 Tage) — gleiche Logik wie der
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
  onVisibleWeekChange, onVisibleStaffChange, schedulingConfig,
}: Props) {
  const [viewMode, setViewMode] = useState<SchedulingViewKey>('month')
  const isMobile = useIsMobile()
  const fields = schedulingConfig?.fields
  const greyAfter = schedulingConfig?.grey_after
  const greyUntil = schedulingConfig?.grey_until
  // Tenant-schaltbare Ansichten: fehlender Key = an (Default). Liegt die aktuell
  // gewählte Ansicht ausserhalb der erlaubten, greift die erste erlaubte —
  // abgeleitet statt per Effect, damit auch die async nachladende Config sofort wirkt.
  const viewEnabled = (k: SchedulingViewKey) => schedulingConfig?.views?.[k] !== false
  const availableViews = SCHEDULING_VIEWS.filter(v => viewEnabled(v.key))
  const view: SchedulingViewKey = viewEnabled(viewMode) ? viewMode : (availableViews[0]?.key ?? 'month')
  // Einsatz-Art-Farben als scoped CSS-Variablen (--kind-*) auf dem Kalender-Root.
  const kindColorVars: React.CSSProperties = {}
  for (const [k, v] of Object.entries(schedulingConfig?.colors || {})) {
    ;(kindColorVars as Record<string, string>)[`--kind-${k}`] = v
  }
  const [currentDate, setCurrentDate] = useState(new Date())
  const [zoom, setZoom] = useState(readZoom)
  const [ganttZoom, setGanttZoom] = useState(readGanttZoom)
  // Sichtbare Tage im Tagesplan (1 / 3 / 5), pro Browser gemerkt.
  const [ganttSpan, setGanttSpan] = useState<number>(readGanttSpan)
  const [hiddenStaff, setHiddenStaff] = useState<Set<string>>(new Set())

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
  const visibleProjects = projects.filter(p => {
    // Mitarbeiteransicht: nur Einsätze des fokussierten Mitarbeiters — als
    // Monteur zugewiesen oder als Projektleiter verantwortlich.
    if (view === 'staff') {
      if (!focusedStaff) return false
      return (p.monteur_ids?.includes(focusedStaff.id) ?? false) || p.projektleiter_id === focusedStaff.id
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
  // Der Tagesplan navigiert in seinem eigenen Zeitraum (1/3/5 Tage), nicht wochenweise.
  const ganttNav = view === 'gantt' && !isMobile

  function stepDays(days: number) {
    setCurrentDate(d => addDays(d, days))
  }

  function handlePrev() {
    if (monthNav) setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    else if (ganttNav) stepDays(-ganttSpan)
    else stepDays(-7)
  }

  function handleNext() {
    if (monthNav) setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
    else if (ganttNav) stepDays(ganttSpan)
    else stepDays(7)
  }

  // Neuer Termin aus dem Zeitraster: in der Mitarbeiteransicht ist der aktuell
  // fokussierte Mitarbeiter automatisch vorausgewählt, sonst kein Monteur.
  function handleCreateSlot(dayISO: string, startTime: string, endTime: string) {
    const monteurId = view === 'staff' ? focusedStaff?.id ?? null : null
    onCreateSlot?.(dayISO, startTime, endTime, monteurId)
  }

  const title = monthNav
    ? currentDate.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })
    : ganttNav
    ? (() => {
        const from = currentDate.toLocaleDateString('de-CH', {
          weekday: 'short', day: '2-digit', month: '2-digit', year: ganttSpan > 1 ? undefined : 'numeric',
        })
        if (ganttSpan === 1) return from
        const last = addDays(currentDate, ganttSpan - 1)
        return `${from} – ${last.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}`
      })()
    : (() => {
        const days = getWeekDays(currentDate)
        const from = days[0].toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
        const to = days[6].toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
        return `${from} – ${to}`
      })()

  return (
    <div style={kindColorVars}>
      <div className="absence-cal-toolbar">
        <div style={{ display: 'flex', gap: 6 }}>
          {isMobile ? (
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

      {!loading && view === 'staff' && staff.length > 0 && (
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

      {!loading && view !== 'staff' && staff.length > 0 && (
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
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && !isMobile && (view === 'week' || view === 'staff' || view === 'gantt') && (
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

      {loading ? (
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
        />
      ) : view === 'gantt' ? (
        <ProjectScheduleGantt
          projects={visibleProjects}
          staff={staff}
          rowStaff={hiddenStaff.size > 0 ? staff.filter(s => !hiddenStaff.has(s.id)) : staff}
          fields={fields}
          currentDate={currentDate}
          span={ganttSpan}
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
        />
      )}

      {/* Die Karte bringt ihre eigene Legende mit (Farbskala, Gewichtung) —
          zwei Legenden übereinander sind Lärm. */}
      {!loading && !isMobile && view !== 'map' && <CalendarLegend canton={canton} />}
      {!loading && isMobile && (
        <div className="project-cal-agenda-hint">
          Einsatz antippen zum Bearbeiten, <strong>+</strong> für neuen Einsatz.
        </div>
      )}
    </div>
  )
}

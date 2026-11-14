// Wochenansicht der Einsatzplanung (Zeitraster: Stunden links, Tage als Spalten).
// Seit Charge M4d (Spec refactoring-wachstum.md §17) eigene Datei; vorher Teil von
// ProjectScheduleCalendar.tsx. Unverändert verschoben.
import { useRef, useState } from 'react'
import type { ScheduleProject } from '../../api/admin/projects'
import type { ScheduleAbsence } from '../../api/admin/scheduling'
import { getWeekDays, toDateStr, isToday, diffDays, hhmmToMin, minToHHMM } from '../utils/calendarHelpers'
import { computeWeekHours, computeLanes, laneStyle, tileLayout, timeOffsetPx, timedBlockHeightPx, yToSnappedTime, WEEK_SNAP_MIN, type TileLayout } from '../utils/weekGrid'
import { absenceEntryLookup, absencesOnDay, type DayAbsence, entryTitle, fmtTime, fmtTimeRange, kindSymbol, pillBg, pillClass, pillExtraLines, projectCoversDay, readDragPayload, setDragPayload, useHoverCard, visibleWeekDays, type CalendarEntry, type StaffLite } from './scheduleShared'
import EventHoverCard from './EventHoverCard'
import CrewChips from './CrewChips'
import { openBinding } from './scheduleCalendarHelpers'
import { AbsenceChips } from './scheduleCalendarParts'

// ─── Week View (Zeitraster: Stunden links, Tage als Spalten) ─────────────────
// Rasterlogik (Zeitbereich, Zoom, Kachelhöhen, Lanes, Zeilen-Budget) liegt in
// utils/weekGrid.ts — hier bleibt nur das Rendern.

export function WeekView({
  projects, staff, fields, currentDate, onSelect, onOpenProject, onReschedule, onCreateSlot, holidays,
  greyAfter, greyUntil, hourHeight, absences, absenceStaff, staffMode = false, hideWeekend = false,
}: {
  projects: CalendarEntry[]
  staff: StaffLite[]
  fields?: Record<string, boolean>
  currentDate: Date
  onSelect: (p: ScheduleProject) => void
  onOpenProject?: (p: ScheduleProject) => void
  onReschedule: (id: string, deltaDays: number, startTime?: string | null) => void
  onCreateSlot?: (dayISO: string, startTime: string, endTime: string) => void
  holidays: Map<string, string>
  // Nicht-Arbeitszeit-Fenster: ab greyAfter grau ('' = aus), bis greyUntil
  // ('' = bis Rasterende). Nur Werktage, rein visuell.
  greyAfter?: string
  greyUntil?: string
  // Zeilenhöhe pro Stunde in px (Zoom-Stufe).
  hourHeight: number
  absences?: ScheduleAbsence[]
  // Wessen Abwesenheit gezeigt wird: die sichtbaren Mitarbeiter, in der
  // Mitarbeiter-Ansicht nur der fokussierte.
  absenceStaff: StaffLite[]
  // Mitarbeiter-Ansicht: die Spalte eines Abwesenheitstags wird zusätzlich
  // schraffiert — der Plan gehört genau dieser einen Person.
  staffMode?: boolean
  // Sa/So ausblenden (WW-56).
  hideWeekend?: boolean
}) {
  const days = visibleWeekDays(getWeekDays(currentDate), hideWeekend)
  const absentOn = absenceEntryLookup(absences ?? [])
  const absentByDay: DayAbsence[][] = days.map(d => absencesOnDay(absentOn, absenceStaff, toDateStr(d)))
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
        <CrewChips entry={p} staff={staff} className="project-cal-week-event-crew" />
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
    const extra = pillExtraLines(p, staff, fields, { plKuerzel: true })
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
            <CrewChips entry={p} staff={staff} className="project-cal-week-event-crew" />
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
    // --cal-days: Spaltenzahl der drei Raster (admin.css), 5 ohne Wochenende.
    <div className="project-cal-week" style={{ '--cal-days': days.length } as React.CSSProperties}>
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

      {/* Abwesend-Zeile: genehmigte Absenzen der Woche (§7). Nur wenn es welche gibt. */}
      {absentByDay.some(list => list.length > 0) && (
        <div className="project-cal-week-allday-row project-cal-week-absent-row">
          <div className="project-cal-week-allday-label">Abwesend</div>
          {days.map((d, i) => (
            <div key={i} className={`project-cal-week-allday-cell${absentByDay[i].length ? ' absent' : ''}${absentByDay[i].some(a => a.vacation) ? ' vacation' : ''}`}>
              <AbsenceChips list={absentByDay[i]} withName={!staffMode} />
            </div>
          ))}
        </div>
      )}

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
                className={
                  `project-cal-week-allday-cell${hoverDayISO === dayISO ? ' project-cal-drop-hover' : ''}` +
                  // Ganztägiges «Büro» am Ferientag tritt zurück (WW-59).
                  `${staffMode && absentByDay[i].some(a => a.vacation) ? ' vacation' : ''}`
                }
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
              className={
                `project-cal-week-day-col${dropPreview?.dayISO === dayISO ? ' project-cal-drop-hover' : ''}` +
                `${onCreateSlot ? ' creatable' : ''}${staffMode && absentByDay[i].length ? ' absent' : ''}` +
                // Mitarbeiter-Ansicht: ein Ferientag wird grün, seine Einsätze blass (WW-59).
                `${staffMode && absentByDay[i].some(a => a.vacation) ? ' vacation' : ''}`
              }
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

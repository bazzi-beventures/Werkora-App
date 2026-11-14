// Monatsansicht der Einsatzplanung.
// Seit Charge M4d (Spec refactoring-wachstum.md §17) eigene Datei; vorher Teil von
// ProjectScheduleCalendar.tsx. Unverändert verschoben.
import { useState } from 'react'
import type { ScheduleProject } from '../../api/admin/projects'
import type { ScheduleAbsence } from '../../api/admin/scheduling'
import { getMonthDays, toDateStr, isToday, diffDays } from '../utils/calendarHelpers'
import { absenceEntryLookup, absencesOnDay, kindSymbol, pillBg, pillClass, pillExtraLines, projectCoversDay, readDragPayload, setDragPayload, useHoverCard, type CalendarEntry, type StaffLite } from './scheduleShared'
import EventHoverCard from './EventHoverCard'
import { pillLabel, openBinding } from './scheduleCalendarHelpers'

// ─── Month View ───────────────────────────────────────────────────────────────

export function MonthView({
  projects, staff, fields, currentDate, onSelect, onOpenProject, onReschedule, holidays,
  absences, absenceStaff,
}: {
  projects: CalendarEntry[]
  staff: StaffLite[]
  fields?: Record<string, boolean>
  currentDate: Date
  onSelect: (p: ScheduleProject) => void
  onOpenProject?: (p: ScheduleProject) => void
  onReschedule: (id: string, deltaDays: number, startTime?: string | null) => void
  holidays: Map<string, string>
  absences?: ScheduleAbsence[]
  // Wessen Abwesenheit zählt (sichtbare Mitarbeiter bzw. der fokussierte).
  absenceStaff: StaffLite[]
}) {
  const absentOn = absenceEntryLookup(absences ?? [])
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
          // Monatskacheln sind zu klein für Bänder — ein Marker je Tag, die
          // Namen im title.
          const absent = absencesOnDay(absentOn, absenceStaff, dayISO)

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
              {absent.length > 0 && (
                <div
                  className="project-cal-month-absent"
                  title={absent.map(a => `${a.staff.name}: ${a.label}`).join('\n')}
                >{absent.length} abwesend</div>
              )}
              {dayProjects.map((p, j) => {
                const extra = pillExtraLines(p, staff, fields, { plKuerzel: true })
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

// Agenda-Ansicht der Einsatzplanung (Mobile).
// Seit Charge M4d (Spec refactoring-wachstum.md §17) eigene Datei; vorher Teil von
// ProjectScheduleCalendar.tsx. Unverändert verschoben.
import type { ScheduleProject } from '../../api/admin/projects'
import type { ScheduleAbsence } from '../../api/admin/scheduling'
import { getWeekDays, toDateStr, isToday } from '../utils/calendarHelpers'
import { absenceEntryLookup, absencesOnDay, entryTitle, fmtTimeRange, kindSymbol, pillBg, pillClass, pillExtraLines, projectCoversDay, type CalendarEntry, type StaffLite } from './scheduleShared'
import CrewChips from './CrewChips'
import { openBinding } from './scheduleCalendarHelpers'
import { AbsenceChips } from './scheduleCalendarParts'

// ─── Agenda-Ansicht (Mobile) ────────────────────────────────────────────────
// Vertikale Wochen-Agenda: Tage untereinander, Einsätze als Karten. Ersetzt auf
// dem Handy das Zeitraster (dessen Drag&Drop/Aufziehen auf Touch nicht geht).
// Verschieben passiert über das Bearbeitungs-Panel (Tap → onSelect), neue
// Einsätze über den +-Button im Tag-Header (Default-Slot 08:00–09:00).
export function AgendaView({
  projects, staff, fields, currentDate, onSelect, onOpenProject, onCreateSlot, holidays,
  absences, absenceStaff, staffMode = false,
}: {
  projects: CalendarEntry[]
  staff: StaffLite[]
  fields?: Record<string, boolean>
  currentDate: Date
  onSelect: (p: ScheduleProject) => void
  onOpenProject?: (p: ScheduleProject) => void
  onCreateSlot?: (dayISO: string, startTime: string, endTime: string) => void
  holidays: Map<string, string>
  absences?: ScheduleAbsence[]
  absenceStaff: StaffLite[]
  staffMode?: boolean
}) {
  const days = getWeekDays(currentDate)
  const projectsByDay: CalendarEntry[][] = days.map(d => projects.filter(p => projectCoversDay(p, d)))
  const absentOn = absenceEntryLookup(absences ?? [])
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
            <AbsenceChips list={absencesOnDay(absentOn, absenceStaff, dayISO)} withName={!staffMode} />
            {dayProjects.length === 0 ? (
              <div className="project-cal-agenda-empty">–</div>
            ) : dayProjects.map(p => {
              const extra = pillExtraLines(p, staff, fields, { plKuerzel: true })
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
                  {/* Kürzel wie im Tagesplan (§4) — die vollen Namen stehen im Bearbeitungs-Panel. */}
                  <CrewChips entry={p} staff={staff} className="project-cal-agenda-event-crew" />
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

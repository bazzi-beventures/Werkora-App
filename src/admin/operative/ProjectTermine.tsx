// Spalte «Termine» der Projektliste (docs/specs/projektliste-termine-team.md §2.1):
// die offenen Termine eines Projekts, aufsteigend, höchstens drei — darüber «+N».
// Je Termin «wann · was» in denselben Formaten wie die Terminkarte der
// Projektmaske, dazu die Kürzel-Chips des wirksamen Teams (CrewChips, dieselbe
// Darstellung wie in der Einsatzplanung). Die vollen Namen stehen im Tooltip.
//
// Ein Klick auf einen Termin springt in die Einsatzplanung auf dessen Woche
// (onOpenSchedule, derselbe Weg wie «In Einsatzplanung zeigen» der Projektmaske)
// — und öffnet NICHT die Projektmaske, die der Klick auf die Zeile sonst öffnet.

import type { ProjectUpcomingAppointment } from '../../api/admin/projects'
import CrewChips from './CrewChips'
import { nextAppointmentSummary } from './projectAppointments'
import { crewMembers, type StaffLite } from './scheduleShared'

/** Tooltip: alle gezeigten Termine mit vollen Namen, eine Zeile je Termin. */
export function termineTitle(appts: ProjectUpcomingAppointment[], staff: StaffLite[], total: number): string {
  const lines = appts.map(a => {
    const n = nextAppointmentSummary(a)
    const names = crewMembers(a, staff).map(m => m.name).join(', ')
    return `${n.when} · ${n.what}${names ? ` — ${names}` : ''}`
  })
  if (total > appts.length) lines.push(`… und ${total - appts.length} weitere`)
  return lines.join('\n')
}

export default function ProjectTermine({ appointments, total, staff, onOpenSchedule, compact = false }: {
  appointments: ProjectUpcomingAppointment[]
  total: number
  staff: StaffLite[]
  onOpenSchedule?: (date: string) => void
  /** Handy-Karte: nur der nächste Termin, eine Zeile. */
  compact?: boolean
}) {
  if (appointments.length === 0) {
    return compact ? null : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
  }
  const shown = compact ? appointments.slice(0, 1) : appointments
  const more = total - shown.length
  return (
    <div className="projektliste-termine" title={termineTitle(appointments, staff, total)}>
      {shown.map(a => {
        const n = nextAppointmentSummary(a)
        const inhalt = (
          <>
            <span>{n.when}</span>
            <span style={{ color: 'var(--muted)' }}> · {n.what}</span>
            <CrewChips entry={a} staff={staff} className="schedule-crew projektliste-termine-crew" />
          </>
        )
        return onOpenSchedule ? (
          <button
            key={a.id}
            type="button"
            className="projektliste-termin"
            aria-label={`${n.when} ${n.what} in der Einsatzplanung zeigen`}
            onClick={e => { e.stopPropagation(); onOpenSchedule(a.start_date.slice(0, 10)) }}
          >
            {inhalt}
          </button>
        ) : (
          <div key={a.id} className="projektliste-termin">{inhalt}</div>
        )
      })}
      {more > 0 && <div className="projektliste-termine-mehr">+{more}</div>}
    </div>
  )
}

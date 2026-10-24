// Kürzel-Chips des Termin-Teams — EINE Darstellung für Tagesplan, Wochenraster,
// Mitarbeiter-Ansicht und mobile Agenda (docs/specs/einsatzplanung-rueckmeldungen-2026-10.md §4).
// Bis 2026-10 hatte nur der Tagesplan sie; die Mitarbeiter-Ansicht zeigte gar
// keine Crew, die Agenda volle Namen. Lead rot, übriges Team weiss (CSS
// .schedule-crew-chip), gedeckelt über crewShortLabels — die vollen Namen
// stehen in der Hover-Karte.

import { crewShortLabels, type StaffLite } from './scheduleShared'
import type { Project } from '../../api/admin/projects'

export default function CrewChips({ entry, staff, className = 'schedule-crew' }: {
  // Nur das Team zählt — so passt neben einem Kalender-Eintrag auch ein Termin
  // der Projektliste (ProjectUpcomingAppointment) hinein.
  entry: Pick<Project, 'monteur_ids'>
  staff: StaffLite[]
  className?: string
}) {
  const crew = crewShortLabels(entry, staff)
  if (crew.length === 0) return null
  return (
    <span className={className}>
      {crew.map((c, i) => (
        <span
          // Index statt Label: zwei Mitarbeiter können dieselben Initialen haben.
          key={i}
          className={`schedule-crew-chip${c.lead ? ' lead' : ''}`}
          title={c.lead ? 'Lead-Monteur' : undefined}
        >{c.label}</span>
      ))}
    </span>
  )
}

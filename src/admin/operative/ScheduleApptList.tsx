// Termin-Liste des Projekts im Planungs-Panel («+ Termin», je Termin eine Zeile mit
// Serien-Marke und Entfernen). Seit Charge M4c (Spec refactoring-wachstum.md §17)
// eigene Komponente; vorher Teil von ProjectScheduleScreen.tsx.
import { APPOINTMENT_KIND_LABELS, type ProjectAppointment } from '../../api/admin'
import { fmtApptRow } from './scheduleScreenModel'

interface Props {
  appointments: ProjectAppointment[]
  /** Termin, der gerade im Editor offen ist (hervorgehoben). */
  activeId: string | null | undefined
  /** Editor offen (auch für einen neuen Termin) — dann kein «Noch keine Termine». */
  editorOffen: boolean
  onNew: () => void
  onSelect: (a: ProjectAppointment) => void
  onDelete: (a: ProjectAppointment) => void
}

export function ScheduleApptList({ appointments, activeId, editorOffen, onNew, onSelect, onDelete }: Props) {
  return (
    <div className="project-schedule-field">
      <div className="project-schedule-field-head">
        <span>Termine</span>
        <button
          type="button"
          className="project-schedule-mini-btn"
          onClick={onNew}
        >
          + Termin
        </button>
      </div>
      {appointments.length === 0 && !editorOffen && (
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>Noch keine Termine geplant.</div>
      )}
      {appointments.map(a => (
        <div
          key={a.id}
          className={`project-schedule-appt-row${activeId === a.id ? ' active' : ''}`}
          onClick={() => onSelect(a)}
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
            onClick={e => { e.stopPropagation(); onDelete(a) }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

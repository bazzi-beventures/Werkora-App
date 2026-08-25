import { BeschaffungStep, beschaffungStep, daysSince } from '../../constants/beschaffungSteps'
import { ProjectStatus, PROJECT_STATUS_LABELS, PROJECT_STATUS_BADGE } from '../../constants/statuses'
import { fmtDate } from '../../utils/format'
import type { Project } from '../../../api/admin/projects'

// Kopfzeile des Projekt-Details (Charge H, H3): Name, Projektnummer, Status und
// — falls das Feature laeuft — der Beschaffungsschritt. Der klebt bewusst oben
// (sticky): beim Scrollen durch die lange Maske muss sichtbar bleiben, in
// welchem Projekt und in welchem Zustand man gerade arbeitet.

export function ProjectDetailHeader({
  project, isNew, status, beschaffungSteps, beschaffung, beschaffungAt, beschaffungSource, onBack,
}: {
  project: Project | null
  isNew: boolean
  status: ProjectStatus
  /** Leer = Feature «beschaffungsstatus» aus, dann faellt das Badge ganz weg. */
  beschaffungSteps: BeschaffungStep[]
  beschaffung: string | null
  beschaffungAt: string | null
  /** 'auto' = beim Datei-Upload gesetzt; erklaert das Badge im Tooltip. */
  beschaffungSource: string | null
  onBack: () => void
}) {
  return (
      <div
        className="admin-page-header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'var(--bg, #0c2840)',
          margin: '-28px -32px 24px',
          padding: '20px 32px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <div className="admin-page-title">{isNew ? 'Neues Projekt' : project?.name}</div>
          <div className="admin-page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {isNew ? 'Projektnummer wird nach dem Speichern automatisch vergeben' : (
              <>
                {project?.project_id_text && (
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    Projekt-Nr. {project.project_id_text}
                  </span>
                )}
                <span className={`admin-badge ${PROJECT_STATUS_BADGE[status]}`} style={{ fontSize: 12 }}>
                  {PROJECT_STATUS_LABELS[status]}
                </span>
                {/* Beschaffungsschritt direkt neben dem Lebenszyklus-Status: die Frage
                    "wo stehe ich?" muss beim Öffnen beantwortet sein, nicht erst nach
                    einem Klick in den vierten Reiter. Gesetzt wird er dort, gezeigt hier. */}
                {!!beschaffungSteps.length && beschaffungStep(beschaffung) && (
                  <span
                    className={`admin-badge ${beschaffungStep(beschaffung)!.badge}`}
                    style={{ fontSize: 12 }}
                    title={
                      beschaffungSource === 'auto'
                        ? 'Automatisch beim Datei-Upload gesetzt — im Reiter Lieferantendokumente änderbar'
                        : 'Im Reiter Lieferantendokumente änderbar'
                    }
                  >
                    {beschaffungStep(beschaffung)!.label}
                    {(() => {
                      const d = daysSince(beschaffungAt)
                      return d !== null ? ` · seit ${d} Tag${d === 1 ? '' : 'en'}` : ''
                    })()}
                  </span>
                )}
                {project?.created_at && (
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Eröffnet am {fmtDate(project.created_at)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={onBack}>← Zurück</button>
      </div>
  )
}

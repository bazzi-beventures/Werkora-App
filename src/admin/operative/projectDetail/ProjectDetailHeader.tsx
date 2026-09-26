import { BeschaffungStep, beschaffungStep, daysSince } from '../../constants/beschaffungSteps'
import { ProjectStatus, PROJECT_STATUS_LABELS, PROJECT_STATUS_BADGE } from '../../constants/statuses'
import { fmtDate } from '../../utils/format'
import type { Project, RepairCaseRef, RepairProjectRef, WarrantyInfo } from '../../../api/admin/projects'
import { parseIsoDate, warrantyBadge } from '../../../shared/warranty'

// Kopfzeile des Projekt-Details (Charge H, H3): Name, Projektnummer, Status und
// — falls das Feature laeuft — der Beschaffungsschritt. Der klebt bewusst oben
// (sticky): beim Scrollen durch die lange Maske muss sichtbar bleiben, in
// welchem Projekt und in welchem Zustand man gerade arbeitet.
//
// Dazu die zwei Angaben aus der Garantie-Spec (docs/specs/garantiefall.md): der
// Frist-Vermerk und, bei einer Reparatur, der Rueckverweis auf den Auftrag, aus
// dem sie stammt. Beide gehoeren hierher und nicht in einen Reiter: wer den
// Kunden am Telefon hat, muss «ist das noch Garantie?» beantworten koennen,
// ohne zu suchen.

const BADGE_CLASS: Record<'ok' | 'warn' | 'muted', string> = {
  ok: 'admin-badge-approved',
  warn: 'admin-badge-open',
  muted: 'admin-badge-closed',
}

export function ProjectDetailHeader({
  project, isNew, status, beschaffungSteps, beschaffung, beschaffungAt, beschaffungSource,
  warranty, repairProjects, repairCase = null, onOpenProject, onBack,
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
  /** Fristauskunft des Servers; null = Feature aus oder noch nicht geladen. */
  warranty: WarrantyInfo | null
  /** Nacharbeiten, die auf dieses Projekt verweisen. */
  repairProjects: RepairProjectRef[]
  /** Am Reparatur-Projekt: der Garantiefall, aus dem es entstand (Modul «warranty»). */
  repairCase?: RepairCaseRef | null
  /** Sprung in ein anderes Projekt (Referenz oder Nacharbeit). */
  onOpenProject?: (id: string) => void
  onBack: () => void
}) {
  // `parseIsoDate` und nicht `new Date(...)`: der Server schickt 'YYYY-MM-DD',
  // und `new Date('2028-03-14')` liest UTC-Mitternacht — westlich von Greenwich
  // stuende im Kopf ein anderer Tag als in der Projektliste, die denselben
  // Parser benutzt.
  const badge = warranty
    ? warrantyBadge({
        state: warranty.state,
        deadlineAt: parseIsoDate(warranty.deadline_at),
        expiryAt: parseIsoDate(warranty.expiry_at),
      })
    : null
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
                {badge && (
                  <span
                    className={`admin-badge ${BADGE_CLASS[badge.tone]}`}
                    style={{ fontSize: 12 }}
                    title={
                      warranty?.anchor_kind === 'rechnung'
                        ? 'Frist ab dem Datum der ersten gesendeten Rechnung'
                        : 'Frist ab der Abnahme (Projektabschluss)'
                    }
                  >
                    {badge.text}
                  </span>
                )}
                {project?.parent_project_id && onOpenProject && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary admin-btn-sm"
                    onClick={() => onOpenProject(project.parent_project_id!)}
                    style={{ fontSize: 12 }}
                  >
                    {/* Spec §6.1: «Garantiefall G-217 zu <Ursprung>» statt des
                        schlichten Verweises, wenn ein Fall dahintersteht. */}
                    {repairCase ? `↑ Garantiefall G-${repairCase.case_no} · Ursprungsprojekt` : '↑ Ursprungsprojekt'}
                  </button>
                )}
                {repairProjects.length > 0 && onOpenProject && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                    Nacharbeiten:
                    {repairProjects.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        onClick={() => onOpenProject(r.id)}
                        style={{ fontSize: 12 }}
                        title={r.is_warranty ? 'Als Garantiefall erfasst' : 'Verrechenbare Reparatur'}
                      >
                        {r.is_warranty ? '🛡 ' : ''}{r.project_id_text || r.name}
                      </button>
                    ))}
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

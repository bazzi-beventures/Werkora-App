import { ProjectStatus } from '../../constants/statuses'
import { VerlaufPanel } from './VerlaufPanel'
import { useProjectHistory } from './useProjectHistory'

// Der Reiter «Status» (Charge H, H3): Lebenszyklus des Projekts —
// abschliessen, wiedereroeffnen, archivieren, reaktivieren.
//
// Seit dem Projekt-Verlauf (docs/specs/projekt-verlauf.md) traegt der Reiter
// zwei Abschnitte: links die Knoepfe wie bisher, rechts die Chronik. Sie sitzt
// hier statt in einem eigenen Reiter, weil «wie ist dieses Projekt dorthin
// gekommen, wo es steht» dieselbe Frage ist wie «wo steht es» — nur rueckwaerts
// gelesen. Ein elfter Reiter waere dauerhaft weniger Uebersicht fuer alle
// gewesen, zugunsten eines Klicks fuer einen.
//
// Der Hook haengt bewusst HIER und nicht im Screen: der Reiter wird nur
// gerendert, wenn er offen ist — damit laedt die Chronik genau dann, und nicht
// bei jedem Oeffnen eines Projekts.

export function StatusTab({
  status, settingStatus, reopening, onClose, onReopen, onArchive, onReactivate,
  projectId, verlaufEnabled = false,
}: {
  status: ProjectStatus
  /** Abschliessen/Archivieren laeuft */
  settingStatus: boolean
  /** Wiedereroeffnen/Reaktivieren laeuft */
  reopening: boolean
  onClose: () => void
  onReopen: () => void
  onArchive: () => void
  onReactivate: () => void
  /** Fuer den Verlauf; ohne id wird nichts geladen. */
  projectId?: string | null
  /** Feature «projekt_verlauf» — aus heisst: kein Abschnitt, kein Abruf. */
  verlaufEnabled?: boolean
}) {
  const isClosed = status === 'abgeschlossen'
  const isArchived = status === 'archiviert'
  const verlauf = useProjectHistory(projectId, verlaufEnabled)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 20 }}>
        <div className="admin-table-wrap" style={{ padding: 20, width: 360, maxWidth: '100%' }}>
          <div className="admin-section-title">Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {!isClosed && !isArchived && (
              <button
                type="button"
                disabled={settingStatus}
                className="admin-btn admin-btn-danger"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={onClose}
              >
                Abschliessen
              </button>
            )}
            {isClosed && (
              <button
                type="button"
                disabled={reopening}
                className="admin-btn admin-btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={onReopen}
              >
                Wiedereröffnen
              </button>
            )}
            {!isArchived && (
              <button
                type="button"
                disabled={settingStatus}
                className="admin-btn admin-btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={onArchive}
              >
                Archivieren
              </button>
            )}
            {isArchived && (
              <button
                type="button"
                disabled={reopening}
                className="admin-btn admin-btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={onReactivate}
              >
                Reaktivieren
              </button>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14 }}>
            {isArchived
              ? 'Archivierte Projekte sind aus Dashboard und Kennzahlen ausgeblendet – inkl. ihrer Offerten und Rechnungen. Reaktivieren macht das rückgängig.'
              : 'Abgeschlossene Projekte werden für Mitarbeiter ausgeblendet. Archivieren nimmt das Projekt zusätzlich aus Dashboard und Kennzahlen (reversibel).'}
          </p>
        </div>
        {verlaufEnabled && (
          <VerlaufPanel history={verlauf.history} loading={verlauf.loading} failed={verlauf.failed} />
        )}
    </div>
  )
}

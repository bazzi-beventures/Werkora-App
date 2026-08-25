import { ProjectStatus } from '../../constants/statuses'

// Der Reiter «Status» (Charge H, H3): Lebenszyklus des Projekts —
// abschliessen, wiedereroeffnen, archivieren, reaktivieren. Bewusst nur die
// Knoepfe; was die Aktion tut, entscheidet der Screen, weil danach navigiert
// wird.

export function StatusTab({ status, settingStatus, reopening, onClose, onReopen, onArchive, onReactivate }: {
  status: ProjectStatus
  /** Abschliessen/Archivieren laeuft */
  settingStatus: boolean
  /** Wiedereroeffnen/Reaktivieren laeuft */
  reopening: boolean
  onClose: () => void
  onReopen: () => void
  onArchive: () => void
  onReactivate: () => void
}) {
  const isClosed = status === 'abgeschlossen'
  const isArchived = status === 'archiviert'
  return (
        <div className="admin-table-wrap" style={{ padding: 20, maxWidth: 360 }}>
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
  )
}

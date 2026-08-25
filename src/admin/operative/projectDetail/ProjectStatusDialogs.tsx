import { ConfirmDialog } from '../../components/ConfirmDialog'
import { countOpenInvoices, openInvoicesHint } from '../../utils/openInvoices'
import type { ProjectInvoice } from './types'

// Die Lebenszyklus-Rueckfragen des Projekts (Charge H, H3): abschliessen,
// archivieren, reaktivieren, wiedereroeffnen.
//
// «Abschliessen» gibt es zweimal, weil der Anlass zaehlt: einmal ueber den
// Status-Reiter, einmal direkt nach dem Verbuchen einer Zahlung. Der zweite
// Dialog benennt genau das und bietet «Offen lassen» an — eine Teilrechnung
// schliesst das Projekt eben nicht.

export type ProjectStatusDialog =
  | 'close' | 'closeAfterPaid' | 'archive' | 'reactivate' | 'reopen' | null

export function ProjectStatusDialogs({
  open, projectName, invoices, settingStatus, reopening,
  reopenReason, onReopenReasonChange, onDismiss, onClose, onArchive, onReopen,
}: {
  open: ProjectStatusDialog
  projectName: string
  /** Fuer den Hinweis auf noch offene Rechnungen beim Abschliessen. */
  invoices: ProjectInvoice[]
  settingStatus: boolean
  reopening: boolean
  reopenReason: 'fehler' | 'garantiefall'
  onReopenReasonChange: (r: 'fehler' | 'garantiefall') => void
  onDismiss: () => void
  onClose: () => void
  onArchive: () => void
  onReopen: () => void
}) {
  return (
    <>
      {open === 'close' && (
        <ConfirmDialog
          title="Projekt abschliessen?"
          message={<>«{projectName}» wird für Mitarbeiter ausgeblendet. Berichte bleiben erhalten.</>}
          warning={openInvoicesHint(countOpenInvoices(invoices))}
          confirmLabel="Ja, abschliessen"
          busyLabel="Schliessen…"
          busy={settingStatus}
          variant="danger"
          onCancel={onDismiss}
          onConfirm={onClose}
        />
      )}

      {open === 'closeAfterPaid' && (
        <ConfirmDialog
          title="Projekt abschliessen?"
          message={<>Die Rechnung ist bezahlt. «{projectName}» wird beim Abschliessen für Mitarbeiter ausgeblendet; Rapporte und Dokumente bleiben erhalten.</>}
          warning={openInvoicesHint(countOpenInvoices(invoices))}
          cancelLabel="Offen lassen"
          confirmLabel="Ja, abschliessen"
          busyLabel="Schliessen…"
          busy={settingStatus}
          onCancel={onDismiss}
          onConfirm={onClose}
        />
      )}

      {open === 'archive' && (
        <ConfirmDialog
          title="Projekt archivieren?"
          message={<>«{projectName}» wird samt seinen Offerten und Rechnungen aus Dashboard und Kennzahlen genommen. Nichts wird gelöscht – Reaktivieren macht es rückgängig.</>}
          confirmLabel="Ja, archivieren"
          busyLabel="Archivieren…"
          busy={settingStatus}
          variant="danger"
          onCancel={onDismiss}
          onConfirm={onArchive}
        />
      )}

      {open === 'reactivate' && (
        <ConfirmDialog
          title="Projekt reaktivieren?"
          message={<>«{projectName}» wird wieder als offenes Projekt geführt und zählt wieder in Dashboard und Kennzahlen.</>}
          confirmLabel="Ja, reaktivieren"
          busyLabel="Reaktivieren…"
          busy={reopening}
          onCancel={onDismiss}
          onConfirm={onReopen}
        />
      )}

      {open === 'reopen' && (
        <ConfirmDialog
          title="Projekt wiedereröffnen?"
          message={<>Grund für die Wiedereröffnung von «{projectName}»:</>}
          confirmLabel="Wiedereröffnen"
          busyLabel="Wird geöffnet…"
          busy={reopening}
          onCancel={onDismiss}
          onConfirm={onReopen}
        >
          <div style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="reopenReason"
                  value="fehler"
                  checked={reopenReason === 'fehler'}
                  onChange={() => onReopenReasonChange('fehler')}
                />
                Fehler beim Abschluss
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="reopenReason"
                  value="garantiefall"
                  checked={reopenReason === 'garantiefall'}
                  onChange={() => onReopenReasonChange('garantiefall')}
                />
                Garantiefall <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>(Reparatur, als Garantie markiert)</span>
              </label>
          </div>
        </ConfirmDialog>
      )}
    </>
  )
}

import { useEffect } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'

interface ConfirmDialogProps {
  title: string
  message: React.ReactNode
  // Nicht blockierender Warnhinweis unter dem Text (z.B. «noch 2 Rechnungen
  // offen»). Falsy = kein Kasten, damit Aufrufer direkt einen ggf. leeren String
  // durchreichen können.
  warning?: React.ReactNode
  // Zusatzinhalt zwischen Text und Knopfzeile — für Bestätigungen mit einem
  // kleinen Eingabefeld (Zahlungsdatum, Empfänger-Mail). Damit brauchen solche
  // Dialoge kein rohes admin-confirm-overlay-Markup mehr.
  children?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  // Dritter Weg zwischen Abbrechen und Bestätigen — für Rückfragen mit zwei
  // unterschiedlichen Ja-Antworten (z.B. „nur dieser Termin" vs. „ganze Serie").
  // Ohne diese Option bauten solche Dialoge ihr Overlay-Markup selbst.
  extraAction?: {
    label: string
    onClick: () => void
    variant?: 'danger' | 'primary' | 'success'
  }
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  busyLabel?: string
  // Bestätigen zusätzlich sperren (z.B. leeres Pflichtfeld im children-Inhalt).
  confirmDisabled?: boolean
  variant?: 'danger' | 'primary' | 'success'
  // Für Dialoge mit wachsendem Inhalt (Textarea): Box scrollt statt die Knöpfe
  // aus dem Bild zu schieben.
  maxWidth?: number
  scrollable?: boolean
}

export function ConfirmDialog({
  title,
  message,
  warning,
  children,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  extraAction,
  onConfirm,
  onCancel,
  busy = false,
  busyLabel,
  confirmDisabled = false,
  variant = 'primary',
  maxWidth,
  scrollable = false,
}: ConfirmDialogProps) {
  const btnClass = (v: 'danger' | 'primary' | 'success') => v === 'danger'
    ? 'admin-btn admin-btn-danger'
    : v === 'success'
      ? 'admin-btn admin-btn-success'
      : 'admin-btn admin-btn-primary'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div
      className="admin-confirm-overlay"
      // Drag-sicher (mousedown UND click müssen auf dem Backdrop landen) —
      // eine Textauswahl im children-Feld schliesst den Dialog sonst mitten
      // in der Eingabe. Während busy schliesst der Backdrop gar nicht.
      {...backdropCloseProps(() => { if (!busy) onCancel() })}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="admin-confirm-box"
        onClick={e => e.stopPropagation()}
        style={{
          ...(maxWidth ? { maxWidth } : null),
          ...(scrollable ? { maxHeight: '90vh', overflow: 'auto' } : null),
        }}
      >
        <div className="admin-confirm-title">{title}</div>
        {message ? <div className="admin-confirm-text">{message}</div> : null}
        {warning ? <div className="admin-confirm-warning">{warning}</div> : null}
        {children}
        <div className="admin-confirm-actions">
          <button className="admin-btn admin-btn-secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          {extraAction && (
            <button
              className={btnClass(extraAction.variant ?? 'primary')}
              onClick={extraAction.onClick}
              disabled={busy}
            >
              {extraAction.label}
            </button>
          )}
          <button className={btnClass(variant)} onClick={onConfirm} disabled={busy || confirmDisabled}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

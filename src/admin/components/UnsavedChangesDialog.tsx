import { useEffect } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'

interface UnsavedChangesDialogProps {
  /** Speichern und danach die ausgelöste Aktion (Zurück/Navigation) fortsetzen. */
  onSave: () => void
  /** Änderungen wegwerfen und fortsetzen. */
  onDiscard: () => void
  /** In der Maske bleiben. */
  onCancel: () => void
  saving?: boolean
  message?: React.ReactNode
  /** Überschrift/Beschriftungen überschreiben — für Masken, in denen „Speichern"
   *  etwas anderes heisst (z. B. Offert-Entwurf behalten statt Offerte anlegen). */
  title?: string
  saveLabel?: string
  savingLabel?: string
  discardLabel?: string
  cancelLabel?: string
  /**
   * `false` blendet den Speichern-Knopf aus — dann bleiben Verwerfen und Zurück.
   * Für Masken, in denen «Speichern» nichts Sinnvolles täte: über dem Projekt-Detail
   * kann die Rapport-Maske offen sein, und die speichert dieser Dialog nicht (er
   * speicherte das Formular darunter).
   */
  allowSave?: boolean
}

/**
 * Drei-Wege-Abfrage beim Verlassen einer Maske mit ungespeicherten Änderungen.
 * ConfirmDialog reicht hier nicht: „Verwerfen" und „Speichern" sind zwei
 * verschiedene Bestätigungen, nicht Bestätigen/Abbrechen.
 */
export function UnsavedChangesDialog({
  onSave,
  onDiscard,
  onCancel,
  saving = false,
  message = 'Du hast Änderungen gemacht, die noch nicht gespeichert sind.',
  title = 'Ungespeicherte Änderungen',
  saveLabel = 'Speichern',
  savingLabel = 'Speichern…',
  discardLabel = 'Verwerfen',
  cancelLabel = 'Abbrechen',
  allowSave = true,
}: UnsavedChangesDialogProps) {
  // Drei Buttons nebeneinander passen nur, solange die Beschriftungen kurz sind:
  // von der 380px-Box bleiben nach Polstern und Abständen rund 200px für Text,
  // also grob 36 Zeichen für alle drei zusammen. Darüber — z.B. «Zurück zum
  // Formular» + «Entwurf verwerfen» + «Entwurf behalten» — ragten sie aus dem
  // Dialog heraus, weil .admin-btn weder umbricht noch schrumpft; dann stapeln
  // wir sie wie im mobilen Bottom-Sheet. savingLabel zählt mit, damit das
  // Layout beim Klick auf «Speichern» nicht umspringt. Schätzt die Regel
  // daneben, ist das Ergebnis nur weniger hübsch — herausragen kann nichts
  // mehr, das fängt flex-wrap im CSS ab.
  const labelChars =
    cancelLabel.length + discardLabel.length
    + (allowSave ? Math.max(saveLabel.length, savingLabel.length) : 0)
  const stacked = labelChars > 36

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saving, onCancel])

  return (
    <div
      className="admin-confirm-overlay"
      // Drag-sicher wie beim ConfirmDialog: ein plain onClick schloss den Dialog
      // auch, wenn eine Textauswahl ausserhalb der Box endete.
      {...backdropCloseProps(() => { if (!saving) onCancel() })}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="admin-confirm-box" onClick={e => e.stopPropagation()}>
        <div className="admin-confirm-title">{title}</div>
        <div className="admin-confirm-text">{message}</div>
        <div className={`admin-confirm-actions${stacked ? ' admin-confirm-actions-stacked' : ''}`}>
          <button className="admin-btn admin-btn-secondary" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </button>
          <button className="admin-btn admin-btn-danger" onClick={onDiscard} disabled={saving}>
            {discardLabel}
          </button>
          {allowSave && (
            <button className="admin-btn admin-btn-primary" onClick={onSave} disabled={saving}>
              {saving ? savingLabel : saveLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { sendQuoteOrderConfirmation, sendQuoteThankyou } from '../../api/admin/quotes'
import { backdropCloseProps } from '../../shared/backdropClose'
import { fmtDate } from '../utils/format'

interface BaseProps {
  quoteId: number
  header: React.ReactNode
  defaultEmail?: string
  onClose: () => void
  onSent: (message: string) => void
}

interface Props extends BaseProps {
  title: string
  sendLabel: string
  /** Optionaler Hinweis unter dem Empfängerfeld (z.B. welches Dokument mitgeht). */
  note?: string
  fallbackMessage: (email: string) => string
  send: (quoteId: number, email: string) => Promise<{ message?: string }>
}

// Gemeinsamer Versand-Dialog der Kunden-Mails zu einer Offerte (Danke-Mail,
// Auftragsbestätigung) — analog zum Offerten-Versand wird zuerst die Empfänger-Adresse
// abgefragt, vorbelegt mit der Kunden-E-Mail der Offerte. Genutzt von der Offerten-Liste
// und dem Projekt-Detail.
//
// Die beiden Mails unterscheiden sich nur in Beschriftung und Endpoint; der Ablauf
// (Adresse prüfen, senden, Backend-Fehler im Dialog zeigen, offen bleiben) ist derselbe.
export function SendQuoteMailDialog(
  { quoteId, header, defaultEmail, onClose, onSent, title, sendLabel, note, fallbackMessage, send }: Props,
) {
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSend() {
    if (!email) return
    setSending(true)
    setError('')
    try {
      const res = await send(quoteId, email)
      onSent(res.message || fallbackMessage(email))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versand fehlgeschlagen')
      setSending(false)
    }
  }

  return (
    <div className="admin-confirm-overlay" {...backdropCloseProps(() => { if (!sending) onClose() })}>
      <div className="admin-confirm-box" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="admin-confirm-title">{title}</div>
        <div className="admin-confirm-text" style={{ marginBottom: 12 }}>{header}</div>

        <div style={{ marginBottom: 12 }}>
          <label className="admin-form-label">Empfänger E-Mail</label>
          <input
            className="admin-form-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="kunde@example.com"
          />
          {note && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>{note}</div>
          )}
        </div>

        {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="admin-confirm-actions">
          <button className="admin-btn admin-btn-secondary" onClick={onClose} disabled={sending}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" onClick={handleSend} disabled={!email || sending}>
            {sending ? 'Wird gesendet…' : sendLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Danke-Mail nach Offerten-Annahme (Feature offerte_dank_mail). */
export function SendThankyouDialog(props: BaseProps) {
  return (
    <SendQuoteMailDialog
      {...props}
      title="Dankesmail senden"
      sendLabel="Dankesmail senden"
      fallbackMessage={email => `Danke-Mail an ${email} gesendet`}
      send={sendQuoteThankyou}
    />
  )
}

/**
 * Auftragsbestätigung nach Offerten-Annahme. Steht bei jeder angenommenen Offerte
 * bereit — ohne Feature-Flag (das Feature `offerte_auftragsbestaetigung` schaltet nur
 * den automatischen Versand).
 *
 * `alreadySentAt` schaltet auf den ERNEUT-Modus: der Dialog benennt den Vorgang als
 * Zweitversand, zeigt das Datum des ersten und schickt das `resend`-Flag mit. Ohne das
 * Flag lehnt das Backend eine bereits versendete Bestätigung ab — der bewusste zweite
 * Versand muss also durch diesen Dialog, ein versehentlicher Doppelklick kommt nicht
 * durch.
 */
export function SendOrderConfirmationDialog({ alreadySentAt, ...props }: BaseProps & {
  alreadySentAt?: string | null
}) {
  const isResend = !!alreadySentAt
  return (
    <SendQuoteMailDialog
      {...props}
      title={isResend ? 'Auftragsbestätigung erneut senden' : 'Auftragsbestätigung senden'}
      sendLabel={isResend ? 'Erneut senden' : 'Auftragsbestätigung senden'}
      note={isResend
        ? `Bereits gesendet am ${fmtDate(alreadySentAt)}. Der Kunde erhält dasselbe Dokument noch einmal; die Ablage beim Projekt wird überschrieben statt verdoppelt.`
        : 'Das Dokument «Auftragsbestätigung» (Inhalt der Offerte) geht als PDF mit und wird beim Projekt unter «Offerten» abgelegt.'}
      fallbackMessage={email => `Auftragsbestätigung an ${email} gesendet`}
      send={(quoteId, email) => sendQuoteOrderConfirmation(quoteId, email, isResend)}
    />
  )
}

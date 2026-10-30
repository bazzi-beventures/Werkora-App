// Dialog «Termin an Kunden senden» (WF-24, docs/specs/termin-bestaetigung-kunde.md).
//
// Gleicher Aufbau wie der Versand der Auftragsbestätigung (SendQuoteMailDialog):
// Empfänger vorbelegt mit der Kunden-E-Mail, «+ CC», Fehler bleiben im Dialog.
// Dazu eine freiwillige Mitteilung und darüber die Angaben, die der Kunde bekommt —
// wer sendet, soll sehen, was rausgeht, bevor es rausgeht.

import { useState } from 'react'
import { sendAppointmentNotice, type AppointmentNoticeResult } from '../../../api/admin'
import { backdropCloseProps } from '../../../shared/backdropClose'
import { EmailRow } from '../EmailRow'
import { AppointmentDraft, draftTitle, fmtDraftWhen } from '../projectAppointments'

const MAX_MESSAGE = 1000

export function AppointmentNoticeDialog({ draft, defaultEmail, isUpdate, objectAddress, onClose, onSent }: {
  draft: AppointmentDraft
  defaultEmail: string
  /** Seit dem Versand verschoben: die Mail heisst «Terminänderung» und ersetzt den Kalendereintrag. */
  isUpdate: boolean
  objectAddress?: string
  onClose: () => void
  onSent: (result: AppointmentNoticeResult) => void
}) {
  const [email, setEmail] = useState(defaultEmail)
  const [ccEmails, setCcEmails] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSend() {
    if (!draft.id || !email.trim()) return
    setSending(true)
    setError('')
    try {
      const result = await sendAppointmentNotice(draft.id, {
        recipient_email: email.trim(), cc_recipients: ccEmails, message: message.trim(),
      })
      onSent(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versand fehlgeschlagen')
      setSending(false)
    }
  }

  const title = isUpdate ? 'Terminänderung an Kunden senden' : 'Termin an Kunden senden'
  return (
    <div className="admin-confirm-overlay" {...backdropCloseProps(() => { if (!sending) onClose() })}>
      <div className="admin-confirm-box" role="dialog" aria-label={title} style={{ maxWidth: 460 }}
           onClick={e => e.stopPropagation()}>
        <div className="admin-confirm-title">{title}</div>
        <div className="admin-confirm-text" style={{ marginBottom: 12 }}>
          Der Kunde bekommt eine E-Mail mit Kalendereintrag:
          <div style={{ marginTop: 6, fontWeight: 600 }}>
            {draftTitle(draft)} · {fmtDraftWhen(draft)}
          </div>
          {objectAddress && <div style={{ color: 'var(--muted)' }}>{objectAddress}</div>}
          {isUpdate && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
              Der neue Eintrag ersetzt den alten im Kalender des Kunden.
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="admin-form-label" htmlFor="appt-notice-email">Empfänger E-Mail</label>
          <input
            id="appt-notice-email"
            className="admin-form-input"
            type="email"
            value={email}
            disabled={sending}
            onChange={e => setEmail(e.target.value)}
            placeholder="kunde@example.com"
          />
          {ccEmails.map((v, i) => (
            <EmailRow
              key={`cc-${i}`}
              value={v}
              label={`CC ${i + 1}`}
              prefix="CC"
              disabled={sending}
              onChange={next => setCcEmails(prev => prev.map((x, j) => (j === i ? next : x)))}
              onRemove={() => setCcEmails(prev => prev.filter((_, j) => j !== i))}
            />
          ))}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={sending}
                    onClick={() => setCcEmails(prev => [...prev, ''])}>
              + CC
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="admin-form-label" htmlFor="appt-notice-message">
            Mitteilung an den Kunden <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(freiwillig)</span>
          </label>
          <textarea
            id="appt-notice-message"
            className="admin-form-input"
            rows={3}
            maxLength={MAX_MESSAGE}
            value={message}
            disabled={sending}
            onChange={e => setMessage(e.target.value)}
            placeholder="z.B. Bitte sorgen Sie dafür, dass der Zugang zum Balkon frei ist."
            style={{ resize: 'vertical' }}
          />
        </div>

        {error && <div className="admin-form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="admin-confirm-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={sending}>
            Abbrechen
          </button>
          <button type="button" className="admin-btn admin-btn-primary" onClick={handleSend}
                  disabled={!email.trim() || sending}>
            {sending ? 'Wird gesendet…' : isUpdate ? 'Änderung senden' : 'Senden'}
          </button>
        </div>
      </div>
    </div>
  )
}

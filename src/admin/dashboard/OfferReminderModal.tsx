// Dialog hinter der Kachel «Offerten-Erinnerungen» — Offerten, die seit ≥ 14
// Tagen offen sind, einzeln nachfassen. Aus DashboardScreen.tsx herausgezogen
// (Datei-Budget). Ein Klick auf die Karte öffnet das Projekt der Offerte; eine
// freistehende Offerte ohne Projekt bleibt eine reine Anzeige.
import { useEffect, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { projektKarteProps } from './projektKarte'
import { PendingReminderQuote, getPendingReminderQuotes, sendQuoteReminder } from '../../api/admin'
import { daysSince, fmtCHF, fmtDate } from '../utils/format'
import { useToast, ToastHost } from '../components/useToast'

export interface OfferReminderModalProps {
  onClose: () => void
  onSent: () => void
  /** Projekt der Offerte öffnen (Klick auf die Karte). */
  onOpenProject?: (projectId: string) => void
}

export function OfferReminderModal({ onClose, onSent, onOpenProject }: OfferReminderModalProps) {
  const [quotes, setQuotes] = useState<PendingReminderQuote[] | null>(null)
  const [sending, setSending] = useState<number | null>(null)
  const { toast, showToast } = useToast(3000)

  useEffect(() => {
    getPendingReminderQuotes().then(setQuotes).catch(() => setQuotes([]))
  }, [])

  async function handleSend(quoteId: number) {
    setSending(quoteId)
    try {
      await sendQuoteReminder(quoteId)
      showToast('Erinnerung gesendet', 'success')
      setQuotes(q => q ? q.filter(x => x.id !== quoteId) : q)
      onSent()
    } catch {
      showToast('Fehler beim Senden', 'error')
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Offerten-Erinnerungen</div>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body">
          <ToastHost toast={toast} />
          {quotes === null && <div className="admin-loading"><div className="admin-spinner" />Lade…</div>}
          {quotes !== null && quotes.length === 0 && <div className="admin-empty">Keine fälligen Erinnerungen</div>}
          {quotes !== null && quotes.length > 0 && (
            <div className="admin-list">
              {quotes.map(q => {
                return (
                  <div
                    key={q.id}
                    className="admin-list-item"
                    style={{ gap: 12 }}
                    {...projektKarteProps(q.project_id, onOpenProject)}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{q.quote_number}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {q.customer_name} — {q.project_name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Gesendet: {fmtDate(q.sent_at)} ({daysSince(q.sent_at)} Tage) · {fmtCHF(q.total_amount)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{q.customer_email}</div>
                    </div>
                    <button
                      className="admin-btn admin-btn-primary"
                      style={{ whiteSpace: 'nowrap' }}
                      disabled={sending === q.id}
                      // Der Knopf liegt in der klickbaren Karte: ohne stopPropagation
                      // spränge der Versand gleichzeitig ins Projekt.
                      onClick={e => { e.stopPropagation(); handleSend(q.id) }}
                    >
                      {sending === q.id ? 'Sende…' : 'Erinnerung senden'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

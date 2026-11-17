// Dialog hinter der Kachel «Rechnungen überfällig»: Zahlungserinnerung und
// Mahnung per Mail oder als Brief. Aus DashboardScreen.tsx herausgezogen
// (Datei-Budget). Ein Klick auf die Karte öffnet das Projekt der Rechnung.
import { useEffect, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import {
  PendingActionInvoice, getPendingActionInvoices, sendZahlungserinnerung, sendMahnung,
  MahnStufe, mahnschreibenPdfUrl, markReminderSentByPost,
} from '../../api/admin'
import { daysSince, fmtCHF, fmtDate } from '../utils/format'
import { useToast, ToastHost } from '../components/useToast'
import { projektKarteProps } from './projektKarte'

export interface MahnungModalProps {
  onClose: () => void
  onSent: () => void
  onOpenProject?: (projectId: string) => void
}

export function MahnungModal({ onClose, onSent, onOpenProject }: MahnungModalProps) {
  const [invoices, setInvoices] = useState<PendingActionInvoice[] | null>(null)
  const [sending, setSending] = useState<{ id: number; type: 'erinnerung' | 'mahnung' } | null>(null)
  // Brief geöffnet, Versand noch nicht vermerkt (WW-35). Bewusst zwei Schritte:
  // das PDF anzusehen darf die Mahnstufe nicht weiterschalten — erst der Klick
  // auf «vermerken» setzt den Zeitstempel, wie der Mail-Versand es tut.
  const [brief, setBrief] = useState<{ id: number; stufe: MahnStufe } | null>(null)
  const [vermerkt, setVermerkt] = useState(false)
  const { toast, showToast } = useToast(3500)

  useEffect(() => {
    getPendingActionInvoices().then(setInvoices).catch(() => setInvoices([]))
  }, [])

  async function handleErinnerung(invoiceId: number) {
    setSending({ id: invoiceId, type: 'erinnerung' })
    try {
      await sendZahlungserinnerung(invoiceId)
      showToast('Zahlungserinnerung gesendet', 'success')
      setInvoices(list => list
        ? list.map(inv => inv.id === invoiceId ? { ...inv, zahlungserinnerung_sent_at: new Date().toISOString() } : inv)
        : list
      )
      onSent()
    } catch {
      showToast('Fehler beim Senden', 'error')
    } finally {
      setSending(null)
    }
  }

  async function handleMahnung(invoiceId: number) {
    setSending({ id: invoiceId, type: 'mahnung' })
    try {
      await sendMahnung(invoiceId)
      showToast('Mahnung gesendet', 'success')
      setInvoices(list => list
        ? list.map(inv => inv.id === invoiceId ? { ...inv, mahnung_sent_at: new Date().toISOString() } : inv)
        : list
      )
      onSent()
    } catch {
      showToast('Fehler beim Senden', 'error')
    } finally {
      setSending(null)
    }
  }

  async function handleBriefVermerken(invoiceId: number, stufe: MahnStufe) {
    setVermerkt(true)
    try {
      await markReminderSentByPost(invoiceId, stufe)
      const feld = stufe === 'zahlungserinnerung' ? 'zahlungserinnerung_sent_at' : 'mahnung_sent_at'
      showToast(stufe === 'zahlungserinnerung'
        ? 'Zahlungserinnerung per Post vermerkt' : 'Mahnung per Post vermerkt', 'success')
      setInvoices(list => list
        ? list.map(inv => inv.id === invoiceId ? { ...inv, [feld]: new Date().toISOString() } : inv)
        : list
      )
      setBrief(null)
      onSent()
    } catch {
      showToast('Fehler beim Vermerken', 'error')
    } finally {
      setVermerkt(false)
    }
  }

  const isSending = (id: number, type: 'erinnerung' | 'mahnung') =>
    sending?.id === id && sending?.type === type

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Überfällige Rechnungen</div>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body">
          <ToastHost toast={toast} />
          {invoices === null && <div className="admin-loading"><div className="admin-spinner" />Lade…</div>}
          {invoices !== null && invoices.length === 0 && <div className="admin-empty">Keine überfälligen Rechnungen</div>}
          {invoices !== null && invoices.length > 0 && (
            <div className="admin-list">
              {invoices.map(inv => (
                <div key={inv.id} className="admin-list-item" style={{ flexDirection: 'column', gap: 10 }}
                  {...projektKarteProps(inv.project_id, onOpenProject)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{inv.invoice_number}</div>
                      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, marginTop: 2 }}>
                        {inv.project_id_text ? `${inv.project_id_text} · ` : ''}{inv.project_name || '—'}
                      </div>
                      {inv.customer_name && (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                          Kunde: {inv.customer_name}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        Gesendet: {fmtDate(inv.sent_at)} ({daysSince(inv.sent_at)} Tage offen)
                        {inv.due_date ? ` · Fällig: ${fmtDate(inv.due_date)}` : ''}
                        {' · '}{fmtCHF(inv.total_amount)}
                      </div>
                      <div style={{ fontSize: 12, marginTop: 4, display: 'flex', gap: 12 }}>
                        {inv.zahlungserinnerung_sent_at && (
                          <span style={{ color: '#ca8a04' }}>Erinnerung: {fmtDate(inv.zahlungserinnerung_sent_at)}</span>
                        )}
                        {inv.mahnung_sent_at && (
                          <span style={{ color: 'var(--danger)' }}>Mahnung: {fmtDate(inv.mahnung_sent_at)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="admin-btn admin-btn-secondary"
                      style={{ flex: 1 }}
                      disabled={sending !== null}
                      onClick={() => handleErinnerung(inv.id)}
                    >
                      {isSending(inv.id, 'erinnerung') ? 'Sende…' : 'Zahlungserinnerung'}
                    </button>
                    <button
                      className="admin-btn admin-btn-danger"
                      style={{ flex: 1 }}
                      disabled={sending !== null}
                      onClick={() => handleMahnung(inv.id)}
                    >
                      {isSending(inv.id, 'mahnung') ? 'Sende…' : 'Mahnung senden'}
                    </button>
                  </div>
                  {/* Papierfassung für Kunden ohne E-Mail oder mit Postversand (WW-35).
                      Ein Link statt eines Knopfs: das PDF öffnet sich im neuen Tab. */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a
                      className="admin-btn admin-btn-secondary"
                      style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
                      href={mahnschreibenPdfUrl(inv.id, 'zahlungserinnerung')}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setBrief({ id: inv.id, stufe: 'zahlungserinnerung' })}
                    >
                      Erinnerung als Brief (PDF)
                    </a>
                    <a
                      className="admin-btn admin-btn-secondary"
                      style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
                      href={mahnschreibenPdfUrl(inv.id, 'mahnung')}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setBrief({ id: inv.id, stufe: 'mahnung' })}
                    >
                      Mahnung als Brief (PDF)
                    </a>
                  </div>
                  {brief?.id === inv.id && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <span style={{ flex: 1, color: 'var(--text-muted)' }}>
                        {brief.stufe === 'zahlungserinnerung' ? 'Zahlungserinnerung' : 'Mahnung'} ausgedruckt und verschickt?
                      </span>
                      <button
                        className="admin-btn admin-btn-primary"
                        disabled={vermerkt}
                        onClick={() => handleBriefVermerken(inv.id, brief.stufe)}
                      >
                        {vermerkt ? 'Speichere…' : 'Als per Post versendet vermerken'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import {
  AdminDashboard,
  PendingReminderQuote, getPendingReminderQuotes, sendQuoteReminder,
  PendingActionInvoice, getPendingActionInvoices, sendZahlungserinnerung, sendMahnung,
  PendingApproval, getPendingApprovals, approveApproval, rejectApproval,
  OverdueProject, getOverdueProjects, updateProjectSchedule, closeProject,
} from '../../api/admin'
import { AdminScreen } from '../useAdminNav'
import { fmtCHF, fmtDate } from '../utils/format'
import { apiUrl } from '../../api/client'
import { useToast, ToastHost } from '../components/useToast'

interface Props {
  dashboard: AdminDashboard | null
  onNav: (screen: AdminScreen, detailId?: string) => void
  onBadgeChange?: () => void
}

interface KpiCardProps {
  label: string
  value: number | null
  colorClass: 'blue' | 'orange' | 'green' | 'red' | 'purple' | 'yellow'
  onClick: () => void
  icon: React.ReactNode
  badge?: boolean
}

function KpiCard({ label, value, colorClass, onClick, icon, badge }: KpiCardProps) {
  return (
    <div className="admin-kpi-card" onClick={onClick}>
      {badge && value ? <span className="admin-kpi-badge">{value}</span> : null}
      <div className={`admin-kpi-icon ${colorClass}`}>{icon}</div>
      <div className="admin-kpi-value">{value ?? '—'}</div>
      <div className="admin-kpi-label">{label}</div>
    </div>
  )
}

function IconClock() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-12a1 1 0 1 0-2 0v4a1 1 0 0 0 .293.707l2.828 2.829a1 1 0 1 0 1.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
}
function IconCash() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2V6h10a2 2 0 0 0-2-2H4zm2 6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H6zm7 4a1 1 0 1 0-2 0 1 1 0 0 0 2 0z" clipRule="evenodd"/></svg>
}
function IconUsers() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm8 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 12a5 5 0 0 0-5 5h10a5 5 0 0 0-5-5z"/></svg>
}
function IconReceipt() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 0 0-1 1v14l3-2 2 2 2-2 2 2 2-2 3 2V3a1 1 0 0 0-1-1H4zm2 5a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1zm1 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H7z" clipRule="evenodd"/></svg>
}
function IconCalendar() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1zm0 5a1 1 0 0 0 0 2h8a1 1 0 1 0 0-2H6z" clipRule="evenodd"/></svg>
}
function IconBell() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 11.586V8a6 6 0 0 0-6-6zm0 16a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2z"/></svg>
}
function IconExclamation() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-8a1 1 0 0 0-1 1v3a1 1 0 0 0 2 0V6a1 1 0 0 0-1-1z" clipRule="evenodd"/></svg>
}
function IconCalendarAlert() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1zm5 7a1 1 0 1 0-2 0v3a1 1 0 1 0 2 0V9zm-1 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" clipRule="evenodd"/></svg>
}
function IconApproval() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0 0 10 1.944 11.954 11.954 0 0 0 17.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z" clipRule="evenodd"/></svg>
}
function IconDocument() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1zm1 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H7z" clipRule="evenodd"/></svg>
}
function IconCheckCircle() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z" clipRule="evenodd"/></svg>
}
function IconXCircle() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM8.707 7.293a1 1 0 0 0-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 1 0 1.414 1.414L10 11.414l1.293 1.293a1 1 0 0 0 1.414-1.414L11.414 10l1.293-1.293a1 1 0 0 0-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
}

function daysSince(iso: string | null): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

// ─── Modal: Offerten-Erinnerungen ───────────────────────────

interface ReminderModalProps {
  onClose: () => void
  onSent: () => void
}

function ReminderModal({ onClose, onSent }: ReminderModalProps) {
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
              {quotes.map(q => (
                <div key={q.id} className="admin-list-item" style={{ gap: 12 }}>
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
                    onClick={() => handleSend(q.id)}
                  >
                    {sending === q.id ? 'Sende…' : 'Erinnerung senden'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Rechnungs-Mahnungen ──────────────────────────────

interface MahnungModalProps {
  onClose: () => void
  onSent: () => void
}

function MahnungModal({ onClose, onSent }: MahnungModalProps) {
  const [invoices, setInvoices] = useState<PendingActionInvoice[] | null>(null)
  const [sending, setSending] = useState<{ id: number; type: 'erinnerung' | 'mahnung' } | null>(null)
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
                <div key={inv.id} className="admin-list-item" style={{ flexDirection: 'column', gap: 10 }}>
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Bestellfreigaben ─────────────────────────────────

interface ApprovalModalProps {
  onClose: () => void
  onSent: () => void
}

function ApprovalModal({ onClose, onSent }: ApprovalModalProps) {
  const [approvals, setApprovals] = useState<PendingApproval[] | null>(null)
  const [busy, setBusy] = useState<{ id: string; type: 'approve' | 'reject' } | null>(null)
  const { toast, showToast } = useToast(3000)

  useEffect(() => {
    getPendingApprovals().then(setApprovals).catch(() => setApprovals([]))
  }, [])

  async function handleApprove(id: string) {
    setBusy({ id, type: 'approve' })
    try {
      await approveApproval(id)
      showToast('Freigabe erteilt', 'success')
      setApprovals(list => list ? list.filter(a => a.id !== id) : list)
      onSent()
    } catch {
      showToast('Fehler beim Freigeben', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleReject(id: string) {
    const note = window.prompt('Grund für Ablehnung (optional):') ?? undefined
    if (note === null) return
    setBusy({ id, type: 'reject' })
    try {
      await rejectApproval(id, note)
      showToast('Freigabe abgelehnt', 'success')
      setApprovals(list => list ? list.filter(a => a.id !== id) : list)
      onSent()
    } catch {
      showToast('Fehler beim Ablehnen', 'error')
    } finally {
      setBusy(null)
    }
  }

  const isBusy = (id: string, type: 'approve' | 'reject') =>
    busy?.id === id && busy?.type === type

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Bestellfreigaben für mich</div>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body">
          <ToastHost toast={toast} />
          {approvals === null && <div className="admin-loading"><div className="admin-spinner" />Lade…</div>}
          {approvals !== null && approvals.length === 0 && <div className="admin-empty">Keine offenen Freigaben für dich</div>}
          {approvals !== null && approvals.length > 0 && (
            <div>
              {approvals.map(a => (
                <div key={a.id} className="approval-card">
                  <div className="approval-head">
                    <div className="approval-title">{a.title}</div>
                    <div className="approval-project">{a.project_name ?? '—'}</div>
                    <div className="approval-meta">
                      <span className="approval-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        {a.requested_by_name ?? '—'}
                      </span>
                      <span className="approval-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {fmtDate(a.created_at)}
                      </span>
                    </div>
                  </div>
                  {(a.storage_path || a.file_url) && (
                    <a className="approval-file" href={apiUrl(`/pwa/admin/approvals/${a.id}/download`)} target="_blank" rel="noreferrer">
                      <span className="approval-file-icon">PDF</span>
                      <span className="approval-file-name">{a.filename}</span>
                    </a>
                  )}
                  <div className="approval-actions">
                    <button
                      className="approval-btn approval-btn-approve"
                      disabled={busy !== null}
                      onClick={() => handleApprove(a.id)}
                    >
                      {isBusy(a.id, 'approve') ? '…' : 'Freigeben'}
                    </button>
                    <button
                      className="approval-btn approval-btn-reject"
                      disabled={busy !== null}
                      onClick={() => handleReject(a.id)}
                    >
                      {isBusy(a.id, 'reject') ? '…' : 'Ablehnen'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Überfällige Projekte ─────────────────────────────

interface OverdueProjectsModalProps {
  onClose: () => void
  onChanged: () => void
}

interface RowDraft {
  startDate: string
  endDate: string
  startTime: string
  endTime: string
}

function rowFromProject(p: OverdueProject): RowDraft {
  return {
    startDate: p.start_date?.slice(0, 10) ?? '',
    endDate: p.end_date?.slice(0, 10) ?? '',
    startTime: p.start_time?.slice(0, 5) ?? '',
    endTime: p.end_time?.slice(0, 5) ?? '',
  }
}

function OverdueProjectsModal({ onClose, onChanged }: OverdueProjectsModalProps) {
  const [projects, setProjects] = useState<OverdueProject[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({})
  const [busy, setBusy] = useState<{ id: string; type: 'save' | 'close' } | null>(null)
  const { toast, showToast } = useToast(3000)

  useEffect(() => {
    getOverdueProjects()
      .then(list => {
        setProjects(list)
        const init: Record<string, RowDraft> = {}
        list.forEach(p => { init[p.id] = rowFromProject(p) })
        setDrafts(init)
      })
      .catch(() => setProjects([]))
  }, [])

  function patchDraft(id: string, patch: Partial<RowDraft>) {
    setDrafts(d => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  async function handleSave(p: OverdueProject) {
    const d = drafts[p.id]
    if (!d) return
    if (d.startDate && d.endDate && d.endDate < d.startDate) {
      showToast('Enddatum muss ≥ Startdatum sein', 'error')
      return
    }
    setBusy({ id: p.id, type: 'save' })
    try {
      await updateProjectSchedule(
        p.id,
        d.startDate || null,
        d.endDate || null,
        d.startTime || null,
        d.endTime || null,
      )
      const today = new Date().toISOString().slice(0, 10)
      if (d.endDate && d.endDate >= today) {
        setProjects(list => list ? list.filter(x => x.id !== p.id) : list)
        showToast('Termin aktualisiert', 'success')
        onChanged()
      } else {
        showToast('Gespeichert', 'success')
      }
    } catch {
      showToast('Fehler beim Speichern', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleClose(p: OverdueProject) {
    if (!window.confirm(`Projekt "${p.name}" als abgeschlossen markieren?`)) return
    setBusy({ id: p.id, type: 'close' })
    try {
      await closeProject(p.id)
      setProjects(list => list ? list.filter(x => x.id !== p.id) : list)
      showToast('Projekt geschlossen', 'success')
      onChanged()
    } catch {
      showToast('Fehler beim Schliessen', 'error')
    } finally {
      setBusy(null)
    }
  }

  const isBusy = (id: string, type: 'save' | 'close') =>
    busy?.id === id && busy?.type === type

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Überfällige Projekte</div>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body">
          <ToastHost toast={toast} />
          {projects === null && <div className="admin-loading"><div className="admin-spinner" />Lade…</div>}
          {projects !== null && projects.length === 0 && <div className="admin-empty">Keine überfälligen Projekte</div>}
          {projects !== null && projects.length > 0 && (
            <div className="admin-list">
              {projects.map(p => {
                const d = drafts[p.id]
                if (!d) return null
                return (
                  <div key={p.id} className="admin-list-item" style={{ flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{p.customer_name ?? '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 2 }}>
                        Geplant bis {fmtDate(p.end_date)} ({daysSince(p.end_date)} Tage überfällig)
                      </div>
                    </div>
                    <div className="admin-form-row">
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                        <span>Start</span>
                        <input
                          type="date"
                          className="admin-input"
                          value={d.startDate}
                          onChange={e => patchDraft(p.id, { startDate: e.target.value })}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                        <span>Ende</span>
                        <input
                          type="date"
                          className="admin-input"
                          value={d.endDate}
                          onChange={e => patchDraft(p.id, { endDate: e.target.value })}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                        <span>Startzeit</span>
                        <input
                          type="time"
                          className="admin-input"
                          value={d.startTime}
                          onChange={e => patchDraft(p.id, { startTime: e.target.value })}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                        <span>Endzeit</span>
                        <input
                          type="time"
                          className="admin-input"
                          value={d.endTime}
                          onChange={e => patchDraft(p.id, { endTime: e.target.value })}
                        />
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="admin-btn admin-btn-primary"
                        style={{ flex: 1 }}
                        disabled={busy !== null}
                        onClick={() => handleSave(p)}
                      >
                        {isBusy(p.id, 'save') ? 'Speichere…' : 'Speichern'}
                      </button>
                      <button
                        className="admin-btn admin-btn-secondary"
                        style={{ flex: 1 }}
                        disabled={busy !== null}
                        onClick={() => handleClose(p)}
                      >
                        {isBusy(p.id, 'close') ? '…' : 'Projekt schliessen'}
                      </button>
                    </div>
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

// ─── Dashboard ───────────────────────────────────────────────

export default function DashboardScreen({ dashboard, onNav, onBadgeChange }: Props) {
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [showMahnungModal, setShowMahnungModal] = useState(false)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [showOverdueProjectsModal, setShowOverdueProjectsModal] = useState(false)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Dashboard</div>
          <div className="admin-page-subtitle">Übersicht offener Aufgaben</div>
        </div>
      </div>

      <section className="admin-kpi-section">
        <h3 className="admin-kpi-group-title">Personal & Zeit</h3>
        <div className="admin-kpi-grid">
          <KpiCard
            label="Zeitkorrekturen offen"
            value={dashboard?.pending_corrections ?? null}
            colorClass="orange"
            onClick={() => onNav('corrections')}
            icon={<IconClock />}
          />
          <KpiCard
            label="Eingestempelt"
            value={dashboard?.open_sessions ?? null}
            colorClass="green"
            onClick={() => onNav('hr-reports')}
            icon={<IconUsers />}
          />
          <KpiCard
            label="Absenzen pendent"
            value={dashboard?.pending_absences ?? null}
            colorClass="blue"
            onClick={() => onNav('absences')}
            icon={<IconCalendar />}
          />
        </div>
      </section>

      <section className="admin-kpi-section">
        <h3 className="admin-kpi-group-title">Finanzen & Einkauf</h3>
        <div className="admin-kpi-grid">
          <KpiCard
            label="Rechnungen offen"
            value={dashboard?.open_invoices ?? null}
            colorClass="red"
            onClick={() => onNav('invoices')}
            icon={<IconCash />}
          />
          <KpiCard
            label="Rechnungen überfällig"
            value={dashboard?.invoices_pending_action ?? null}
            colorClass="red"
            onClick={() => setShowMahnungModal(true)}
            icon={<IconExclamation />}
            badge
          />
          <KpiCard
            label="Bestellfreigaben für mich"
            value={dashboard?.pending_approvals ?? null}
            colorClass="blue"
            onClick={() => setShowApprovalModal(true)}
            icon={<IconApproval />}
            badge
          />
        </div>
      </section>

      <section className="admin-kpi-section">
        <h3 className="admin-kpi-group-title">Vertrieb & Projekte</h3>
        <div className="admin-kpi-grid">
          <KpiCard
            label="Offerten in Bearbeitung"
            value={dashboard?.draft_quotes ?? null}
            colorClass="purple"
            onClick={() => onNav('quotes')}
            icon={<IconReceipt />}
          />
          <KpiCard
            label="Angenommene Offerten"
            value={dashboard?.recently_accepted_quotes ?? null}
            colorClass="green"
            onClick={() => onNav('quotes', 'akzeptiert')}
            icon={<IconCheckCircle />}
            badge
          />
          <KpiCard
            label="Abgelehnte Offerten"
            value={dashboard?.recently_rejected_quotes ?? null}
            colorClass="red"
            onClick={() => onNav('quotes', 'abgelehnt')}
            icon={<IconXCircle />}
            badge
          />
          <KpiCard
            label="Offerten-Erinnerungen"
            value={dashboard?.quotes_pending_reminder ?? null}
            colorClass="yellow"
            onClick={() => setShowReminderModal(true)}
            icon={<IconBell />}
            badge
          />
          <KpiCard
            label="Projekte überfällig"
            value={dashboard?.projects_overdue ?? null}
            colorClass="red"
            onClick={() => setShowOverdueProjectsModal(true)}
            icon={<IconCalendarAlert />}
            badge
          />
          <KpiCard
            label="Projekt-Entwürfe"
            value={dashboard?.pending_drafts ?? null}
            colorClass="orange"
            onClick={() => onNav('project-drafts')}
            icon={<IconDocument />}
            badge
          />
        </div>
      </section>

      {dashboard === null && (
        <div className="admin-loading">
          <div className="admin-spinner" />
          Lade Dashboard…
        </div>
      )}

      {showReminderModal && (
        <ReminderModal
          onClose={() => setShowReminderModal(false)}
          onSent={() => onBadgeChange?.()}
        />
      )}

      {showMahnungModal && (
        <MahnungModal
          onClose={() => setShowMahnungModal(false)}
          onSent={() => onBadgeChange?.()}
        />
      )}

      {showApprovalModal && (
        <ApprovalModal
          onClose={() => setShowApprovalModal(false)}
          onSent={() => onBadgeChange?.()}
        />
      )}

      {showOverdueProjectsModal && (
        <OverdueProjectsModal
          onClose={() => setShowOverdueProjectsModal(false)}
          onChanged={() => onBadgeChange?.()}
        />
      )}
    </div>
  )
}

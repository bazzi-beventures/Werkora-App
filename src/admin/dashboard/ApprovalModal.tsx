// Dialog hinter der Kachel «Bestellfreigaben für mich». Aus DashboardScreen.tsx
// herausgezogen (Datei-Budget). Ein Klick auf die Karte öffnet das Projekt.
import { useEffect, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import {
  PendingApproval, getPendingApprovals, approveApproval, rejectApproval,
} from '../../api/admin'
import { apiUrl } from '../../api/client'
import { fmtDate } from '../utils/format'
import { useToast, ToastHost } from '../components/useToast'
import { projektKarteProps } from './projektKarte'

export interface ApprovalModalProps {
  onClose: () => void
  onSent: () => void
  onOpenProject?: (projectId: string) => void
}

export function ApprovalModal({ onClose, onSent, onOpenProject }: ApprovalModalProps) {
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
                <div
                  key={a.id}
                  className="approval-card"
                  style={a.project_id && onOpenProject ? { cursor: 'pointer' } : undefined}
                  {...projektKarteProps(a.project_id, onOpenProject)}
                >
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
                  {a.storage_path && (
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

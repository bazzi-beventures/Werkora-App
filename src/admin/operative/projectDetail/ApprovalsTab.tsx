import { apiUrl } from '../../../api/client'
import { fmtDate } from '../../utils/format'
import { APPROVAL_STATUS_BADGE, APPROVAL_STATUS_LABELS } from './types'
import type { ProjectApproval } from './types'

interface ApprovalsTabProps {
  approvals: ProjectApproval[]
  currentUserId: string | null
  decidingApprovalId: string | null
  onShowCreateForm: () => void
  onDecide: (approvalId: string, decision: 'approve' | 'reject') => void
  onDelete: (approvalId: string) => void
}

export function ApprovalsTab({ approvals, currentUserId, decidingApprovalId, onShowCreateForm, onDecide, onDelete }: ApprovalsTabProps) {
  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Bestellfreigabe / Visierung</div>
        <button
          type="button"
          className="admin-btn admin-btn-sm admin-btn-primary"
          onClick={onShowCreateForm}
        >
          + Neue Bestellfreigabe
        </button>
      </div>
      {approvals.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Freigaben angefragt.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {approvals.map(a => {
            const isApprover = !!currentUserId && a.approver_user_id === currentUserId
            const isCreator = !!currentUserId && a.requested_by_user_id === currentUserId
            return (
              <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, background: 'var(--surface-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</span>
                  <span className={`admin-badge ${APPROVAL_STATUS_BADGE[a.status]}`}>{APPROVAL_STATUS_LABELS[a.status]}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(a.created_at)}</span>
                  {(a.storage_path || a.file_url) && (
                    <a href={apiUrl(`/pwa/admin/approvals/${a.id}/download`)} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm" style={{ marginLeft: 'auto' }}>
                      📎 {a.filename}
                    </a>
                  )}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>Eingereicht von <strong>{a.requested_by_name ?? '—'}</strong></span>
                  <span>Freigeber: <strong>{a.approver_name ?? '—'}</strong></span>
                  {a.decided_at && (
                    <span>Entschieden am {fmtDate(a.decided_at)}</span>
                  )}
                </div>
                {a.decision_note && (
                  <div style={{ marginTop: 6, fontSize: 12, fontStyle: 'italic', color: 'var(--muted)' }}>
                    Notiz: {a.decision_note}
                  </div>
                )}
                {a.status === 'pending' && (isApprover || isCreator) && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    {isApprover && (
                      <>
                        <button
                          className="admin-btn admin-btn-success admin-btn-sm"
                          disabled={decidingApprovalId === a.id}
                          onClick={() => onDecide(a.id, 'approve')}
                        >
                          {decidingApprovalId === a.id ? '…' : 'Freigeben'}
                        </button>
                        <button
                          className="admin-btn admin-btn-danger admin-btn-sm"
                          disabled={decidingApprovalId === a.id}
                          onClick={() => onDecide(a.id, 'reject')}
                        >
                          Ablehnen
                        </button>
                      </>
                    )}
                    {isCreator && !isApprover && (
                      <button
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        onClick={() => onDelete(a.id)}
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

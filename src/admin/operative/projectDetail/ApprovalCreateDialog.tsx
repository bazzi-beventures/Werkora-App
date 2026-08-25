import { backdropCloseProps } from '../../../shared/backdropClose'
import type { UseProjectApprovals } from './useProjectApprovals'
import type { StaffMember } from './DetailsForm'

// Maske «Neue Bestellfreigabe» (Charge H, H3). Zustand und Absenden liegen im
// Hook; hier steht nur die Maske — inklusive der Datei-Callback-Ref, die
// bewusst getrennt vom Hook-Objekt hereinkommt (siehe useProjectApprovals).

export function ApprovalCreateDialog({ a, staff, bindFileInput }: {
  a: Omit<UseProjectApprovals, 'bindFileInput'>
  /** Freigeber sind Mitarbeitende MIT App-Login — nur die koennen entscheiden. */
  staff: StaffMember[]
  bindFileInput: (el: HTMLInputElement | null) => void
}) {
  return (
        <div
          className="admin-confirm-overlay"
          {...backdropCloseProps(
            a.resetForm,
            { blockWhen: () => !!(a.title.trim() || a.approverUserId || a.file) },
          )}
        >
          <div className="admin-confirm-box" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <form onSubmit={a.create}>
              <div className="admin-confirm-title">Neue Bestellfreigabe</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                <div className="admin-form-group">
                  <label className="admin-form-label">Titel *</label>
                  <input
                    className="admin-form-input"
                    value={a.title}
                    onChange={e => a.setTitle(e.target.value)}
                    placeholder="z.B. Materialbestellung Kabel"
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Freigeber *</label>
                  <select
                    className="admin-form-select"
                    value={a.approverUserId}
                    onChange={e => a.setApproverUserId(e.target.value)}
                    required
                  >
                    <option value="">— auswählen —</option>
                    {staff
                      .filter(s => !!s.authorized_user_id)
                      .map(s => (
                        <option key={s.id} value={s.authorized_user_id!}>{s.name}</option>
                      ))}
                  </select>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Dokument (PDF oder Bild) *</label>
                  <input
                    ref={bindFileInput}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={e => a.setFile(e.target.files?.[0] ?? null)}
                    required
                  />
                </div>
              </div>
              <div className="admin-confirm-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={a.resetForm}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="admin-btn admin-btn-primary"
                  disabled={a.creating || !a.title.trim() || !a.approverUserId || !a.file}
                >
                  {a.creating ? 'Sende…' : 'Freigabe anfragen'}
                </button>
              </div>
            </form>
          </div>
        </div>
  )
}

import { formatDateTime } from '../../utils/format'
import type { UseProjectComments } from './useProjectComments'

// Kommentar-Verlauf in der Seitenleiste des Projekt-Details (Charge H, H3).
// Rein darstellend — Laden, Speichern und die Sperrfrist liegen in
// useProjectComments.
interface Props {
  c: UseProjectComments
  // Tickt im Minutentakt im Screen, damit die 10-Minuten-Sperre ohne Reload greift.
  now: number
}

export function CommentsPanel({ c, now }: Props) {
  return (
    <div className="admin-table-wrap project-detail-comments" style={{ padding: 24 }}>
      <div className="admin-section-title" style={{ marginBottom: 14 }}>Kommentare</div>
      {c.comments.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>Noch keine Kommentare.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {c.comments.map(comment => {
          const isEditing = c.editingId === comment.id
          const locked = c.isLocked(comment, now)
          return (
            <div key={comment.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              {/* Schmale Seitenleiste (340px): Name + Datum zusammenhalten,
                  Aktionen als rechtsbündige Gruppe, die als Einheit in eine
                  zweite Zeile umbricht – statt den Namen zu zerquetschen. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{comment.author_name || 'Unbekannt'}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {formatDateTime(comment.created_at)}
                  {comment.updated_at ? ' · bearbeitet' : ''}
                </span>
                {!isEditing && !locked && (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      onClick={() => c.startEdit(comment)}
                    >Bearbeiten</button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-danger"
                      onClick={() => c.setConfirmDeleteId(comment.id)}
                    >Löschen</button>
                  </div>
                )}
                {!isEditing && locked && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }} title="Nach 10 Minuten gesperrt – fester Eintrag">🔒</span>
                )}
              </div>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    className="admin-form-input"
                    rows={2}
                    value={c.editingText}
                    onChange={e => c.setEditingText(e.target.value)}
                    style={{ resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      onClick={c.cancelEdit}
                      disabled={c.savingEdit}
                    >Abbrechen</button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-primary"
                      onClick={c.saveEdit}
                      disabled={c.savingEdit || !c.editingText.trim()}
                    >{c.savingEdit ? 'Speichern…' : 'Speichern'}</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{comment.text}</div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="admin-form-input"
          style={{ flex: 1 }}
          placeholder="Kommentar hinzufügen…"
          value={c.newComment}
          onChange={e => c.setNewComment(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void c.add() } }}
        />
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          disabled={c.adding || !c.newComment.trim()}
          onClick={c.add}
        >
          {c.adding ? '…' : 'Speichern'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
        Kommentare lassen sich 10 Minuten lang bearbeiten oder löschen – danach sind sie ein fester Eintrag.
      </p>
    </div>
  )
}

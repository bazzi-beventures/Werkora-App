import { useState } from 'react'
import type { ProjectTask } from './types'

interface TasksTabProps {
  tasks: ProjectTask[]
  onAdd: (text: string) => Promise<void>
  onEdit: (taskId: string, text: string) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
}

export function TasksTab({ tasks, onAdd, onEdit, onDelete }: TasksTabProps) {
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  async function handleAdd() {
    const t = newText.trim()
    if (!t) return
    setAdding(true)
    try {
      await onAdd(t)
      setNewText('')
    } finally {
      setAdding(false)
    }
  }

  async function handleSaveEdit() {
    const t = editingText.trim()
    if (!editingId || !t) return
    setSavingEdit(true)
    try {
      await onEdit(editingId, t)
      setEditingId(null)
      setEditingText('')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div className="admin-section-title" style={{ marginBottom: 6 }}>Aufgaben</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        Checkliste fürs Projekt — der Monteur hakt die Punkte in der App ab.
      </div>

      {/* Neue Aufgabe */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className="admin-form-input"
          style={{ flex: 1 }}
          placeholder="Neue Aufgabe… (z.B. Schlüssel beim Hauswart abholen)"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAdd() } }}
        />
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          disabled={adding || !newText.trim()}
          onClick={handleAdd}
        >
          {adding ? '…' : '+ Aufgabe'}
        </button>
      </div>

      {tasks.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Aufgaben.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map(t => {
            const isEditing = editingId === t.id
            return (
              <div key={t.id} style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                      className="admin-form-input"
                      rows={2}
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      style={{ resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={() => { setEditingId(null); setEditingText('') }} disabled={savingEdit}>Abbrechen</button>
                      <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={handleSaveEdit} disabled={savingEdit || !editingText.trim()}>{savingEdit ? 'Speichern…' : 'Speichern'}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className={`admin-badge ${t.is_done ? 'admin-badge-paid' : 'admin-badge-open'}`}>
                      {t.is_done ? '✓ erledigt' : 'offen'}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: 'pre-wrap', textDecoration: t.is_done ? 'line-through' : 'none', color: t.is_done ? 'var(--muted)' : 'var(--text)' }}>
                      {t.text}
                    </span>
                    {t.is_done && t.done_by_name && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>von {t.done_by_name}</span>
                    )}
                    <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={() => { setEditingId(t.id); setEditingText(t.text) }}>Bearbeiten</button>
                    <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => void onDelete(t.id)}>Löschen</button>
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

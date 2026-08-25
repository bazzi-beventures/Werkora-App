import { useEffect, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { createUnit, deleteUnit, listUnits, renameUnit } from '../../api/admin/units'
import type { Unit } from '../../api/admin/units'
import { useToast, ToastHost } from '../components/useToast'

/**
 * Einheiten-Vokabular pflegen (Tab in den Admin-Tools).
 *
 * Umbenennen wirkt auf alle Materialien mit dem alten Code; ein bereits
 * existierender Ziel-Code fuehrt die beiden Einheiten zusammen (Merge). Loeschen
 * ist gesperrt, solange die Einheit noch verwendet wird (Backend gibt 400).
 *
 * Wartungswerkzeug, kein Tagesgeschaeft: ein Rename kaskadiert ueber den ganzen
 * Materialstamm. Steht deshalb neben der Materialdatenbereinigung in den Admin-Tools
 * (superadmin-only) statt als Reiter im Material-Bereich.
 *
 * Bringt wie die uebrigen Tool-Screens seinen eigenen `admin-page`-Rahmen mit.
 */
export default function UnitsPanel() {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Unit | 'new' | null>(null)
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { toast, showToast } = useToast(3500)

  async function load() {
    setLoading(true)
    try {
      setUnits(await listUnits())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setCode('')
    setEditing('new')
    setError('')
  }

  function openEdit(u: Unit) {
    setCode(u.code)
    setEditing(u)
    setError('')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return
    setSaving(true)
    setError('')
    try {
      if (editing === 'new') {
        await createUnit(trimmed)
        showToast(`Einheit „${trimmed}" angelegt`)
      } else if (editing) {
        const res = await renameUnit(editing.id, trimmed)
        const n = res.migrated ?? 0
        showToast(
          res.action === 'merge'
            ? `Zusammengeführt — ${n} Material(ien) auf „${trimmed}" umgestellt`
            : `Umbenannt${n ? ` — ${n} Material(ien) aktualisiert` : ''}`,
        )
      }
      setEditing(null)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (editing === 'new' || editing === null) return
    const unit = editing
    if (!window.confirm(`Einheit „${unit.code}" wirklich löschen?`)) return
    setSaving(true)
    setError('')
    try {
      await deleteUnit(unit.id)
      setEditing(null)
      showToast(`Einheit „${unit.code}" gelöscht`)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  // Beim Umbenennen auf einen bestehenden Code: Hinweis, dass zusammengeführt wird.
  const trimmed = code.trim()
  const mergeTarget = editing && editing !== 'new'
    ? units.find(u => u.code === trimmed && u.id !== editing.id)
    : undefined

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Einheiten</div>
          <div className="admin-page-subtitle">Vokabular für das Einheit-Feld im Material — sauber halten statt „Stk" vs „stk"</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openNew}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
          Neue Einheit
        </button>
      </div>

      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Einheit</th>
                <th>Verwendet von</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {units.length === 0 ? (
                <tr><td colSpan={3} className="admin-table-empty">Noch keine Einheiten definiert.</td></tr>
              ) : units.map(u => (
                <tr key={u.id} onClick={() => openEdit(u)} style={{ cursor: 'pointer' }}>
                  <td><strong>{u.code}</strong></td>
                  <td style={{ color: 'var(--muted)' }}>
                    {u.usage_count > 0 ? `${u.usage_count} Material${u.usage_count === 1 ? '' : 'ien'}` : '—'}
                  </td>
                  <td>
                    <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={e => { e.stopPropagation(); openEdit(u) }}>
                      Bearbeiten
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing !== null && (
        <div className="admin-modal-overlay" {...backdropCloseProps(() => setEditing(null))}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">{editing === 'new' ? 'Neue Einheit' : `„${editing.code}" bearbeiten`}</div>
              <button className="admin-modal-close" onClick={() => setEditing(null)}>×</button>
            </div>
            <form onSubmit={handleSave} className="admin-modal-body">
              {error && <div className="admin-form-error">{error}</div>}
              <div className="admin-form-group">
                <label className="admin-form-label">Einheit *</label>
                <input
                  className="admin-form-input"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="z.B. m², Stk, kg, lfm"
                  autoFocus
                  required
                />
                {editing !== 'new' && editing.usage_count > 0 && (
                  <div className="admin-form-hint">
                    {mergeTarget
                      ? `„${trimmed}" existiert bereits — die ${editing.usage_count} Material(ien) werden zusammengeführt.`
                      : `Umbenennen stellt ${editing.usage_count} Material(ien) auf den neuen Code um.`}
                  </div>
                )}
              </div>
            </form>
            <div className="admin-modal-footer">
              {editing !== 'new' && (
                <button
                  className="admin-btn admin-btn-danger"
                  onClick={handleDelete}
                  disabled={saving}
                  style={{ marginRight: 'auto' }}
                >
                  Löschen
                </button>
              )}
              <button className="admin-btn admin-btn-secondary" onClick={() => setEditing(null)}>Abbrechen</button>
              <button className="admin-btn admin-btn-primary" onClick={e => { (e.currentTarget.closest('div.admin-modal')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }} disabled={saving || !trimmed}>
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

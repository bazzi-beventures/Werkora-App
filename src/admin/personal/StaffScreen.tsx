import { useEffect, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { getAdminStaff, deleteStaff, StaffMember } from '../../api/admin'
import StaffDetailScreen from './StaffDetailScreen'
import { AdminCardList } from '../components/AdminCardList'
import { useIsMobile } from '../useIsMobile'

interface Props {
  onNav?: (screen: string, id?: string) => void
}

export default function StaffScreen({ onNav }: Props) {
  const isMobile = useIsMobile()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<StaffMember | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<StaffMember | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setStaff(await getAdminStaff())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteStaff(confirmDelete.id)
      setConfirmDelete(null)
      load()
    } catch {
      alert('Fehler beim Deaktivieren des Mitarbeiters.')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = staff.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.funktion || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase())
  )

  if (selected || showNew) {
    return (
      <StaffDetailScreen
        member={showNew ? null : selected}
        onClose={() => { setSelected(null); setShowNew(false) }}
        onSaved={() => { setSelected(null); setShowNew(false); load() }}
      />
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Mitarbeiter</div>
          <div className="admin-page-subtitle">{staff.length} Einträge</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setShowNew(true)}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
          Neuer Mitarbeiter
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Name, Funktion oder E-Mail suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          <AdminCardList
            items={filtered}
            keyFor={s => String(s.id)}
            onItemClick={s => setSelected(s)}
            empty="Keine Mitarbeiter gefunden."
            renderCard={s => (
              <>
                <div className="admin-card-head">
                  <span className="admin-card-title">{s.name}</span>
                  {s.role
                    ? <span className={`admin-badge ${s.role === 'admin' ? 'admin-badge-admin' : 'admin-badge-active'}`}>{s.role}</span>
                    : <span className="admin-badge admin-badge-draft">—</span>}
                </div>
                <div className="admin-card-meta">
                  {[s.kuerzel, s.funktion, s.email].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="admin-card-actions">
                  <button
                    className="admin-btn admin-btn-secondary admin-btn-sm"
                    onClick={e => { e.stopPropagation(); setConfirmDelete(s) }}
                  >
                    Deaktivieren
                  </button>
                </div>
              </>
            )}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kürzel</th>
                <th>Funktion</th>
                <th>E-Mail</th>
                <th>Rolle</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="admin-table-empty">Keine Mitarbeiter gefunden.</td></tr>
              ) : filtered.map(s => (
                <tr key={s.id} onClick={() => setSelected(s)}>
                  <td className="primary">{s.name}</td>
                  <td className="secondary">{s.kuerzel || '—'}</td>
                  <td>{s.funktion || '—'}</td>
                  <td className="secondary">{s.email || '—'}</td>
                  <td>
                    {s.role
                      ? <span className={`admin-badge ${s.role === 'admin' ? 'admin-badge-admin' : 'admin-badge-active'}`}>{s.role}</span>
                      : <span className="admin-badge admin-badge-draft">—</span>
                    }
                  </td>
                  <td>
                    <button
                      className="admin-btn-icon danger"
                      title="Mitarbeiter deaktivieren"
                      onClick={e => { e.stopPropagation(); setConfirmDelete(s) }}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmDelete && (
        <div className="admin-modal-overlay" {...backdropCloseProps(() => { if (!deleting) setConfirmDelete(null) })}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-title">Mitarbeiter deaktivieren</div>
            <p style={{ padding: '0 24px', color: 'var(--muted)' }}><strong>{confirmDelete.name}</strong> wird deaktiviert und anonymisiert. Bisherige Daten (Berichte, Stunden) bleiben für KPI erhalten.</p>
            <div className="admin-modal-footer">
              <button className="admin-btn" onClick={() => setConfirmDelete(null)} disabled={deleting}>Abbrechen</button>
              <button className="admin-btn admin-btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deaktivieren…' : 'Ja, deaktivieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

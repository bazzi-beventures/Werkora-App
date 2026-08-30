import { useEffect, useState } from 'react'
import { listUsers } from '../../api/admin/users'
import type { AuthUser } from '../../api/admin/users'
import UserDetailScreen from './UserDetailScreen'
import NewPersonScreen from '../personal/NewPersonScreen'
import { AdminCardList } from '../components/AdminCardList'
import { useIsMobile } from '../useIsMobile'
import { mayEditTarget } from './userRoles'
import { consentBadge } from './consentStatus'

// `AuthUser` stand hier bis zum 30.08.2026 ein zweites Mal — wortgleich zur
// Fassung in api/admin/users.ts, aber von niemandem importiert. Zwei Deklarationen
// desselben Typs heisst: Ein neues Feld landet in einer davon, und die andere
// merkt es nicht. Genau das ist mit `consent_current` fast passiert.

export type { AuthUser }

/**
 * Drei Zustände statt zwei. «Ja» beantwortete die Frage «gibt es überhaupt eine
 * bestätigte Fassung» — gefragt ist aber «ist es die aktuelle». Die Entscheidung
 * steht als reine Funktion in consentStatus.ts und ist dort unit-getestet.
 */
function ConsentBadge({ user, withLabel = false }: { user: AuthUser; withLabel?: boolean }) {
  const badge = consentBadge(user)
  return (
    <span className={`admin-badge ${badge.className}`} title={badge.title}>
      {withLabel ? `Consent: ${badge.label}` : badge.label}
    </span>
  )
}

interface Props {
  // Rolle des eingeloggten Benutzers — entscheidet, welche Konten er öffnen und
  // welche Rollen er vergeben darf (Spiegel der Backend-Matrix, siehe userRoles.ts).
  actingRole: string
}

export default function UsersScreen({ actingRole }: Props) {
  const isMobile = useIsMobile()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AuthUser | null>(null)
  const [showNew, setShowNew] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setUsers(await listUsers())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return (
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    )
  })

  // Konten oberhalb der eigenen Ebene bleiben zu — das Backend lehnt sie ohnehin ab.
  const canOpen = (u: AuthUser) => mayEditTarget(actingRole, u.role)

  // Anlegen und Bearbeiten sind zwei verschiedene Aufgaben: Beim Anlegen gehören
  // Konto, Personaldaten und Zugang zusammen (NewPersonScreen), beim Bearbeiten
  // weiss man, was man sucht, und geht gezielt in die Kontodaten.
  if (showNew) {
    return (
      <NewPersonScreen
        actingRole={actingRole}
        origin="users"
        onClose={() => setShowNew(false)}
        onSaved={() => { setShowNew(false); load() }}
      />
    )
  }

  if (selected) {
    return (
      <UserDetailScreen
        user={selected}
        actingRole={actingRole}
        onClose={() => setSelected(null)}
        onSaved={() => { setSelected(null); load() }}
      />
    )
  }

  const active = users.filter(u => u.is_active).length

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Benutzerverwaltung</div>
          <div className="admin-page-subtitle">{active} aktive Benutzer</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setShowNew(true)}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
          Neue Person
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Name, Benutzername, E-Mail oder Rolle suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          <AdminCardList
            items={filtered}
            keyFor={u => String(u.id)}
            onItemClick={u => { if (canOpen(u)) setSelected(u) }}
            empty="Keine Benutzer gefunden."
            renderCard={u => (
              <>
                <div className="admin-card-head">
                  <span className="admin-card-title">{u.display_name || '—'}</span>
                  <span className={`admin-badge ${u.role === 'admin' || u.role === 'management' || u.role === 'superadmin' ? 'admin-badge-admin' : 'admin-badge-active'}`}>
                    {u.role}
                  </span>
                </div>
                <div className="admin-card-meta">
                  {[u.username, u.email].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="admin-card-meta" style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <span className={`admin-badge ${u.is_active ? 'admin-badge-active' : 'admin-badge-rejected'}`}>
                    {u.is_active ? 'Aktiv' : 'Inaktiv'}
                  </span>
                  <ConsentBadge user={u} withLabel />
                </div>
              </>
            )}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Benutzername</th>
                <th>E-Mail</th>
                <th>Rolle</th>
                <th>Status</th>
                <th>Consent</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="admin-table-empty">Keine Benutzer gefunden.</td></tr>
              ) : filtered.map(u => (
                <tr
                  key={u.id}
                  onClick={() => { if (canOpen(u)) setSelected(u) }}
                  style={canOpen(u) ? undefined : { cursor: 'default', opacity: 0.6 }}
                  title={canOpen(u) ? undefined : 'Dieses Konto darf nur das Management bearbeiten.'}
                >
                  <td><strong>{u.display_name || '—'}</strong></td>
                  <td style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{u.username || '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{u.email || '—'}</td>
                  <td>
                    <span className={`admin-badge ${u.role === 'admin' || u.role === 'management' || u.role === 'superadmin' ? 'admin-badge-admin' : 'admin-badge-active'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-badge ${u.is_active ? 'admin-badge-active' : 'admin-badge-rejected'}`}>
                      {u.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td>
                    <ConsentBadge user={u} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

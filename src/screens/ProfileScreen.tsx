import { useEffect, useState } from 'react'
import { logout } from '../api/auth'
import { Theme, loadTheme, applyTheme, toggleTheme } from '../theme'
import { PushState, getPushState, enablePush, disablePush } from '../api/push'

interface Props {
  displayName: string
  email: string | null
  role: string
  tenantName: string
  logoUrl?: string
  onBack: () => void
  onLoggedOut: () => void
}

// Anzeigenamen der fünf Rollen (agents/routers/admin_users.py ALL_ROLES,
// Bedeutung in docs/Admin_Handbuch.md §12). Vorher fehlten drei davon und
// 'manager' stand für eine Rolle, die es nie gab: `user_light`, `management` und
// `superadmin` sahen im eigenen Profil den technischen Schlüssel.
const ROLE_LABELS: Record<string, string> = {
  user_light: 'Mitarbeiter (Zeiterfassung)',
  user: 'Mitarbeiter',
  admin: 'Administrator',
  management: 'Geschäftsleitung',
  superadmin: 'Superadmin',
}

function roleLabel(role: string): string {
  // Unbekannter Wert (neue Rolle im Backend, alte PWA) → Schlüssel zeigen statt
  // eine leere Zeile: im Support-Fall ist «user_xy» brauchbarer als nichts.
  return ROLE_LABELS[role] ?? role
}

function pushLabel(state: PushState | 'loading', busy: boolean): string {
  if (busy) return 'Wird gespeichert…'
  switch (state) {
    case 'loading': return 'Wird geprüft…'
    case 'subscribed': return 'Ein'
    case 'unsubscribed': return 'Aus'
    case 'denied': return 'Im Browser blockiert'
    case 'unsupported': return 'Auf diesem Gerät nicht verfügbar'
  }
}

export default function ProfileScreen({ displayName, email, role, tenantName, logoUrl, onBack, onLoggedOut }: Props) {
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const [pushState, setPushState] = useState<PushState | 'loading'>('loading')
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    getPushState().then(setPushState).catch(() => setPushState('unsupported'))
  }, [])

  async function handleLogout() {
    await logout().catch(() => {})
    onLoggedOut()
  }

  function handleToggleTheme() {
    const next = toggleTheme(theme)
    setTheme(next)
    applyTheme(next)
  }

  async function handleTogglePush() {
    // Nur die echten Umschalt-Zustände sind klickbar.
    if (pushBusy || (pushState !== 'subscribed' && pushState !== 'unsubscribed')) return
    setPushBusy(true)
    try {
      if (pushState === 'subscribed') {
        await disablePush()
        setPushState('unsubscribed')
      } else {
        await enablePush()
        setPushState('subscribed')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Benachrichtigungen konnten nicht geändert werden.')
      setPushState(await getPushState().catch(() => 'unsupported'))
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div className="app-screen">
      <div className="inner-header">
        <div className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 3L5 8l5 5"/>
          </svg>
        </div>
        <div className="inner-title">Profil</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      {/* Avatar + Name */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 0 20px' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--accent-dim)',
          border: '2px solid var(--accent-20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 600, color: 'var(--accent)',
        }}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div style={{ marginTop: 12, fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{displayName}</div>
        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--muted)' }}>{roleLabel(role)}</div>
      </div>

      <div className="menu-list">
        {/* E-Mail */}
        <div className="menu-item" style={{ cursor: 'default' }}>
          <div className="menu-icon menu-icon-accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="M2 7l10 7 10-7"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-sub">E-Mail</div>
            <div className="menu-label">{email ?? '—'}</div>
          </div>
        </div>

        {/* Firma */}
        <div className="menu-item" style={{ cursor: 'default' }}>
          <div className="menu-icon menu-icon-accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
              <rect x="2" y="7" width="20" height="15" rx="1"/>
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-sub">Firma</div>
            <div className="menu-label">{tenantName}</div>
          </div>
        </div>

        {/* Rolle */}
        <div className="menu-item" style={{ cursor: 'default' }}>
          <div className="menu-icon menu-icon-accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
              <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2z"/>
              <path d="M2 20c0-4 4-7 10-7s10 3 10 7"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-sub">Rolle</div>
            <div className="menu-label">{roleLabel(role)}</div>
          </div>
        </div>

        {/* Darstellung */}
        <div className="menu-item" onClick={handleToggleTheme}>
          <div className="menu-icon menu-icon-accent">
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
              </svg>
            )}
          </div>
          <div className="menu-text">
            <div className="menu-sub">Darstellung</div>
            <div className="menu-label">{theme === 'dark' ? 'Dunkel' : 'Hell'}</div>
          </div>
        </div>

        {/* Push-Benachrichtigungen */}
        <div
          className="menu-item"
          onClick={handleTogglePush}
          style={{
            cursor: pushState === 'subscribed' || pushState === 'unsubscribed' ? 'pointer' : 'default',
            opacity: pushState === 'denied' || pushState === 'unsupported' ? 0.6 : 1,
          }}
        >
          <div className="menu-icon menu-icon-accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-sub">Benachrichtigungen</div>
            <div className="menu-label">{pushLabel(pushState, pushBusy)}</div>
          </div>
        </div>

        {/* Abmelden */}
        <div className="menu-item" onClick={handleLogout} style={{ marginTop: 16 }}>
          <div className="menu-icon menu-icon-red">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="1.8">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label" style={{ color: 'var(--accent-red)' }}>Abmelden</div>
            <div className="menu-sub">Von diesem Gerät abmelden</div>
          </div>
        </div>
      </div>
    </div>
  )
}

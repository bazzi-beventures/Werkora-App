import { useEffect, useState } from 'react'
import { logout, type UserInfo } from '../../api/auth'
import { disablePush, enablePush, getPushState, type PushState } from '../../api/push'
import type { Theme } from '../../theme'

/**
 * «Mein Profil» im Admin — Gegenstück zum Profil der Mitarbeiter-App
 * (screens/ProfileScreen.tsx). Erreichbar über einen Klick auf den eigenen
 * Namen unten in der Leiste bzw. im «Mehr»-Drawer am Handy.
 *
 * Der Grund, warum es die Maske gibt: der Schalter für Push-Benachrichtigungen.
 * Bisher liess er sich nur in der Mitarbeiter-App setzen — wer nur im Admin
 * arbeitet, bekam weder die Phasen-Push zu seinen Wünschen
 * (docs/specs/feature-anfragen.md §5.9) noch eine andere. Die Push hängt am
 * GERÄT, nicht an der App: Admin und Mitarbeiter-App teilen Ursprung und
 * Service Worker, ein Schalter gilt also für beide.
 */

interface Props {
  user: UserInfo
  tenantName: string
  theme: Theme
  onToggleTheme: () => void
  onLoggedOut: () => void
}

// Dieselben Anzeigenamen wie im Profil der Mitarbeiter-App.
const ROLE_LABELS: Record<string, string> = {
  user_light: 'Mitarbeiter (Zeiterfassung)',
  user: 'Mitarbeiter',
  admin: 'Administrator',
  management: 'Geschäftsleitung',
  superadmin: 'Superadmin',
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

function pushHint(state: PushState | 'loading'): string | null {
  if (state === 'denied') {
    return 'Der Browser hat Benachrichtigungen für diese Seite blockiert. Freigeben lässt es sich in den Website-Einstellungen des Browsers (Schloss-Symbol neben der Adresse).'
  }
  if (state === 'unsupported') {
    return 'Dieser Browser kann keine Push-Nachrichten empfangen. Auf dem iPhone geht es erst, wenn die App zum Home-Bildschirm hinzugefügt ist.'
  }
  return null
}

export default function AdminProfileScreen({ user, tenantName, theme, onToggleTheme, onLoggedOut }: Props) {
  const [pushState, setPushState] = useState<PushState | 'loading'>('loading')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)

  useEffect(() => {
    getPushState().then(setPushState).catch(() => setPushState('unsupported'))
  }, [])

  const canToggle = pushState === 'subscribed' || pushState === 'unsubscribed'
  const initials = user.display_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const hint = pushHint(pushState)

  async function togglePush() {
    if (pushBusy || !canToggle) return
    setPushBusy(true)
    setPushError(null)
    try {
      if (pushState === 'subscribed') {
        await disablePush()
        setPushState('unsubscribed')
      } else {
        await enablePush()
        setPushState('subscribed')
      }
    } catch (e) {
      setPushError(e instanceof Error ? e.message : 'Benachrichtigungen konnten nicht geändert werden.')
      setPushState(await getPushState().catch(() => 'unsupported' as const))
    } finally {
      setPushBusy(false)
    }
  }

  async function handleLogout() {
    try { await logout() } catch { /* ignore */ }
    onLoggedOut()
  }

  return (
    <div className="admin-page admin-profile">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Mein Profil</div>
          <div className="admin-page-subtitle">Konto und Benachrichtigungen auf diesem Gerät</div>
        </div>
      </div>

      <div className="admin-profile-head">
        <div className="admin-profile-avatar" aria-hidden="true">{initials}</div>
        <div>
          <div className="admin-profile-name">{user.display_name}</div>
          <div className="admin-profile-muted">{ROLE_LABELS[user.role] ?? user.role}</div>
        </div>
      </div>

      <div className="admin-profile-list">
        <div className="admin-profile-row">
          <div className="admin-profile-label">E-Mail</div>
          <div className="admin-profile-value">{user.email ?? '—'}</div>
        </div>
        <div className="admin-profile-row">
          <div className="admin-profile-label">Firma</div>
          <div className="admin-profile-value">{tenantName || '—'}</div>
        </div>
        <div className="admin-profile-row">
          <div className="admin-profile-label">Rolle</div>
          <div className="admin-profile-value">{ROLE_LABELS[user.role] ?? user.role}</div>
        </div>

        <div className="admin-profile-row">
          <div>
            <div className="admin-profile-label">Darstellung</div>
            <div className="admin-profile-value">{theme === 'dark' ? 'Dunkel' : 'Hell'}</div>
          </div>
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onToggleTheme}>
            {theme === 'dark' ? 'Hell verwenden' : 'Dunkel verwenden'}
          </button>
        </div>

        <div className="admin-profile-row">
          <div style={{ minWidth: 0 }}>
            <div className="admin-profile-label">Push-Benachrichtigungen auf diesem Gerät</div>
            <div className="admin-profile-value">{pushLabel(pushState, pushBusy)}</div>
            <div className="admin-profile-muted">
              Zum Beispiel, wenn ein Wunsch auf der Roadmap in eine neue Phase kommt.
              Gilt für dieses Gerät — für Admin und Mitarbeiter-App zugleich.
            </div>
            {hint && <div className="admin-profile-muted">{hint}</div>}
            {!user.staff_id && (
              <div className="admin-form-hint admin-form-hint-warn" role="note">
                Dein Konto ist mit keinem Personaleintrag verknüpft. Push-Nachrichten
                gehen an den Personaleintrag — ohne ihn kommt keine an, auch wenn der
                Schalter an ist. Neuigkeiten zu deinen Wünschen siehst du trotzdem
                beim nächsten Öffnen der App.
              </div>
            )}
            {pushError && <div className="admin-profile-error" role="alert">{pushError}</div>}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={pushState === 'subscribed'}
            aria-label="Push-Benachrichtigungen"
            className={`admin-profile-switch${pushState === 'subscribed' ? ' is-on' : ''}`}
            disabled={!canToggle || pushBusy}
            onClick={togglePush}
          >
            <span className="admin-profile-switch-knob" />
          </button>
        </div>
      </div>

      <button type="button" className="admin-btn admin-btn-secondary admin-profile-logout" onClick={handleLogout}>
        Abmelden
      </button>
    </div>
  )
}

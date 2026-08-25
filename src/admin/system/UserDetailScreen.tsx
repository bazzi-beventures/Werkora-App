import { useState } from 'react'
import { anonymizeUser, saveUser, setUserPassword } from '../../api/admin/users'
import type { AuthUser } from '../../api/admin/users'
import { assignableRoles, mayAnonymize } from './userRoles'
import { useToast, ToastHost } from '../components/useToast'
import { ConfirmDialog } from '../components/ConfirmDialog'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

interface Props {
  user: AuthUser | null
  // Rolle des eingeloggten Benutzers — begrenzt die vergebbaren Rollen und die
  // Gefahrenzone (siehe userRoles.ts, Spiegel der Backend-Matrix).
  actingRole: string
  onClose: () => void
  onSaved: () => void
}

// Spiegelt services/password_policy.py — die verbindliche Prüfung passiert im Backend.
const MIN_PASSWORD_LENGTH = 12

export default function UserDetailScreen({ user, actingRole, onClose, onSaved }: Props) {
  const isNew = !user
  const [email, setEmail] = useState(user?.email ?? '')
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [role, setRole] = useState(user?.role ?? 'user')
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [confirmAnonymize, setConfirmAnonymize] = useState(false)
  const [acting, setActing] = useState(false)
  const { toast, showToast } = useToast(3000)

  // Vergebbare Rollen + die bereits gesetzte Rolle: das Backend lässt eine
  // unveränderte Rolle durch, auch wenn der Handelnde sie nicht neu vergeben dürfte.
  const roleOptions = (() => {
    const opts = [...assignableRoles(actingRole)] as string[]
    const current = user?.role
    if (current && !opts.includes(current)) opts.push(current)
    return opts
  })()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) return
    setError('')
    setSaving(true)
    try {
      if (isNew) {
        await saveUser({ email: email || null, display_name: displayName || null, role })
      } else {
        await saveUser(
          { email: email || null, display_name: displayName || null, role, is_active: isActive },
          user!.id,
        )
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!user || newPassword.length < MIN_PASSWORD_LENGTH) return
    setSettingPassword(true)
    setError('')
    try {
      await setUserPassword(user.id, newPassword)
      setNewPassword('')
      showToast('Passwort gesetzt')
    } catch (err: unknown) {
      // Policy-Verstöße kommen als deutscher Klartext vom Backend.
      setError(err instanceof Error && err.message ? err.message : 'Fehler beim Setzen des Passworts')
    } finally {
      setSettingPassword(false)
    }
  }

  async function handleAnonymize() {
    if (!user) return
    setActing(true)
    try {
      await anonymizeUser(user.id)
      showToast('Benutzer anonymisiert (DSGVO)')
      setTimeout(onSaved, 1000)
    } catch {
      setError('Fehler beim Anonymisieren')
      setActing(false)
    }
    setConfirmAnonymize(false)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">{isNew ? 'Neuer Benutzer' : (user.display_name || user.email || 'Benutzer')}</div>
          <div className="admin-page-subtitle">{isNew ? 'Benutzerkonto anlegen' : 'Benutzerkonto bearbeiten'}</div>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={onClose}>← Zurück</button>
      </div>

      <div className="admin-detail-grid">
        {/* Formular */}
        <form onSubmit={handleSave}>
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Kontodaten</div>
            {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Name</label>
                <input className="admin-form-input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Max Muster" />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">E-Mail</label>
                <input
                  className="admin-form-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="user@firma.ch (optional)"
                />
                <div className="admin-form-hint">Optional. Nur für Benachrichtigungen — Login läuft über den Benutzernamen.</div>
              </div>
              {!isNew && user.username && (
                <div className="admin-form-group">
                  <label className="admin-form-label">Benutzername</label>
                  <input
                    className="admin-form-input"
                    value={user.username}
                    readOnly
                    style={{ opacity: 0.6, cursor: 'default' }}
                  />
                  <div className="admin-form-hint">Wird für den PWA-Login verwendet. Automatisch vergeben.</div>
                </div>
              )}
              <div className="admin-form-group">
                <label className="admin-form-label">Rolle</label>
                <select className="admin-form-select" value={role} onChange={e => setRole(e.target.value)}>
                  {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {roleOptions.length === 1 && (
                  <div className="admin-form-hint">
                    Höhere Rollen vergibt nur das Management.
                  </div>
                )}
              </div>
              {!isNew && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent-blue, #3b82f6)', cursor: 'pointer' }}
                  />
                  <label htmlFor="is_active" style={{ fontSize: 13.5, cursor: 'pointer' }}>Benutzer aktiv</label>
                </div>
              )}
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !displayName.trim()}>
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </form>

        {/* Seitenaktionen */}
        {!isNew && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Passwort setzen */}
            <div className="admin-table-wrap" style={{ padding: 20 }}>
              <div className="admin-section-title">Passwort</div>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 14px' }}>
                Setzt ein neues Login-Passwort für diesen Benutzer: mindestens {MIN_PASSWORD_LENGTH} Zeichen,
                keine gängigen Passwörter, keine Zahlen- oder Tastaturreihen, nicht der eigene Name.
              </p>
              <form onSubmit={handleSetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ position: 'relative' }}>
                  <input
                    className="admin-form-input"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={MIN_PASSWORD_LENGTH}
                    style={{ width: '100%', paddingRight: 44, boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--muted)', padding: 0, display: 'flex', alignItems: 'center',
                    }}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
                <button
                  type="submit"
                  className="admin-btn admin-btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={settingPassword || newPassword.length < MIN_PASSWORD_LENGTH}
                >
                  {settingPassword ? 'Speichere…' : 'Passwort setzen'}
                </button>
              </form>
            </div>

            {/* Gefahrenzone — DSGVO-Löschung ist irreversibel und bleibt Management vorbehalten */}
            {mayAnonymize(actingRole) && (
            <div className="admin-table-wrap" style={{ padding: 20 }}>
              <div className="admin-section-title" style={{ color: '#ef4444' }}>Gefahrenzone</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                <button
                  className="admin-btn admin-btn-danger"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setConfirmAnonymize(true)}
                >
                  Anonymisieren (DSGVO)
                </button>
                <div className="admin-form-hint" style={{ textAlign: 'center' }}>
                  Personendaten entfernen, Verlauf bleibt erhalten.
                </div>
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      {/* Bestätigungen */}
      {confirmAnonymize && (
        <ConfirmDialog
          title="Benutzer anonymisieren?"
          message="Name und E-Mail werden durch «[Anonymisiert]» ersetzt. Arbeitsdaten bleiben für die Buchführung erhalten."
          confirmLabel="Anonymisieren"
          busyLabel="…"
          busy={acting}
          variant="danger"
          onCancel={() => setConfirmAnonymize(false)}
          onConfirm={() => void handleAnonymize()}
        />
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

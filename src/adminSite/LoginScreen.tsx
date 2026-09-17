/**
 * Anmeldung der Betreiber-Seite — Benutzername und Passwort, sonst nichts.
 *
 * Spec: docs/specs/admin-werkora-ch.md §6.3, E6.
 *
 * Bewusst **nicht** die `PinScreen` der Mandanten-App:
 *
 * - **Kein Mandantenlogo, keine Mandantenfarbe.** Vor dem Login ist gar nicht
 *   bekannt, welcher Mandant gemeint wäre — und nach dem Login ist es egal.
 * - **Kein «Passwort vergessen»-Link.** Er führt auf die Reset-Seite, und die
 *   zeigt in die Mandanten-App. Für ein Betreiberkonto ist der Weg dorthin
 *   oder über SQL kürzer als ein zweiter Reset-Pfad, den niemand pflegt.
 * - **Keine Passkeys** (E6): `PWA_RP_ID` ist einwertig und gehört
 *   `app.werkora.ch`. Ein zweiter RP-ID-Wert ist ein kleiner Backend-Umbau
 *   und kommt als O3 nach P3; das 30-Tage-Cookie trägt den Alltag.
 *
 * Das Rollen-Gate hier spart nur die leere Oberfläche — abgewiesen wird ohnehin
 * serverseitig an jeder Route (`require_superadmin`).
 */
import { useState, type FormEvent } from 'react'
import { getMe, logout, type UserInfo } from '../api/auth'
import { loginWithPassword } from '../api/admin/staff'
import { WerkoraMark } from '../brand/WerkoraMark'

interface Props {
  onLoggedIn: (user: UserInfo) => void
}

export default function LoginScreen({ onLoggedIn }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    if (laeuft) return
    setFehler(null)
    setLaeuft(true)
    try {
      await loginWithPassword(username.trim(), password)
      const user = await getMe()
      if (user.role !== 'superadmin') {
        // Die Sitzung besteht jetzt — sie hier wieder zu beenden ist kein
        // Schönheitsschritt: sonst hinge auf dieser Origin ein Cookie, mit dem
        // man nichts tun kann, und der nächste Aufruf zeigte eine Seite, auf
        // der jede Kachel 403 sagt.
        await logout()
        setFehler('Diese Seite ist für Betreiber-Konten.')
        return
      }
      onLoggedIn(user)
    } catch (err: unknown) {
      setFehler(
        err instanceof Error && err.message
          ? err.message
          : 'Anmeldung fehlgeschlagen.',
      )
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div className="adminsite-login">
      <form className="adminsite-login-card" onSubmit={absenden}>
        <div className="adminsite-login-brand">
          <span className="adminsite-login-mark"><WerkoraMark title="Werkora" /></span>
          <div>
            <div className="adminsite-login-title">Werkora Admin</div>
            <div className="adminsite-login-subtitle">Plattform-Verwaltung</div>
          </div>
        </div>

        <label className="admin-form-group">
          <span className="admin-form-label">Benutzername</span>
          <input
            className="admin-form-input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>

        <label className="admin-form-group">
          <span className="admin-form-label">Passwort</span>
          <input
            className="admin-form-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {fehler && <div className="admin-form-error">{fehler}</div>}

        <button className="admin-btn admin-btn-primary" type="submit" disabled={laeuft}>
          {laeuft ? 'Anmelden…' : 'Anmelden'}
        </button>
      </form>
    </div>
  )
}

/**
 * Anmeldung der Betreiber-Seite — Benutzername und Passwort, plus der Weg
 * zurück, wenn das Passwort weg ist.
 *
 * Spec: docs/specs/admin-werkora-ch.md §6.3, E6.
 *
 * Bewusst **nicht** die `PinScreen` der Mandanten-App:
 *
 * - **Kein Mandantenlogo, keine Mandantenfarbe.** Vor dem Login ist gar nicht
 *   bekannt, welcher Mandant gemeint wäre — und nach dem Login ist es egal.
 * - **Keine Passkeys** (E6): `PWA_RP_ID` ist einwertig und gehört
 *   `app.werkora.ch`. Ein zweiter RP-ID-Wert ist ein kleiner Backend-Umbau
 *   und kommt als O3 nach P3; das 30-Tage-Cookie trägt den Alltag.
 *
 * **«Passwort vergessen» gibt es hier seit dem 2026-09-18.** Der Grund, aus dem
 * es fehlte, war nicht der Aufwand, sondern dass die Reset-Seite nach getaner
 * Arbeit in die Mandanten-App zurückverlinkte — für ein Betreiberkonto eine
 * Sackgasse. Das ist behoben (`public_password_reset.py` schickt Konten des
 * Betreiber-Mandanten auf `ADMIN_ORIGIN`), und damit fällt der Einwand weg.
 * Ohne diesen Weg bleibt bei einem vergessenen Passwort nur eine
 * SQL-Migration — und genau die sollte §5.1a abschaffen.
 *
 * Die Antwort auf eine Reset-Anfrage ist **immer dieselbe**, ob es die Adresse
 * gibt oder nicht: das Backend antwortet generisch, und diese Oberfläche darf
 * den Unterschied nicht doch noch verraten (User-Enumeration).
 *
 * Das Rollen-Gate hier spart nur die leere Oberfläche — abgewiesen wird ohnehin
 * serverseitig an jeder Route (`require_superadmin`).
 */
import { useState, type FormEvent } from 'react'
import { getMe, logout, type UserInfo } from '../api/auth'
import { loginWithPassword, requestPasswordReset } from '../api/admin/staff'
import { WerkoraMark } from '../brand/WerkoraMark'
import { ApiError } from '../api/client'

/**
 * Rohe Fehlercodes der Anmeldung auf Deutsch.
 *
 * `apiFetch` reicht ein String-Detail (`detail: "invalid_credentials"`)
 * unverändert als `Error.message` durch. Ohne diese Tabelle stand der
 * Bezeichner wörtlich unter dem Formular — der erste Eindruck der Seite, und
 * ausgerechnet im einzigen Fehlerfall, den ein Anmeldeschirm überhaupt kennt.
 *
 * Nachgeführt aus `agents/routers/auth.py::login_password` und
 * `::forgot_password`.
 */
const FEHLER_TEXT: Record<string, string> = {
  invalid_credentials: 'Benutzername oder Passwort stimmt nicht.',
  // Ein Konto dieser Umgebung gibt es nicht — etwa ein Staging-Konto auf
  // Produktion. Der Text nennt den Grund, ohne die Existenz zu bestätigen.
  tenant_unavailable: 'Dieses Konto gehört nicht zu dieser Umgebung.',
  rate_limited: 'Zu viele Versuche. Bitte in 15 Minuten nochmals probieren.',
}

function fehlerText(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback
  const schluessel = e instanceof ApiError && e.code ? e.code : e.message
  return FEHLER_TEXT[schluessel] ?? (e.message || fallback)
}

interface Props {
  onLoggedIn: (user: UserInfo) => void
}

export default function LoginScreen({ onLoggedIn }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  // Zweiter Zustand desselben Schirms statt eigener Route: der Reset ist ein
  // Abstecher von zwei Feldern, und ein Screenwechsel vor der Anmeldung
  // brächte eine Adresse mit, die niemand teilt.
  const [resetModus, setResetModus] = useState(false)
  const [email, setEmail] = useState('')
  const [resetGesendet, setResetGesendet] = useState(false)

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
      setFehler(fehlerText(err, 'Anmeldung fehlgeschlagen.'))
    } finally {
      setLaeuft(false)
    }
  }

  async function resetAnfordern(e: FormEvent) {
    e.preventDefault()
    if (laeuft) return
    setFehler(null)
    setLaeuft(true)
    try {
      await requestPasswordReset(email.trim())
      // Bewusst dieselbe Meldung, ob es die Adresse gibt oder nicht. Das
      // Backend antwortet aus demselben Grund generisch; hier zu
      // unterscheiden machte seine Mühe zunichte.
      setResetGesendet(true)
    } catch (err: unknown) {
      // Die Bremse (429) ist der einzige Fehler, der hier ankommen soll — sie
      // ist keine Auskunft über das Konto, sondern über den Absender.
      setFehler(fehlerText(err, 'Die Anfrage ging nicht durch.'))
    } finally {
      setLaeuft(false)
    }
  }

  function zurueckZumLogin() {
    setResetModus(false)
    setResetGesendet(false)
    setFehler(null)
  }

  if (resetModus) {
    return (
      <div className="adminsite-login">
        <form className="adminsite-login-card" onSubmit={resetAnfordern}>
          <div className="adminsite-login-brand">
            <span className="adminsite-login-mark"><WerkoraMark title="Werkora" /></span>
            <div>
              <div className="adminsite-login-title">Passwort vergessen</div>
              <div className="adminsite-login-subtitle">Link per E-Mail</div>
            </div>
          </div>

          {resetGesendet ? (
            <>
              <div className="admin-form-hint">
                Wenn es zu dieser Adresse ein Konto gibt, ist eine E-Mail mit einem
                Link unterwegs. Der Link gilt eine Stunde.
              </div>
              <button
                className="admin-btn admin-btn-primary"
                type="button"
                onClick={zurueckZumLogin}
              >
                Zur Anmeldung
              </button>
            </>
          ) : (
            <>
              <label className="admin-form-group">
                <span className="admin-form-label">E-Mail-Adresse</span>
                <input
                  className="admin-form-input"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  required
                />
              </label>

              <div className="admin-form-hint">
                Die Adresse des Betreiber-Kontos. Der Link führt auf eine Seite,
                auf der ein neues Passwort gesetzt wird.
              </div>

              {fehler && <div className="admin-form-error">{fehler}</div>}

              <button className="admin-btn admin-btn-primary" type="submit" disabled={laeuft}>
                {laeuft ? 'Wird gesendet…' : 'Link senden'}
              </button>
              <button
                className="admin-btn admin-btn-secondary admin-btn-sm"
                type="button"
                onClick={zurueckZumLogin}
              >
                Abbrechen
              </button>
            </>
          )}
        </form>
      </div>
    )
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

        <button
          className="adminsite-login-link"
          type="button"
          onClick={() => { setResetModus(true); setFehler(null) }}
        >
          Passwort vergessen?
        </button>
      </form>
    </div>
  )
}

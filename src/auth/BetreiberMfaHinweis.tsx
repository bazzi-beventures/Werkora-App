/**
 * Mandanten-App: Hinweis für ein Betreiber-Konto, dessen Anmeldung noch nicht
 * mit zweitem Faktor bestätigt ist (docs/specs/betreiber-mfa.md §5.4, §6.10).
 *
 * Betrifft nur `superadmin` mit MFA-Pflicht nach einem Passwort-Login — der
 * Server lässt diese Sitzung an nichts ausser der Bestätigung heran. Die
 * Mandanten-App hat dafür keinen eigenen Weg: hier gilt der Passkey-Login der
 * App (er bestätigt die Sitzung), oder man bestätigt auf admin.werkora.ch.
 * Für alle anderen Konten erscheint dieser Schirm nie.
 */
import { useState } from 'react'
import { TenantLogo } from '../App'
import { logout } from '../api/auth'

interface Props {
  logoUrl: string
  onAbgemeldet: () => void
}

export default function BetreiberMfaHinweis({ logoUrl, onAbgemeldet }: Props) {
  const [laeuft, setLaeuft] = useState(false)

  async function abmelden() {
    setLaeuft(true)
    try { await logout() } catch { /* offline — der Schirm bleibt ohnehin zu */ }
    onAbgemeldet()
  }

  return (
    <div className="auth-screen">
      <TenantLogo logoUrl={logoUrl} />
      <div className="auth-title">Betreiber-Konto</div>
      <div className="auth-sub">
        Für dieses Konto gilt die Anmeldung mit zweitem Faktor. Das Passwort allein
        reicht hier nicht — bitte mit Passkey anmelden, oder die Anmeldung auf
        admin.werkora.ch bestätigen.
      </div>
      <button className="btn-primary" onClick={() => { void abmelden() }} disabled={laeuft}
        style={{ marginTop: 16 }}>
        {laeuft ? 'Wird abgemeldet…' : 'Abmelden'}
      </button>
    </div>
  )
}

import { useState } from 'react'
import { registerPasskey } from './webauthn'
import { ApiError } from '../api/client'
import { TenantLogo } from '../App'

interface Props {
  tenantSlug: string
  authorizedUserId: string
  displayName: string
  pin: string
  logoUrl: string
  onRegistered: () => void
}

export default function RegisterScreen({ tenantSlug, authorizedUserId, displayName, pin, logoUrl, onRegistered }: Props) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    setError('')
    setLoading(true)
    try {
      await registerPasskey(tenantSlug, authorizedUserId, pin, navigator.userAgent.slice(0, 50))
      onRegistered()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.message === 'invalid_pin') setError('PIN ungültig oder abgelaufen. Bitte Admin um neuen PIN bitten.')
        else if (err.message === 'verification_failed') setError('Biometrie-Verifizierung fehlgeschlagen. Bitte erneut versuchen.')
        else setError(`Fehler: ${err.message}`)
      } else if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError('Registrierung abgebrochen oder Biometrie fehlgeschlagen. Bitte nochmals versuchen.')
        } else if (err.name === 'InvalidStateError') {
          setError('Dieses Gerät ist bereits registriert — du kannst dich direkt anmelden.')
          setTimeout(() => onRegistered(), 2000)
        } else if (err.name === 'SecurityError') {
          setError('Sicherheitsfehler. Bitte die Seite neu laden (Cache leeren).')
        } else {
          setError(`Biometrie-Fehler (${err.name}). Bitte Seite neu laden und nochmals versuchen.`)
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        setError(`Fehler: ${msg}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <TenantLogo logoUrl={logoUrl} />
      <div className="auth-title">Biometrie<br />registrieren</div>
      <div className="auth-sub">
        Hallo {displayName.split(' ')[0]}! Registriere Face ID, Fingerabdruck oder Geräte-PIN für zukünftige Anmeldungen.
      </div>

      {error && <p className="error-msg">{error}</p>}

      <button className="btn-fingerprint" onClick={handleRegister} disabled={loading}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" opacity="0.3"/>
          <path d="M12 6c-3.31 0-6 2.69-6 6"/>
          <path d="M12 8c-2.21 0-4 1.79-4 4"/>
          <path d="M12 10c-1.1 0-2 .9-2 2"/>
          <circle cx="12" cy="12" r="1"/>
          <path d="M12 14v4"/>
          <path d="M10 16h4"/>
        </svg>
        {loading ? 'Warte auf Bestätigung…' : 'Jetzt registrieren'}
      </button>

      <p className="auth-footer" style={{ marginTop: 16 }}>
        Tippe auf den Button — dein Gerät fragt nach Face ID, Fingerabdruck oder PIN.
      </p>
    </div>
  )
}

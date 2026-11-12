/**
 * «Anmeldung bestätigen» — der zweite Faktor des Betreiber-Kontos.
 *
 * Spec: docs/specs/betreiber-mfa.md §5.2, §6.4, §6.9. Erscheint, wenn das
 * Passwort stimmt, die Sitzung aber noch nicht bestätigt ist
 * (`me.mfa.pflicht && !me.mfa.bestaetigt`). Bis dahin antwortet jede andere
 * Route mit 403 — es gibt also nichts, was man unter diesem Schirm sähe.
 *
 * Drei Wege, und der erste ist der gewünschte:
 * - **Mit dem Handy (QR-Code)** — der Browser zeigt seinen eigenen QR-Code,
 *   das Handy scannt ihn und bestätigt mit Face ID (Bluetooth an).
 * - **Mit diesem Computer** — Touch ID / Windows Hello, wenn hier ein Passkey liegt.
 * - **Wiederherstellungscode** — der Notfallweg.
 *
 * Danach bietet der Schirm an, einen Passkey für dieses Gerät anzulegen
 * («Diesen Computer merken» bzw. nach einem Code «neuen Passkey einrichten»).
 */
import { useState, type FormEvent } from 'react'
import { getMe, type UserInfo } from '../api/auth'
import { passkeySupported } from '../auth/webauthn'
import { WerkoraMark } from '../brand/WerkoraMark'
import { adminPasskeyEinrichten, SchonEingerichtet } from './adminPasskey'
import { bestaetigeMitPasskey, loeseCodeEin, mfaFehlerText, type BestaetigungsArt } from './betreiberMfa'

type Phase = 'waehlen' | 'code' | 'merken' | 'neu'

interface Props {
  user: UserInfo
  onBestaetigt: (user: UserInfo) => void
  onAbmelden: () => void
  /** Installierte App am Handy: kein «Mit dem Handy», ein Knopf genügt. */
  appModus?: boolean
  /** Nach der Bestätigung einen Passkey für dieses Gerät anbieten. */
  angebotNachher?: boolean
}

export default function MfaBestaetigung({
  user, onBestaetigt, onAbmelden, appModus = false, angebotNachher = !appModus,
}: Props) {
  const [phase, setPhase] = useState<Phase>('waehlen')
  const [code, setCode] = useState('')
  const [codesUebrig, setCodesUebrig] = useState<number | null>(null)
  const [bestaetigt, setBestaetigt] = useState<UserInfo | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const unterstuetzt = passkeySupported()

  async function nachBestaetigung(naechste: Phase | null) {
    const u = await getMe()
    if (angebotNachher && naechste && unterstuetzt) {
      setBestaetigt(u)
      setPhase(naechste)
      return
    }
    onBestaetigt(u)
  }

  async function mitPasskey(art: BestaetigungsArt) {
    if (laeuft) return
    setFehler(null)
    setLaeuft(true)
    try {
      await bestaetigeMitPasskey(art)
      // Nur nach dem Handy-Weg anbieten: wer «Mit diesem Computer» bestätigt
      // hat, hat hier schon einen Passkey.
      await nachBestaetigung(art === 'handy' ? 'merken' : null)
    } catch (err: unknown) {
      setFehler(mfaFehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }

  async function mitCode(e: FormEvent) {
    e.preventDefault()
    if (laeuft || !code.trim()) return
    setFehler(null)
    setLaeuft(true)
    try {
      setCodesUebrig(await loeseCodeEin(code))
      setCode('')
      await nachBestaetigung('neu')
    } catch (err: unknown) {
      setFehler(mfaFehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }

  async function geraetMerken() {
    if (laeuft || !bestaetigt) return
    setFehler(null)
    setLaeuft(true)
    try {
      await adminPasskeyEinrichten()
      onBestaetigt(bestaetigt)
    } catch (err: unknown) {
      if (err instanceof SchonEingerichtet) { onBestaetigt(bestaetigt); return }
      setFehler(mfaFehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }

  const kopf = (titel: string) => (
    <div className="adminsite-login-brand">
      <span className="adminsite-login-mark"><WerkoraMark title="Werkora" /></span>
      <div>
        <div className="adminsite-login-title">{titel}</div>
        <div className="adminsite-login-subtitle">{user.display_name}</div>
      </div>
    </div>
  )

  if (phase === 'merken' || phase === 'neu') {
    const neu = phase === 'neu'
    return (
      <div className="adminsite-login">
        <div className="adminsite-login-card">
          {kopf(neu ? 'Neuen Passkey einrichten' : 'Diesen Computer merken?')}
          <div className="admin-form-hint">
            {neu
              ? 'Angemeldet mit einem Wiederherstellungscode. Richte jetzt einen neuen Passkey '
                + 'ein, damit es beim nächsten Mal wieder mit Fingerabdruck oder Face ID geht.'
              : 'Mit einem Passkey auf diesem Computer (Touch ID oder Windows Hello) braucht '
                + 'es beim nächsten Mal das Handy nicht.'}
          </div>
          {neu && codesUebrig !== null && (
            <div className={codesUebrig <= 3 ? 'admin-form-error' : 'admin-form-hint'}>
              Noch {codesUebrig} Wiederherstellungscode{codesUebrig === 1 ? '' : 's'} übrig.
            </div>
          )}
          {fehler && <div className="admin-form-error">{fehler}</div>}
          <button className="admin-btn admin-btn-primary" type="button"
            onClick={() => { void geraetMerken() }} disabled={laeuft}>
            {laeuft ? 'Wird eingerichtet…' : 'Passkey auf diesem Gerät einrichten'}
          </button>
          <button className="adminsite-login-link" type="button"
            onClick={() => { if (bestaetigt) onBestaetigt(bestaetigt) }} disabled={laeuft}>
            {neu ? 'Später' : 'Nicht jetzt'}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'code') {
    return (
      <div className="adminsite-login">
        <form className="adminsite-login-card" onSubmit={(e) => { void mitCode(e) }}>
          {kopf('Wiederherstellungscode')}
          <div className="admin-form-hint">
            Einer der zehn Codes vom Blatt bzw. aus der Datei. Jeder gilt nur einmal.
          </div>
          <label className="admin-form-group">
            <span className="admin-form-label">Code</span>
            <input
              className="admin-form-input"
              type="text"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="XXXXX-XXXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          {fehler && <div className="admin-form-error">{fehler}</div>}
          <button className="admin-btn admin-btn-primary" type="submit" disabled={laeuft}>
            {laeuft ? 'Wird geprüft…' : 'Bestätigen'}
          </button>
          <button className="adminsite-login-link" type="button"
            onClick={() => { setFehler(null); setPhase('waehlen') }}>
            Zurück
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="adminsite-login">
      <div className="adminsite-login-card">
        {kopf('Anmeldung bestätigen')}
        <div className="admin-form-hint">
          {appModus
            ? 'Passwort stimmt. Bestätige die Anmeldung mit deinem Passkey.'
            : 'Passwort stimmt. Bestätige die Anmeldung mit dem Handy: Der Browser zeigt '
              + 'einen QR-Code, den du mit der Kamera scannst (Bluetooth am Computer an).'}
        </div>
        {!unterstuetzt && (
          <div className="admin-form-error">
            Dieser Browser kann keine Passkeys. Bestätige mit einem Wiederherstellungscode.
          </div>
        )}
        {fehler && <div className="admin-form-error">{fehler}</div>}
        {unterstuetzt && (appModus ? (
          <button className="admin-btn admin-btn-primary" type="button"
            onClick={() => { void mitPasskey('auto') }} disabled={laeuft}>
            {laeuft ? 'Wird geprüft…' : 'Mit Passkey bestätigen'}
          </button>
        ) : (
          <>
            <button className="admin-btn admin-btn-primary" type="button"
              onClick={() => { void mitPasskey('handy') }} disabled={laeuft}>
              {laeuft ? 'Wird geprüft…' : 'Mit dem Handy (QR-Code)'}
            </button>
            <button className="admin-btn admin-btn-secondary" type="button"
              onClick={() => { void mitPasskey('computer') }} disabled={laeuft}>
              Mit diesem Computer (Touch ID / Windows Hello)
            </button>
          </>
        ))}
        <button className="adminsite-login-link" type="button"
          onClick={() => { setFehler(null); setPhase('code') }}>
          Wiederherstellungscode verwenden
        </button>
        <button className="adminsite-login-link" type="button" onClick={onAbmelden}>
          Abmelden
        </button>
      </div>
    </div>
  )
}

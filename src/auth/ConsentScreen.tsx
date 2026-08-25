import { useState } from 'react'
import { acceptConsent, UserInfo } from '../api/auth'
import { autoBreakConfig, autoBreakRuleText } from '../api/autoBreak'
import { TenantLogo } from '../App'

interface Props {
  logoUrl: string
  displayName: string
  // Nur für die Feature-Flags: bei aktiver Pausenregelung zeigt der Screen
  // zusätzlich die **konkrete** Regel des Betriebs.
  user?: UserInfo | null
  onAccepted: () => void
}

export default function ConsentScreen({ logoUrl, displayName, user = null, onAccepted }: Props) {
  const autoBreak = autoBreakConfig(user)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAccept() {
    setError('')
    setLoading(true)
    try {
      await acceptConsent()
      onAccepted()
    } catch {
      setError('Fehler beim Speichern der Zustimmung. Bitte nochmals versuchen.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen consent-screen">
      <TenantLogo logoUrl={logoUrl} />
      <div className="auth-title">Datenschutz &amp; Nutzungsbedingungen</div>
      <div className="auth-sub">Hallo {displayName.split(' ')[0]}, bitte lies und bestätige Folgendes:</div>
      <div className="consent-version">Version 5 · August 2026</div>

      <div className="consent-box">
        <p><strong>Gespeicherte Daten:</strong></p>
        <ul>
          <li>Name und Anmeldedaten</li>
          <li>Arbeitszeiten (Ein-/Ausstempeln, Pausen)</li>
          <li>Tagesberichte, Projektdaten und Materialverbrauch</li>
          <li>Fotos von der Baustelle</li>
          <li>Abwesenheiten (Urlaub, Krankheit)</li>
        </ul>

        <p><strong>Arbeitszeit und Pausen:</strong></p>
        <ul>
          <li>
            Deine Stempelzeiten (Ein-/Ausstempeln, Pausen) werden zur Arbeitszeit- und
            Lohnabrechnung gespeichert und deinem Betrieb angezeigt.
          </li>
          <li>
            Hat dein Betrieb eine <strong>automatische Pausenregelung</strong> aktiviert, wird dir
            an Tagen mit zu wenig gestempelter Pause die fehlende Pause abgezogen — in der Regel
            die gesetzliche Mindestpause (15 Min ab 5.5 Std., 30 Min ab 7 Std., 60 Min ab 9 Std.
            Anwesenheit). Der Abzug ist in der App als <strong>«automatisch»</strong> gekennzeichnet.
          </li>
          <li>
            <strong>Hast du keine Pause gemacht, korrigierst du das selbst:</strong> Arbeitszeit →
            «Arbeitszeit korrigieren». Der Antrag geht an deinen Vorgesetzten. Dafür hast du
            <strong> 14 Tage</strong> Zeit; danach meldest du dich direkt bei ihm.
          </li>
          <li>
            Massgeblich für die Pausenregelung ist dein Arbeitsvertrag bzw. das Personalreglement
            deines Betriebs — nicht diese App.
          </li>
          {autoBreak && (
            <li><strong>Bei deinem Betrieb gilt:</strong> {autoBreakRuleText(autoBreak)}</li>
          )}
        </ul>

        <p><strong>Externe Datenverarbeitung:</strong></p>
        <ul>
          <li><strong>Mistral AI</strong> (EU/Frankreich) — Sprach- und Texterkennung (Chat, Transkription)</li>
          <li><strong>Anthropic Claude</strong> (USA, EU SCC) — PDF-Extraktion</li>
          <li><strong>Supabase</strong> (EU/Frankfurt) — Datenbank, Fotos und Dokumente</li>
          <li><strong>Backblaze B2</strong> (EU/Amsterdam) — verschlüsselte Backups</li>
          <li><strong>SMTP-Provider</strong> — E-Mail-Versand</li>
        </ul>

        <p>
          <strong>Rechtsgrundlage:</strong> Vertragserfüllung (nDSG Art. 31 Abs. 2 lit. a)
        </p>
        <p>
          Es gilt das schweizerische Datenschutzgesetz (nDSG). Deine Daten werden in
          der EU (Frankreich, Deutschland, Niederlande) gespeichert und verarbeitet.
          Ein einzelner Dienst (Anthropic Claude für die PDF-Extraktion) übermittelt
          Daten in die USA — mit Standardvertragsklauseln und Schweizer Zusatz abgesichert.
        </p>
        <p>
          Du hast jederzeit das Recht auf Auskunft, Berichtigung und Löschung deiner Daten.
          Wende dich dafür an deinen Administrator.
        </p>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <button
        className="btn-primary"
        onClick={handleAccept}
        disabled={loading}
        style={{ marginTop: 16 }}
      >
        {loading ? 'Wird gespeichert…' : '✅ Ich habe gelesen und stimme zu'}
      </button>

      <p className="auth-footer">Du kannst die App erst nach Zustimmung nutzen.</p>
    </div>
  )
}

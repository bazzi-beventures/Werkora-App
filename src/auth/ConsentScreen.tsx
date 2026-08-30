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

// Fassung 6 der Datenschutz-Information. Zwei Dinge sind gegenüber v5 anders und
// gehören zusammen gelesen:
//
// 1. Es ist eine **Information, keine Einwilligung**. Verantwortlich für die Daten
//    der Mitarbeitenden ist der Mandant (revDSG Art. 19); Werkora stellt den Text
//    in seinem Namen dar. Die Zeiterfassung selbst ist nach ArG Art. 46
//    vorgeschrieben und hängt an keiner Zustimmung. Deshalb steht hier
//    «Kenntnisnahme» und nicht «Ich stimme zu» — die Sperre bleibt, weil sie den
//    Nachweis trägt, dass die Information angekommen ist.
// 2. Die Empfängerliste ist vollständig und stimmt mit der Inventur in
//    docs/specs/datenschutz-verarbeitungsverzeichnis.md §3 überein. Wer dort einen
//    Dienst hinzufügt oder entfernt, zieht diesen Text nach und erhöht
//    CURRENT_CONSENT_VERSION (db/auth.py) — sonst behauptet die App etwas, das
//    nicht mehr gilt. Genau das war der Fehler in v5 (Anthropic stand noch drin,
//    Hosting/Mail/Push/Karten fehlten).
//
// Zwei Zeilen sind bewusst mit «wenn dein Betrieb …» formuliert: Mailweg
// (Microsoft Graph oder Gmail) und Kartendienst hängen an der Konfiguration des
// Mandanten, die der Client nicht kennt. Eine falsche Zusage wäre schlimmer als
// eine Nennung, die auf manche Betriebe nicht zutrifft.
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
      setError('Fehler beim Speichern der Bestätigung. Bitte nochmals versuchen.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen consent-screen">
      <TenantLogo logoUrl={logoUrl} />
      <div className="auth-title">Datenschutz-Information</div>
      <div className="auth-sub">Hallo {displayName.split(' ')[0]}, bitte lies das einmal durch:</div>
      <div className="consent-version">Fassung 6 · August 2026</div>

      <div className="consent-box">
        <p><strong>Wer ist wofür verantwortlich:</strong></p>
        <ul>
          <li>
            <strong>Dein Betrieb</strong> entscheidet, welche Daten hier erfasst werden, und ist
            dafür verantwortlich. An ihn richtest du alle Fragen zu deinen Daten.
          </li>
          <li>
            <strong>Werkora</strong> (Bazzi &amp; Eckert Ventures GmbH) betreibt die App in seinem
            Auftrag. Wir verarbeiten deine Daten nur so, wie er es vorgibt — wir verkaufen sie
            nicht, nutzen sie nicht für Werbung und geben sie an niemanden weiter, den dieser Text
            nicht nennt.
          </li>
        </ul>

        <p><strong>Gespeicherte Daten:</strong></p>
        <ul>
          <li>Name, E-Mail-Adresse, Rolle und Anmeldedaten</li>
          <li>Arbeitszeiten (Ein-/Ausstempeln, Pausen, Korrekturanträge)</li>
          <li>Abwesenheiten (Ferien, Krankheit, Unfall)</li>
          <li>Tagesberichte, Projektdaten, Materialverbrauch und Arbeitsstunden</li>
          <li>Fotos von der Baustelle und die Unterschrift des Kunden auf dem Rapport</li>
          <li>Technische Protokolle: wann du zuletzt in der App warst, welche Änderungen im Büro
            gemacht wurden, Fehlermeldungen bei Störungen</li>
        </ul>
        <p>
          Krankheit und Unfall sind <strong>besonders schützenswerte Gesundheitsdaten</strong>. Sie
          sehen nur deine Vorgesetzten und das Büro — nicht deine Kolleginnen und Kollegen.
        </p>

        <p><strong>Arbeitszeit und Pausen:</strong></p>
        <ul>
          <li>
            Deine Stempelzeiten (Ein-/Ausstempeln, Pausen) werden zur Arbeitszeit- und
            Lohnabrechnung gespeichert und deinem Betrieb angezeigt. Das ist gesetzlich
            vorgeschrieben (Arbeitsgesetz Art. 46) — dafür braucht es keine Einwilligung, und du
            kannst es nicht abwählen.
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

        <p><strong>Wer deine Daten sieht:</strong></p>
        <ul>
          <li>Du selbst — deine Zeiten, Rapporte und Abwesenheiten</li>
          <li>Deine Vorgesetzten und das Büro deines Betriebs, je nach Rolle</li>
          <li>Das Lohnbüro deines Betriebs, über die Stundenauswertung</li>
          <li>Werkora, soweit es für Betrieb und Fehlerbehebung nötig ist</li>
          <li>Sonst niemand.</li>
        </ul>

        <p><strong>Dienstleister in der EU und der Schweiz:</strong></p>
        <ul>
          <li><strong>Supabase</strong> (EU/Frankfurt) — Datenbank, Fotos und Dokumente</li>
          <li><strong>Mistral AI</strong> (EU/Frankreich) — Sprach- und Texterkennung, Chat</li>
          <li><strong>Backblaze</strong> (EU/Amsterdam) — verschlüsselte Sicherungskopien</li>
          <li><strong>geo.admin.ch</strong> (Schweiz, Bund) — Adressvorschläge beim Tippen</li>
          <li><strong>tel.search.ch</strong> (Schweiz) — Adress- und Telefonsuche</li>
        </ul>

        <p><strong>Dienstleister ausserhalb der EU:</strong></p>
        <ul>
          <li><strong>Railway</strong> — Betrieb der App. Die Server stehen in der EU, der Anbieter
            sitzt in den USA</li>
          <li><strong>Microsoft 365 oder Google Gmail</strong> — Versand der E-Mails an Kunden, je
            nachdem welchen Weg dein Betrieb nutzt</li>
          <li><strong>Google, Mozilla, Apple</strong> — Zustellung der Push-Meldungen aufs Handy.
            Sie sehen den Empfang, nicht den Inhalt — der ist verschlüsselt</li>
          <li><strong>Google Maps</strong> — Entfernung vom Betrieb zur Baustelle, wenn dein
            Betrieb die Distanzberechnung nutzt</li>
          <li><strong>GitHub</strong> — liefert die App auf dein Handy aus und sieht dabei deine
            IP-Adresse</li>
        </ul>
        <p>
          Für die Übermittlung in die USA bestehen die gesetzlich verlangten Garantien
          (Standardvertragsklauseln bzw. anerkannte Zertifizierungen).
        </p>

        <p><strong>Künstliche Intelligenz:</strong></p>
        <ul>
          <li>Verarbeitet wird bei <strong>Mistral AI in Frankreich</strong> — innerhalb der EU,
            ein anderer KI-Anbieter ist nicht angebunden.</li>
          <li><strong>Deine Daten werden nicht zum Training der KI verwendet.</strong> Das ist in
            unserem Konto abgeschaltet und überprüft.</li>
          <li><strong>Sprachaufnahmen werden nicht gespeichert.</strong> Was du diktierst, wird in
            Text umgewandelt und die Aufnahme danach verworfen.</li>
          <li><strong>Die KI bewertet keine Personen.</strong> Sie schreibt Rapporttexte und liest
            Dokumente — sie beurteilt weder deine Leistung noch dein Verhalten.</li>
        </ul>

        <p><strong>Was diese App bewusst nicht tut:</strong></p>
        <ul>
          <li><strong>Kein GPS, keine Standortdaten</strong> — weder beim Stempeln noch sonst. Die
            App weiss nicht, wo du bist.</li>
          <li>Keine Analysewerkzeuge, keine Werbe-Cookies. Gesetzt wird nur das Cookie, das für die
            Anmeldung nötig ist.</li>
        </ul>

        <p><strong>Daten auf deinem Handy:</strong></p>
        <p>
          Damit du auch ohne Empfang arbeiten kannst, speichert die App eine Kopie deiner Projekte,
          Aufgaben und Wochenpläne auf deinem Gerät. Sie ist dort nicht zusätzlich verschlüsselt —
          sichere dein Handy deshalb mit Code oder Fingerabdruck. Beim Abmelden wird die Kopie
          gelöscht.
        </p>

        <p><strong>Wie lange gespeichert wird:</strong></p>
        <ul>
          <li>Arbeitszeiten und Abwesenheiten: 5 Jahre (Arbeitsgesetz)</li>
          <li>Rapporte, Offerten und Rechnungen: 10 Jahre (Obligationenrecht, Geschäftsbelege)</li>
          <li>Dein Benutzerkonto: wird gesperrt, wenn du den Betrieb verlässt</li>
          <li>Sicherungskopien: 30 Tage — deshalb dauert es nach einer Löschung bis zu einen Monat,
            bis die Daten auch dort verschwunden sind</li>
        </ul>

        <p><strong>Deine Rechte:</strong></p>
        <p>
          Du hast das Recht zu erfahren, welche Daten über dich gespeichert sind, Falsches
          berichtigen zu lassen und — in den Grenzen der Aufbewahrungsfristen oben — eine Löschung
          zu verlangen. <strong>Wende dich dafür an deinen Betrieb</strong>: Er entscheidet über
          deine Daten und muss dir in der Regel innert 30 Tagen antworten. Werkora liefert ihm zu,
          was er dafür braucht, darf dir aber nicht direkt Auskunft geben.
        </p>
        <p>Bei Fragen zur App selbst: datenschutz@werkora.ch</p>

        <p>
          Es gilt das schweizerische Datenschutzgesetz (revDSG). Diese Bestätigung ist eine
          <strong> Kenntnisnahme, keine Einwilligung</strong>: Die Erfassung deiner Arbeitszeit ist
          gesetzlich vorgeschrieben und läuft unabhängig davon. Wir halten fest, wann du diese
          Information gelesen hast — das ist der Nachweis deines Betriebs, dass er dich informiert
          hat.
        </p>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <button
        className="btn-primary"
        onClick={handleAccept}
        disabled={loading}
        style={{ marginTop: 16 }}
      >
        {loading ? 'Wird gespeichert…' : '✅ Ich habe die Information gelesen'}
      </button>

      <p className="auth-footer">Du kannst die App erst nach der Bestätigung nutzen.</p>
    </div>
  )
}

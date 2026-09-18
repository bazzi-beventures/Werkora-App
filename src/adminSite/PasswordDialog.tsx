/**
 * Passwort setzen — ein Dialog für beide Fälle der Betreiber-Seite.
 *
 * Sie sehen gleich aus und sind es nicht:
 *
 * * **Eigenes Konto** (`requireCurrent`): das alte Passwort ist Pflicht. Ohne
 *   Re-Auth könnte jemand mit gekaperter Sitzung den Zugang dauerhaft
 *   übernehmen. Die eigene Sitzung überlebt, andere Geräte fliegen raus.
 * * **Fremdes Konto**: ein Reset von aussen, das alte Passwort kennt der
 *   Betreiber nicht. Dafür enden ALLE Sitzungen des Kontos — deshalb steht das
 *   in diesem Fall als Warnung im Dialog und nicht im Kleingedruckten.
 *
 * Ein Bauteil statt zweier, weil die Falle in beiden dieselbe ist: der Fehler
 * muss als Satz ankommen. Die Policy-Meldung bringt ihren Grund selbst mit
 * («zu kurz», «enthält Ihren Namen»); die übrigen Fehler beider Routen kommen
 * als rohe Codes und werden hier übersetzt (`FEHLER_TEXT`). Beides schlägt ein
 * generisches «Fehler beim Speichern», das aus einer Korrektur ein Raten macht.
 */
import { useState } from 'react'
import { ConfirmDialog } from '../admin/components/ConfirmDialog'
import { ApiError } from '../api/client'

/** Spiegelt `services/password_policy.py`. Die volle Prüfung macht das Backend;
 *  hier geht es nur darum, den offensichtlichen Fall ohne Rundreise zu melden. */
export const MIN_PASSWORD_LENGTH = 12

/**
 * Rohe Fehlercodes der beiden Passwort-Routen auf Deutsch.
 *
 * Die Policy antwortet strukturiert (`{code, message}`) und kommt als fertiger
 * Klartext an. Die übrigen Fehler beider Routen sind dagegen blosse
 * String-Details (`detail: "wrong_current_password"`), und `apiFetch` reicht
 * einen solchen String unverändert als `Error.message` durch. Ohne diese
 * Tabelle stünde im Dialog wörtlich «wrong_current_password» — ausgerechnet im
 * häufigsten Fehlerfall, dem Vertipper beim eigenen Passwort.
 *
 * Nachgeführt aus `agents/routers/auth.py::set_admin_password` (die ersten
 * beiden) und dem Plattform-Weg über `require_superadmin_for_tenant` /
 * `admin_users.set_user_password` (die übrigen).
 */
const FEHLER_TEXT: Record<string, string> = {
  current_password_required: 'Bitte das aktuelle Passwort eingeben.',
  wrong_current_password: 'Das aktuelle Passwort stimmt nicht.',
  user_not_found: 'Dieses Konto gibt es nicht mehr.',
  tenant_not_found: 'Diesen Mandanten gibt es nicht.',
  superadmin_required: 'Für diese Änderung fehlt die Berechtigung.',
  db_error: 'Die Datenbank hat die Änderung abgelehnt. Bitte nochmals versuchen.',
}

/** Anzeigetext für einen fehlgeschlagenen Versuch. Bevorzugt den
 *  maschinenlesbaren Code, fällt auf die Meldung zurück — ein strukturierter
 *  Policy-Fehler bringt seinen deutschen Text selbst mit und bleibt dabei.
 *
 *  Nicht exportiert: ein Funktions-Export aus einer Komponenten-Datei kostet
 *  eine `react-refresh/only-export-components`-Warnung, und geprüft wird die
 *  Zuordnung ohnehin durch den Dialog hindurch. */
function passwortFehlerText(e: unknown): string {
  const FALLBACK = 'Passwort konnte nicht gesetzt werden.'
  if (!(e instanceof Error)) return FALLBACK
  const schluessel = e instanceof ApiError && e.code ? e.code : e.message
  return FEHLER_TEXT[schluessel] ?? (e.message || FALLBACK)
}

interface Props {
  /** Wessen Passwort — steht in der Überschrift. */
  titel: string
  /** Altes Passwort verlangen (eigenes Konto). */
  requireCurrent?: boolean
  onSave: (neu: string, aktuell: string | null) => Promise<void>
  onClose: () => void
  onDone: (meldung: string) => void
}

export function PasswordDialog({ titel, requireCurrent = false, onSave, onClose, onDone }: Props) {
  const [aktuell, setAktuell] = useState('')
  const [neu, setNeu] = useState('')
  const [wiederholung, setWiederholung] = useState('')
  const [fehler, setFehler] = useState('')
  const [speichert, setSpeichert] = useState(false)

  const zuKurz = neu !== '' && neu.length < MIN_PASSWORD_LENGTH
  const ungleich = wiederholung !== '' && neu !== wiederholung
  const bereit =
    neu.length >= MIN_PASSWORD_LENGTH && neu === wiederholung && (!requireCurrent || aktuell !== '')

  async function speichern() {
    if (!bereit) return
    setSpeichert(true)
    setFehler('')
    try {
      await onSave(neu, requireCurrent ? aktuell : null)
      onDone('Passwort gesetzt')
    } catch (e: unknown) {
      // Das Backend antwortet mit deutschem Klartext, warum die Policy nicht
      // erfüllt ist. Diese Meldung ist der ganze Nutzen des Fehlerpfads — und
      // `passwortFehlerText` sorgt dafür, dass auch die Fehler OHNE eigenen
      // Text (rohe Codes) als Satz ankommen statt als Bezeichner.
      setFehler(passwortFehlerText(e))
      setSpeichert(false)
    }
  }

  return (
    <ConfirmDialog
      title={titel}
      message={
        requireCurrent
          ? 'Andere Geräte werden abgemeldet. Diese Sitzung bleibt bestehen.'
          : 'Das Konto wird auf allen Geräten abgemeldet und braucht danach das neue Passwort.'
      }
      confirmLabel="Passwort setzen"
      onConfirm={speichern}
      onCancel={onClose}
      busy={speichert}
      busyLabel="Wird gesetzt…"
      confirmDisabled={!bereit}
      variant="primary"
    >
      <div className="adminsite-pwd-form">
        {requireCurrent && (
          <label className="admin-form-group">
            <span className="admin-form-label">Aktuelles Passwort</span>
            <input
              className="admin-form-input"
              type="password"
              autoComplete="current-password"
              value={aktuell}
              onChange={(e) => setAktuell(e.target.value)}
            />
          </label>
        )}

        <label className="admin-form-group">
          <span className="admin-form-label">Neues Passwort</span>
          <input
            className="admin-form-input"
            type="password"
            autoComplete="new-password"
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
          />
        </label>

        <label className="admin-form-group">
          <span className="admin-form-label">Neues Passwort wiederholen</span>
          <input
            className="admin-form-input"
            type="password"
            autoComplete="new-password"
            value={wiederholung}
            onChange={(e) => setWiederholung(e.target.value)}
          />
        </label>

        <div className="admin-form-hint">
          Mindestens {MIN_PASSWORD_LENGTH} Zeichen, nicht der eigene Name und kein
          gängiges Passwort.
        </div>

        {zuKurz && <div className="admin-form-error">Zu kurz.</div>}
        {ungleich && <div className="admin-form-error">Die beiden Eingaben sind verschieden.</div>}
        {fehler && <div className="admin-form-error">{fehler}</div>}
      </div>
    </ConfirmDialog>
  )
}

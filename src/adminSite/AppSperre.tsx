/**
 * App-Sperre der Betreiber-Seite: als installierte App nur mit Fingerabdruck.
 *
 * Spec: docs/specs/admin-werkora-ch.md §15 (O3). Wann sie greift, steht in
 * `appSperreRegeln.ts`; im Browser-Tab gibt es sie nicht.
 *
 * Drei Schritte auf einem Schirm:
 *
 * - **entsperren** — das Gerät kennt ein Konto mit Passkey: Fingerabdruck,
 *   und der Server stellt eine neue Sitzung aus. Beim Erscheinen wird die
 *   Abfrage einmal von selbst gestartet; verlangt das Gerät dafür einen
 *   Fingertipp, steht der Knopf da.
 * - **passwort** — kein Konto auf dem Gerät, oder der Fingerabdruck geht
 *   nicht mehr: die normale Anmeldung.
 * - **bestaetigen** — nach dem Passwort geht es in der App erst mit
 *   Fingerabdruck weiter: einrichten, wenn das Gerät noch keinen hat, sonst
 *   damit bestätigen. Das Passwort allein öffnet die App also nie.
 *
 * Kann das Gerät keine Passkeys, bleibt die App zu — mit dem Hinweis, die
 * Seite im Browser zu öffnen. Eine Sperre, die bei fehlender Technik von
 * selbst aufgeht, wäre keine.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getMe, logout, type UserInfo } from '../api/auth'
import { passkeySupported } from '../auth/webauthn'
import { WerkoraMark } from '../brand/WerkoraMark'
import LoginScreen from './LoginScreen'
import { gemerktesKonto, kontoMerken, kontoVergessen, type AdminPasskeyKonto } from './appSperreRegeln'
import {
  adminPasskeyEinrichten,
  adminPasskeyEntsperren,
  istAbgebrochen,
  istNichtFrisch,
  istOhnePasskey,
  SchonEingerichtet,
  sperrFehlerText,
} from './adminPasskey'

type Schritt = 'entsperren' | 'passwort' | 'bestaetigen'

interface Props {
  onEntsperrt: (user: UserInfo) => void
  /** Über der laufenden Seite statt an ihrer Stelle — bei der Rückkehr aus dem
   *  Hintergrund, damit ungespeicherte Eingaben darunter stehen bleiben. */
  ueberlagert?: boolean
  /** Beim Erscheinen gleich nach dem Fingerabdruck fragen (Standard). Aus nach
   *  einem bewussten «Abmelden» — dann wartet die Sperre auf den Knopf. */
  sofortFragen?: boolean
}

function Kopf({ titel, untertitel }: { titel: string; untertitel: string }) {
  return (
    <div className="adminsite-login-brand">
      <span className="adminsite-login-mark"><WerkoraMark title="Werkora" /></span>
      <div>
        <div className="adminsite-login-title">{titel}</div>
        <div className="adminsite-login-subtitle">{untertitel}</div>
      </div>
    </div>
  )
}

export default function AppSperre({ onEntsperrt, ueberlagert = false, sofortFragen = true }: Props) {
  const [konto, setKonto] = useState<AdminPasskeyKonto | null>(gemerktesKonto)
  const [schritt, setSchritt] = useState<Schritt>(() => (gemerktesKonto() ? 'entsperren' : 'passwort'))
  const [pwUser, setPwUser] = useState<UserInfo | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const autoVersucht = useRef(false)
  const unterstuetzt = passkeySupported()

  const entsperren = useCallback(async (k: AdminPasskeyKonto, automatisch: boolean) => {
    setFehler(null)
    setLaeuft(true)
    try {
      await adminPasskeyEntsperren(k)
      onEntsperrt(await getMe())
    } catch (err: unknown) {
      if (istOhnePasskey(err)) {
        // Der Passkey ist serverseitig weg (oder nie für dieses Gerät
        // angelegt): Konto vergessen, über das Passwort neu einrichten.
        kontoVergessen()
        setKonto(null)
        setHinweis(
          'Auf diesem Gerät ist kein Fingerabdruck mehr hinterlegt. '
          + 'Mit Passwort anmelden, danach wird er neu eingerichtet.',
        )
        setSchritt('passwort')
        return
      }
      // Der Versuch beim Erscheinen darf still scheitern — iOS lässt die
      // Abfrage teils nur nach einem Fingertipp zu. Dann steht der Knopf da.
      if (automatisch && istAbgebrochen(err)) return
      setFehler(sperrFehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }, [onEntsperrt])

  useEffect(() => {
    if (!sofortFragen || schritt !== 'entsperren' || !konto || !unterstuetzt) return
    if (autoVersucht.current) return
    autoVersucht.current = true
    void entsperren(konto, true)
  }, [sofortFragen, schritt, konto, unterstuetzt, entsperren])

  const kontoPasst = konto !== null && pwUser !== null
    && konto.authorizedUserId === pwUser.authorized_user_id

  async function bestaetigen() {
    if (!pwUser || laeuft) return
    setFehler(null)
    setInfo(null)
    setLaeuft(true)
    try {
      if (kontoPasst && konto) {
        // Schon eingerichtet: der Fingerabdruck bestätigt, und der Server
        // ersetzt die Passwort-Sitzung durch eine neue.
        await adminPasskeyEntsperren(konto)
        onEntsperrt(await getMe())
      } else {
        const neu = await adminPasskeyEinrichten()
        kontoMerken(neu)
        setKonto(neu)
        onEntsperrt(pwUser)
      }
    } catch (err: unknown) {
      if (err instanceof SchonEingerichtet) {
        // Das Gerät hat für dieses Konto schon einen Passkey — das Konto ist
        // jetzt bekannt, und der nächste Tipp bestätigt damit.
        kontoMerken(err.konto)
        setKonto(err.konto)
        setInfo('Auf diesem Gerät ist der Fingerabdruck schon eingerichtet. Zum Bestätigen nochmals tippen.')
        return
      }
      if (istOhnePasskey(err)) {
        kontoVergessen()
        setKonto(null)
        setInfo('Für dieses Gerät ist kein Fingerabdruck mehr hinterlegt. Bitte neu einrichten.')
        return
      }
      if (istNichtFrisch(err)) {
        setPwUser(null)
        setHinweis('Die Anmeldung ist zu lange her. Bitte nochmals mit Passwort anmelden.')
        setSchritt('passwort')
        return
      }
      setFehler(sperrFehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }

  async function abmelden() {
    try { await logout() } catch { /* offline — die Sperre bleibt so oder so */ }
    setPwUser(null)
    setInfo(null)
    setFehler(null)
    setHinweis(null)
    setSchritt(konto ? 'entsperren' : 'passwort')
  }

  function inhalt() {
    if (!unterstuetzt) {
      return (
        <div className="adminsite-login">
          <div className="adminsite-login-card">
            <Kopf titel="Werkora Admin" untertitel="Gesperrt" />
            <div className="admin-form-hint">
              Als App öffnet sich die Betreiber-Seite nur mit Fingerabdruck oder
              Face ID — dieses Gerät bietet das für Webseiten nicht an. Bitte die
              Seite im Browser öffnen.
            </div>
          </div>
        </div>
      )
    }

    if (schritt === 'passwort') {
      return (
        <LoginScreen
          hinweis={hinweis ?? (
            'Als App geht es nur mit Fingerabdruck hinein. Einmal mit Passwort '
            + 'anmelden, danach wird der Fingerabdruck eingerichtet.'
          )}
          onLoggedIn={(u) => {
            setPwUser(u)
            setFehler(null)
            setInfo(null)
            setSchritt('bestaetigen')
          }}
          zusatz={konto ? (
            <button
              className="adminsite-login-link"
              type="button"
              onClick={() => { setFehler(null); setSchritt('entsperren') }}
            >
              Zurück zum Fingerabdruck
            </button>
          ) : undefined}
        />
      )
    }

    if (schritt === 'bestaetigen') {
      return (
        <div className="adminsite-login">
          <div className="adminsite-login-card">
            <Kopf
              titel={kontoPasst ? 'Fingerabdruck bestätigen' : 'Fingerabdruck einrichten'}
              untertitel={pwUser?.display_name ?? ''}
            />
            <div className="admin-form-hint">
              {kontoPasst
                ? 'Passwort stimmt. In der App geht es nur mit Fingerabdruck weiter.'
                : 'Passwort stimmt. In der App geht es nur mit Fingerabdruck weiter — '
                  + 'einmal einrichten, danach öffnet er die App bei jedem Start. '
                  + 'Das Gerät fragt nach Fingerabdruck, Face ID oder Geräte-Code.'}
            </div>
            {info && <div className="admin-form-hint">{info}</div>}
            {fehler && <div className="admin-form-error">{fehler}</div>}
            <button
              className="admin-btn admin-btn-primary"
              type="button"
              onClick={() => { void bestaetigen() }}
              disabled={laeuft}
            >
              {laeuft
                ? 'Wird geprüft…'
                : kontoPasst ? 'Mit Fingerabdruck bestätigen' : 'Fingerabdruck einrichten'}
            </button>
            <button className="adminsite-login-link" type="button" onClick={() => { void abmelden() }}>
              Abmelden
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="adminsite-login">
        <div className="adminsite-login-card">
          <Kopf titel="Werkora Admin" untertitel="Gesperrt" />
          <div className="admin-form-hint">
            {konto?.displayName ? `Angemeldet als ${konto.displayName}. ` : ''}
            In der App geht es nur mit Fingerabdruck oder Face ID weiter.
          </div>
          {fehler && <div className="admin-form-error">{fehler}</div>}
          <button
            className="admin-btn admin-btn-primary"
            type="button"
            onClick={() => { if (konto) void entsperren(konto, false) }}
            disabled={laeuft || !konto}
          >
            {laeuft ? 'Wird geprüft…' : 'Mit Fingerabdruck entsperren'}
          </button>
          <button
            className="adminsite-login-link"
            type="button"
            onClick={() => {
              setFehler(null)
              setHinweis('Nach dem Passwort fragt die App nochmals nach dem Fingerabdruck.')
              setSchritt('passwort')
            }}
          >
            Mit Passwort anmelden
          </button>
        </div>
      </div>
    )
  }

  if (!ueberlagert) return inhalt()
  return (
    <div className="adminsite-sperre" role="dialog" aria-modal="true" aria-label="Werkora Admin gesperrt">
      {inhalt()}
    </div>
  )
}

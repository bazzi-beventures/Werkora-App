/**
 * «Sicherheit» — Passkeys und Wiederherstellungscodes des Betreiber-Kontos.
 *
 * Spec: docs/specs/betreiber-mfa.md §5.1, §6.6, §6.7. Erreichbar über den Fuss
 * der Seitenleiste, neben «Passwort ändern».
 *
 * Alles hier verlangt eine frische Bestätigung (höchstens zehn Minuten alt,
 * für neue Codes mit Passkey). Fehlt sie, bestätigt der Dialog einmal mit
 * Passkey und wiederholt die Aktion (`mitBestaetigung`) — der Betreiber sieht
 * dabei nur die Abfrage seines Geräts.
 *
 * Die Pflicht schaltet sich erst ein, wenn die Codes abgelegt sind (Häkchen
 * «sicher abgelegt» → «Fertig»): ohne Notfallweg gibt es keine Pflicht (E6).
 */
import { useCallback, useEffect, useState } from 'react'
import { ConfirmDialog } from '../admin/components/ConfirmDialog'
import { backdropCloseProps } from '../shared/backdropClose'
import { adminPasskeyEinrichten, SchonEingerichtet } from './adminPasskey'
import {
  aktiviere,
  entfernePasskey,
  erzeugeCodes,
  ladeGeraete,
  mfaFehlerText,
  mitBestaetigung,
  type MfaGeraete,
  type MfaPasskey,
  type NeueCodes,
} from './betreiberMfa'
import { copyToClipboard } from './clipboard'

interface Props {
  onClose: () => void
  onMeldung: (text: string) => void
  /** Installierte App am Handy: «dieses Gerät» ist das Handy, nicht ein Computer. */
  appModus?: boolean
}

function datum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('de-CH')
}

function bezeichnung(p: MfaPasskey): string {
  if (p.geraet) return p.geraet
  return p.betreiber_seite ? 'Passkey Betreiber-Seite' : 'Passkey Mandanten-App'
}

function herunterladen(text: string) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'werkora-wiederherstellungscodes.txt'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    /* Ohne Blob-URL (sehr alte Browser) bleibt «Kopieren». */
  }
}

export default function SicherheitDialog({ onClose, onMeldung, appModus = false }: Props) {
  const [daten, setDaten] = useState<MfaGeraete | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [neueCodes, setNeueCodes] = useState<NeueCodes | null>(null)
  const [abgelegt, setAbgelegt] = useState(false)
  const [zuEntfernen, setZuEntfernen] = useState<MfaPasskey | null>(null)
  const [ersetzenFragen, setErsetzenFragen] = useState(false)

  const laden = useCallback(async () => {
    try {
      setDaten(await ladeGeraete())
    } catch (err: unknown) {
      setFehler(mfaFehlerText(err))
    }
  }, [])

  useEffect(() => { void laden() }, [laden])

  async function ausfuehren(aktion: () => Promise<void>) {
    if (laeuft) return
    setFehler(null)
    setLaeuft(true)
    try {
      await aktion()
    } catch (err: unknown) {
      setFehler(mfaFehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }

  const geraetEinrichten = () => ausfuehren(async () => {
    try {
      await mitBestaetigung(adminPasskeyEinrichten)
      onMeldung('Passkey eingerichtet')
    } catch (err: unknown) {
      if (!(err instanceof SchonEingerichtet)) throw err
      // Meist ein synchronisierter Passkey (Google- oder iCloud-Passwortmanager):
      // der Browser hat ihn schon und legt keinen zweiten an.
      onMeldung('Dieser Computer hat schon einen Passkey (z. B. aus dem Google- oder '
        + 'iCloud-Passwortmanager) und bestätigt damit direkt')
    }
    await laden()
  })

  const codesErzeugen = () => ausfuehren(async () => {
    setErsetzenFragen(false)
    setAbgelegt(false)
    setNeueCodes(await mitBestaetigung(erzeugeCodes))
    await laden()
  })

  async function pflichtEinschalten() {
    await mitBestaetigung(aktiviere)
    onMeldung('Zwei-Faktor-Anmeldung eingeschaltet')
    setNeueCodes(null)
    setAbgelegt(false)
    await laden()
  }

  const fertig = () => ausfuehren(async () => {
    if (daten && !daten.pflicht) {
      await pflichtEinschalten()
      return
    }
    onMeldung('Neue Wiederherstellungscodes gelten')
    setNeueCodes(null)
    await laden()
  })

  // Codes erzeugt, «Fertig» aber nie geklickt (Fenster zu, daneben geklickt):
  // die Codes gelten, die Pflicht ist aus. Ohne diesen Weg bliebe nur, die
  // Codes nochmals zu ersetzen.
  const einschalten = () => ausfuehren(pflichtEinschalten)
  const nurNochEinschalten = daten !== null && !daten.pflicht && daten.codes_uebrig > 0

  const entfernen = (p: MfaPasskey) => ausfuehren(async () => {
    setZuEntfernen(null)
    await mitBestaetigung(() => entfernePasskey(p.id))
    onMeldung('Passkey entfernt')
    await laden()
  })

  const betreiberPasskeys = daten?.passkeys.filter((p) => p.betreiber_seite).length ?? 0

  return (
    // Solange die Codes offen stehen, schliesst ein Klick daneben nicht: nach
    // «Herunterladen» landet der nächste Klick leicht neben dem Fenster, und
    // dann fehlte «Fertig» — die Pflicht bliebe aus. «×» schliesst weiter.
    <div className="admin-modal-overlay" {...backdropCloseProps(() => { if (!laeuft) onClose() }, {
      blockWhen: () => neueCodes !== null,
      onBlocked: () => { /* bewusst nichts: die Codes bleiben stehen */ },
    })}>
      <div className="admin-modal adminsite-mfa-dialog" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Sicherheit">
        <div className="admin-modal-header">
          <div className="admin-modal-title">Sicherheit</div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Schliessen"
            disabled={laeuft}>×</button>
        </div>

        <div className="admin-modal-body adminsite-mfa-body">
          {!daten && !fehler && <div className="admin-spinner" />}
          {fehler && <div className="admin-form-error">{fehler}</div>}

          {daten && neueCodes && (
            <section className="adminsite-mfa-section">
              <div className="adminsite-mfa-heading">Deine Wiederherstellungscodes</div>
              <div className="admin-form-hint">
                Jeder Code gilt genau einmal und ersetzt den Passkey, nicht das Passwort.
                Sie erscheinen nur jetzt — ausdrucken oder im Passwort-Manager ablegen,
                nicht nur auf dem Handy.
              </div>
              <ol className="adminsite-mfa-codes">
                {neueCodes.codes.map((c) => <li key={c}>{c}</li>)}
              </ol>
              <div className="adminsite-mfa-row">
                <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                  onClick={() => herunterladen(neueCodes.text)}>
                  Herunterladen (.txt)
                </button>
                <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                  onClick={() => {
                    void copyToClipboard(neueCodes.text).then((ok) => {
                      onMeldung(ok ? 'Codes kopiert' : 'Kopieren ging nicht')
                    })
                  }}>
                  Kopieren
                </button>
              </div>
              <label className="adminsite-mfa-check">
                <input type="checkbox" checked={abgelegt} onChange={(e) => setAbgelegt(e.target.checked)} />
                Ich habe die Codes sicher abgelegt.
              </label>
              <button type="button" className="admin-btn admin-btn-primary"
                disabled={!abgelegt || laeuft} onClick={() => { void fertig() }}>
                {daten.pflicht ? 'Fertig' : 'Fertig — Zwei-Faktor-Anmeldung einschalten'}
              </button>
            </section>
          )}

          {daten && !neueCodes && (
            <>
              <section className="adminsite-mfa-section">
                <div className={daten.pflicht ? 'admin-form-hint' : 'admin-form-error'}>
                  {daten.pflicht
                    ? `Zwei-Faktor-Anmeldung ist aktiv (seit ${datum(daten.pflicht_seit)}). `
                      + 'Ein Passwort allein öffnet die Betreiber-Seite nicht.'
                    : nurNochEinschalten
                      ? 'Zwei-Faktor-Anmeldung ist noch nicht eingeschaltet. Die Wiederherstellungs'
                        + 'codes sind erzeugt — es fehlt nur noch dieser Schritt.'
                      : 'Zwei-Faktor-Anmeldung ist noch nicht aktiv. Sie wird mit dem ersten '
                        + 'Satz Wiederherstellungscodes eingeschaltet.'}
                </div>
                {nurNochEinschalten && (
                  <>
                    <label className="adminsite-mfa-check">
                      <input type="checkbox" checked={abgelegt} onChange={(e) => setAbgelegt(e.target.checked)} />
                      Ich habe die Codes sicher abgelegt.
                    </label>
                    <button type="button" className="admin-btn admin-btn-primary"
                      disabled={!abgelegt || laeuft} onClick={() => { void einschalten() }}>
                      Zwei-Faktor-Anmeldung einschalten
                    </button>
                  </>
                )}
              </section>

              <section className="adminsite-mfa-section">
                <div className="adminsite-mfa-heading">Passkeys</div>
                {daten.passkeys.length === 0 && <div className="admin-form-hint">Noch keiner.</div>}
                <ul className="adminsite-mfa-liste">
                  {daten.passkeys.map((p) => (
                    <li key={p.id}>
                      <div>
                        <div className="adminsite-mfa-name">{bezeichnung(p)}</div>
                        <div className="adminsite-mfa-meta">
                          {p.domain} · angelegt {datum(p.angelegt)} · zuletzt {datum(p.zuletzt)}
                        </div>
                      </div>
                      <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                        disabled={laeuft} onClick={() => setZuEntfernen(p)}>
                        Entfernen
                      </button>
                    </li>
                  ))}
                </ul>
                {daten.pflicht && betreiberPasskeys < 2 && (
                  <div className="admin-form-hint-warn">
                    Nur ein Passkey für die Betreiber-Seite. Geht dieses Gerät verloren,
                    bleiben nur die Wiederherstellungscodes — besser einen zweiten einrichten.
                  </div>
                )}
                <button type="button" className="admin-btn admin-btn-secondary"
                  disabled={laeuft} onClick={() => { void geraetEinrichten() }}>
                  {appModus ? 'Passkey auf diesem Handy einrichten' : 'Diesen Computer merken (Touch ID / Windows Hello)'}
                </button>
              </section>

              <section className="adminsite-mfa-section">
                <div className="adminsite-mfa-heading">Wiederherstellungscodes</div>
                <div className={daten.pflicht && daten.codes_uebrig <= 3 ? 'admin-form-hint-warn' : 'admin-form-hint'}>
                  {daten.codes_uebrig === 0 && !daten.pflicht
                    ? 'Noch keine erzeugt.'
                    : `Noch ${daten.codes_uebrig} Code${daten.codes_uebrig === 1 ? '' : 's'} übrig.`}
                </div>
                <button type="button" className="admin-btn admin-btn-primary" disabled={laeuft}
                  onClick={() => {
                    if (daten.codes_uebrig > 0) setErsetzenFragen(true)
                    else void codesErzeugen()
                  }}>
                  {laeuft ? 'Bitte warten…' : 'Neue Wiederherstellungscodes erzeugen'}
                </button>
              </section>
            </>
          )}
        </div>
      </div>

      {zuEntfernen && (
        <ConfirmDialog
          title="Passkey entfernen?"
          message={`${bezeichnung(zuEntfernen)} (${zuEntfernen.domain}) meldet sich danach nicht mehr an.`}
          confirmLabel="Entfernen"
          variant="danger"
          onConfirm={() => { void entfernen(zuEntfernen) }}
          onCancel={() => setZuEntfernen(null)}
        />
      )}
      {ersetzenFragen && (
        <ConfirmDialog
          title="Neue Codes erzeugen?"
          message="Die bisherigen Wiederherstellungscodes gelten danach nicht mehr."
          confirmLabel="Neue Codes erzeugen"
          onConfirm={() => { void codesErzeugen() }}
          onCancel={() => setErsetzenFragen(false)}
        />
      )}
    </div>
  )
}

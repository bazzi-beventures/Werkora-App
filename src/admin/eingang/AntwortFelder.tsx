import { useId, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { backdropCloseProps } from '../../shared/backdropClose'
import {
  sendMailAntwort, type AntwortGesendet, type AntwortPayload,
} from '../../api/admin/mailEingang'
import { mailtoLink, serverSatz, type VorschlagEingabe } from './mailEingang'

/**
 * Antwort an den Absender — docs/specs/mail-eingang-aufgaben-antworten.md §5.4, §5.5.
 *
 * **B1 (alle):** Betreff und Text sind editierbar; «Text kopieren» ist der
 * Normalweg (im Mailprogramm auf die Original-Mail antworten und einfügen — so
 * bleibt die Antwort im Verlauf), «Im Mailprogramm öffnen» eine neue Mail per
 * `mailto:`. Werkora sendet dabei nichts.
 *
 * **B2 (Beta, `sendenErlaubt`):** «Senden…» öffnet einen Dialog mit genau dem,
 * was hinausgeht. Steht die Adresse nicht im Kundenstamm, braucht es ein
 * zweites, ausdrückliches Ja.
 */

interface Props {
  itemId: string
  suggestionId: string
  payload: AntwortPayload
  eingabe: VorschlagEingabe
  disabled: boolean
  sendenErlaubt: boolean
  setFeld: (key: string, wert: string) => void
  onGesendet: (ergebnis: AntwortGesendet) => void
  /** 409 «nicht mehr offen»: der Screen meldet es und lädt neu. */
  onSchonEntschieden: (fehler: unknown) => void
}

export default function AntwortFelder({
  itemId, suggestionId, payload: p, eingabe, disabled, sendenErlaubt, setFeld, onGesendet, onSchonEntschieden,
}: Props) {
  const feldId = useId()
  const [kopiert, setKopiert] = useState<'ja' | 'fehler' | null>(null)
  const [dialog, setDialog] = useState(false)
  const betreff = eingabe.felder.betreff ?? ''
  const text = eingabe.felder.text ?? ''
  const mailto = mailtoLink(p.an, betreff, text)

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text)
      setKopiert('ja')
    } catch {
      setKopiert('fehler')
    }
  }

  return (
    <div className="eingang-felder">
      {/* Fremdtext aus der Mail: als Text, nie als Link. */}
      <dl className="eingang-werte eingang-feld-breit">
        <div><dt>An:</dt><dd>{p.an}</dd></div>
        <div><dt>Art:</dt><dd>{p.art_label}</dd></div>
      </dl>
      <div className="eingang-hinweis eingang-feld-breit">
        {p.an_bekannt ? 'Die Adresse steht im Kundenstamm.' : 'Adresse nur aus der weitergeleiteten Mail gelesen.'}
      </div>
      <label className="admin-form-group eingang-feld-breit" htmlFor={`${feldId}-betreff`}>
        <span className="admin-form-label">Betreff</span>
        <input id={`${feldId}-betreff`} className="admin-form-input" type="text" maxLength={200}
               value={betreff} disabled={disabled} onChange={e => setFeld('betreff', e.target.value)} />
      </label>
      <label className="admin-form-group eingang-feld-breit" htmlFor={`${feldId}-text`}>
        <span className="admin-form-label">Text</span>
        <textarea id={`${feldId}-text`} className="admin-form-input" rows={8} maxLength={4000}
                  value={text} disabled={disabled} onChange={e => setFeld('text', e.target.value)} />
      </label>
      <div className="eingang-aktionen eingang-feld-breit">
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                disabled={disabled || !text.trim()} onClick={() => void kopieren()}>
          Text kopieren
        </button>
        {mailto ? (
          <a className="admin-btn admin-btn-secondary admin-btn-sm" href={mailto}>Im Mailprogramm öffnen</a>
        ) : (
          <span className="eingang-hinweis">Zu lang für «Im Mailprogramm öffnen» — bitte kopieren.</span>
        )}
        {sendenErlaubt && (
          <button type="button" className="admin-btn admin-btn-primary admin-btn-sm"
                  disabled={disabled || !text.trim() || !betreff.trim()} onClick={() => setDialog(true)}>
            Senden…
          </button>
        )}
        {kopiert === 'ja' && (
          <span className="eingang-hinweis" role="status">
            Kopiert. Im Mailprogramm auf die Original-Mail antworten und einfügen.
          </span>
        )}
        {kopiert === 'fehler' && (
          <span className="admin-form-error" role="alert">Kopieren ging nicht — bitte den Text markieren.</span>
        )}
      </div>
      {dialog && (
        <SendenDialog
          itemId={itemId}
          suggestionId={suggestionId}
          an={p.an}
          anBekannt={!!p.an_bekannt}
          betreff={betreff.trim()}
          text={text.trim()}
          onClose={() => setDialog(false)}
          onGesendet={ergebnis => { setDialog(false); onGesendet(ergebnis) }}
          onSchonEntschieden={fehler => { setDialog(false); onSchonEntschieden(fehler) }}
        />
      )}
    </div>
  )
}

interface DialogProps {
  itemId: string
  suggestionId: string
  an: string
  anBekannt: boolean
  betreff: string
  text: string
  onClose: () => void
  onGesendet: (ergebnis: AntwortGesendet) => void
  onSchonEntschieden: (fehler: unknown) => void
}

function SendenDialog({
  itemId, suggestionId, an, anBekannt, betreff, text, onClose, onGesendet, onSchonEntschieden,
}: DialogProps) {
  const [bestaetigt, setBestaetigt] = useState(false)
  const [mussBestaetigen, setMussBestaetigen] = useState(!anBekannt)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  // Zwei Klicks im selben Augenblick senden nicht doppelt — der Server claimt zusätzlich.
  const sperre = useRef(false)

  async function senden() {
    if (sperre.current) return
    sperre.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      onGesendet(await sendMailAntwort(itemId, suggestionId, { betreff, text }, mussBestaetigen && bestaetigt))
    } catch (e) {
      const satz = serverSatz(e instanceof Error ? e.message : '')
      if (e instanceof ApiError && e.status === 409 && !satz) {
        onSchonEntschieden(e)
        return
      }
      // 409 mit Satz: die Adresse steht (inzwischen) nicht im Kundenstamm.
      if (e instanceof ApiError && e.status === 409) setMussBestaetigen(true)
      setFehler(satz ?? 'Die Antwort liess sich nicht senden.')
    } finally {
      sperre.current = false
      setLaeuft(false)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" role="dialog" aria-label="Antwort senden" style={{ maxWidth: 560 }}
           onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Antwort senden</div>
          <button type="button" className="admin-modal-close" aria-label="Schliessen" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="eingang-hinweis">
            Genau das geht hinaus — vom Firmen-Postfach, mit einer Kopie dorthin.
          </div>
          <dl className="eingang-werte">
            <div><dt>An:</dt><dd>{an}</dd></div>
            <div><dt>Betreff:</dt><dd>{betreff}</dd></div>
          </dl>
          <pre className="eingang-original">{text}</pre>
          {mussBestaetigen && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
              <input type="checkbox" checked={bestaetigt} onChange={e => setBestaetigt(e.target.checked)} />
              <span>
                Die Adresse stammt nur aus der weitergeleiteten Mail und steht nicht im Kundenstamm.
                Ich habe geprüft, dass sie stimmt.
              </span>
            </label>
          )}
          {fehler && <div className="admin-form-error" role="alert">{fehler}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="admin-btn admin-btn-primary" style={{ flex: 1 }}
                    disabled={laeuft || (mussBestaetigen && !bestaetigt)} onClick={() => void senden()}>
              {laeuft ? 'Wird gesendet…' : 'Jetzt senden'}
            </button>
            <button type="button" className="admin-btn admin-btn-secondary" disabled={laeuft} onClick={onClose}>
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

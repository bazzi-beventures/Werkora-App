import { useEffect, useState } from 'react'
import { ApiError } from '../../api/client'
import {
  type MeldungAnsicht, type MeldungArt,
  fetchMeldung, inMinuten, sendeMeldung,
} from '../../api/serviceBegleitung'
import { useOnline } from '../../shared/useOnline'
import './unterwegs.css'

// Knopf «Unterwegs» am Einsatz von heute — Servicebegleitung, Werkzeug
// «Unterwegs-Meldung» (docs/specs/servicebegleitung.md §5.2).
//
// Zwei Tipps statt einem: «Unterwegs» öffnet ein Blatt mit der Ankunftszeit
// (vorgewählt die gerechnete Zeit, darunter Chips), erst «Melden» sendet. Die Zeit
// ist eine Schätzung ohne Standort — ein Blick des Monteurs darauf ist billiger als
// eine falsche Zusage an den Kunden. Danach wird der Knopf zu «Vor Ort», daneben
// klein «Verspätung melden».
//
// Der Browser fragt NIE nach dem Standort; `keineOrtung.guard.test.mjs` hält fest,
// dass es in `src/` keinen Zugriff darauf gibt.
//
// Offline gesperrt, mit Grund und Telefon-Link — keine Warteschlange: eine «in 20
// Minuten»-Meldung, die eine halbe Stunde später zugestellt wird, ist falsch.

interface Props {
  appointmentId: string
  /** Telefonnummer, die schon ohne Netz bekannt ist (Kontakt aus dem Wochenplan). */
  telefonOffline?: string
}

function telHref(nummer: string): string {
  return `tel:${nummer.replace(/\s/g, '')}`
}

function fehlerText(e: unknown): string {
  if (e instanceof ApiError && e.message) return e.message
  return 'Die Meldung ging nicht durch. Bitte nochmals versuchen.'
}

export function UnterwegsKnopf({ appointmentId, telefonOffline = '' }: Props) {
  const online = useOnline()
  const [ansicht, setAnsicht] = useState<MeldungAnsicht | null>(null)
  const [blatt, setBlatt] = useState<MeldungArt | null>(null)
  const [zeit, setZeit] = useState('')
  const [sending, setSending] = useState(false)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!online) return
    let alive = true
    fetchMeldung(appointmentId)
      .then(a => { if (alive) setAnsicht(a) })
      // Ohne Ansicht kein Knopf: ein Fehler hier (fremdes Team, Werkzeug aus)
      // soll die Karte nicht mit einer Meldung belasten.
      .catch(() => { if (alive) setAnsicht(null) })
    return () => { alive = false }
  }, [appointmentId, online])

  const telefon = ansicht?.telefon || telefonOffline
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  if (!online) {
    return (
      <div className="unterwegs" onClick={stop}>
        <button className="unterwegs-btn" disabled>Unterwegs</button>
        <div className="unterwegs-sub">
          Offline — melden geht nur mit Netz.
          {telefon && <> Bitte anrufen: <a href={telHref(telefon)}>{telefon}</a></>}
        </div>
      </div>
    )
  }
  if (!ansicht) return null

  function oeffnen(art: MeldungArt) {
    setBlatt(art)
    setFehler(null)
    setHinweis(null)
    setZeit(art === 'unterwegs' && ansicht?.vorschlag ? ansicht.vorschlag : '')
  }

  async function melden(art: MeldungArt, ankunft: string | null) {
    if (sending) return
    setSending(true)
    setFehler(null)
    try {
      const antwort = await sendeMeldung(appointmentId, art, ankunft)
      setAnsicht(prev => (prev ? { ...prev, ...antwort.stand } : prev))
      setHinweis(antwort.hinweis || null)
      setBlatt(null)
    } catch (e) {
      setFehler(fehlerText(e))
    } finally {
      setSending(false)
    }
  }

  const { stand } = ansicht

  if (stand === 'erledigt') {
    return <div className="unterwegs unterwegs-sub" onClick={stop}>✓ Erledigt</div>
  }
  if (stand === 'vor_ort') {
    return <div className="unterwegs unterwegs-sub" onClick={stop}>Vor Ort seit {ansicht.vor_ort_at}</div>
  }

  return (
    <div className="unterwegs" onClick={stop}>
      {stand === 'geplant' && blatt === null && (
        <button className="unterwegs-btn" onClick={() => oeffnen('unterwegs')}>Unterwegs</button>
      )}
      {stand === 'unterwegs' && blatt === null && (
        <>
          <div className="unterwegs-stand">
            Unterwegs gemeldet {ansicht.unterwegs_at}, Ankunft ca. {ansicht.ankunft_ca}
          </div>
          <div className="unterwegs-row">
            <button className="unterwegs-btn" disabled={sending} onClick={() => void melden('vor_ort', null)}>
              Vor Ort
            </button>
            <button className="unterwegs-link" onClick={() => oeffnen('verspaetung')}>Verspätung melden</button>
          </div>
        </>
      )}

      {blatt !== null && (
        <div className="unterwegs-blatt" role="dialog" aria-label={blatt === 'unterwegs' ? 'Unterwegs melden' : 'Verspätung melden'}>
          <label className="unterwegs-label">
            {blatt === 'unterwegs' ? 'Ankunft beim Kunden ca.' : 'Neue Ankunftszeit ca.'}
            <input
              type="time"
              step={300}
              value={zeit}
              onChange={e => setZeit(e.target.value)}
              aria-label="Ankunftszeit"
            />
          </label>
          <div className="unterwegs-chips">
            {ansicht.chips.map(min => (
              <button key={min} className="unterwegs-chip" onClick={() => setZeit(inMinuten(min))}>
                in {min} Min.
              </button>
            ))}
          </div>
          {!ansicht.kunde_erreichbar && (
            <div className="unterwegs-sub">
              Kein Kontakt hinterlegt.
              {telefon ? <> Bitte anrufen: <a href={telHref(telefon)}>{telefon}</a></> : ' Bitte das Büro informieren.'}
            </div>
          )}
          {ansicht.kunde_erreichbar && ansicht.nachrichten_uebrig === 0 && (
            <div className="unterwegs-sub">Der Kunde wurde heute schon dreimal informiert — die Meldung wird nur gespeichert.</div>
          )}
          <div className="unterwegs-row">
            <button className="unterwegs-btn" disabled={!zeit || sending} onClick={() => void melden(blatt, zeit)}>
              {sending ? 'Senden…' : 'Melden'}
            </button>
            <button className="unterwegs-link" onClick={() => setBlatt(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {hinweis && <div className="unterwegs-sub" role="status">{hinweis}</div>}
      {fehler && <div className="unterwegs-fehler" role="alert">{fehler}</div>}
    </div>
  )
}

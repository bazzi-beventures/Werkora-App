import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type MsVerbindung, type MsZweck, getMicrosoft, sendeTestmail, startAdminFreigabe, startMicrosoft,
} from '../../api/admin/microsoft'
import { queryClient } from '../../shared/queryClient'
import { ZWECK_TEXT, gueltigeAdresse, kartenZustand, zustandText } from '../../shared/microsoftKarte'
import { ToastHost, type ToastFn, useToast } from '../components/useToast'
import { BetaBadge } from '../../shared/BetaBadge'
import './MicrosoftScreen.css'

// ─── «Microsoft 365»: der Betrieb verbindet sein Mailsystem selbst ──────────
//
// Spec docs/specs/microsoft-365-verbindung.md §6, §9.2 (Beta-Feature
// `microsoft_verbindung`). Zwei Karten: «Versand & Kalender» (info@) und, mit dem
// Modul Mail-Eingang, «Mail-Eingang» (eigenes Postfach). «Mit Microsoft verbinden»
// öffnet die Anmeldung bei Microsoft in einem neuen Fenster; danach zeigt die Karte
// den neuen Stand, sobald man hierher zurückkommt (Abfrage beim Fokus).
// «Trennen» gibt es hier bewusst nicht (Spec §15/9): ein versehentlicher Klick schickte
// die Kundenmails still über den alten Weg. Getrennt wird auf der Betreiber-Seite;
// «Neu verbinden» ersetzt eine Verbindung, bei Microsoft bleibt «Meine Apps».

const MS_KEY = ['admin', 'microsoft'] as const

function oeffne(url: string, fenster: Window | null) {
  if (fenster) {
    fenster.opener = null
    fenster.location.href = url
  } else {
    window.location.href = url
  }
}

export default function MicrosoftScreen() {
  const { toast, showToast } = useToast(5000)
  const { data, isLoading, error } = useQuery({
    queryKey: MS_KEY, queryFn: getMicrosoft, refetchOnWindowFocus: true,
  }, queryClient)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Microsoft 365 <BetaBadge /></div>
          <div className="admin-page-subtitle">Kundenmails aus dem eigenen Postfach, Termine im Outlook-Kalender</div>
        </div>
      </div>
      {isLoading && <div className="admin-loading"><div className="admin-spinner" /> Wird geladen…</div>}
      {error && <div className="admin-form-error">Zustand nicht lesbar: {(error as Error).message}</div>}
      {data && (
        <div className="ms-karten">
          {(['versand', 'eingang'] as MsZweck[])
            .filter(z => z === 'versand' || data.mail_eingang)
            .map(zweck => (
              <VerbindungsKarte key={zweck} zweck={zweck} eingerichtet={data.eingerichtet}
                verbindung={data.verbindungen.find(v => v.zweck === zweck)}
                vorschlag={data.vorschlag?.[zweck] ?? ''} showToast={showToast} />
            ))}
          <p className="ms-fussnote">
            Zeigt Microsoft «Genehmigung erforderlich», muss der Administrator eures Microsoft-Kontos Werkora
            einmal freigeben («Als Administrator freigeben» bei der Karte). Auch danach kommt Werkora nur an
            die Postfächer, die sich hier selbst anmelden.
          </p>
          <p className="ms-fussnote">
            Eine Verbindung aufheben: über den Werkora-Support. Ihr könnt Werkora ausserdem jederzeit bei
            Microsoft entfernen («Meine Apps» bzw. im Microsoft-Admin unter «Unternehmensanwendungen»).
          </p>
        </div>
      )}
      <ToastHost toast={toast} />
    </div>
  )
}

function VerbindungsKarte({ zweck, eingerichtet, verbindung, vorschlag, showToast }: {
  zweck: MsZweck
  eingerichtet: boolean
  verbindung: MsVerbindung | undefined
  vorschlag: string
  showToast: ToastFn
}) {
  const zustand = kartenZustand(eingerichtet, verbindung)
  const [adresse, setAdresse] = useState(verbindung?.mailbox || vorschlag)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setAdresse(verbindung?.mailbox || vorschlag) }, [verbindung?.mailbox, vorschlag])

  async function ablauf(schritt: () => Promise<void>) {
    setBusy(true)
    try {
      await schritt()
    } catch (e) {
      showToast((e as Error).message || 'Fehlgeschlagen', 'error')
    } finally {
      setBusy(false)
    }
  }

  const verbinden = () => {
    // Fenster sofort öffnen (im Klick), sonst blockiert der Browser das Popup.
    const fenster = window.open('about:blank', '_blank')
    void ablauf(async () => {
      try {
        oeffne((await startMicrosoft(zweck, adresse.trim())).url, fenster)
      } catch (e) {
        fenster?.close()
        throw e
      }
    })
  }
  const freigeben = () => {
    const fenster = window.open('about:blank', '_blank')
    void ablauf(async () => oeffne((await startAdminFreigabe(zweck)).url, fenster))
  }
  const testmail = () => void ablauf(async () => {
    showToast((await sendeTestmail()).message || 'Testmail gesendet')
  })

  const verbunden = zustand === 'verbunden' || zustand === 'rechte_fehlen' || zustand === 'getrennt'
  return (
    <div className={`admin-table-wrap ms-karte ms-karte--${zustand}`}>
      <div className="admin-section-title">{ZWECK_TEXT[zweck].titel}</div>
      <p className="ms-zustand">{zustandText(zustand, verbindung)}</p>
      <p className="ms-hinweis">{ZWECK_TEXT[zweck].hinweis}</p>
      {zustand !== 'nicht_eingerichtet' && (
        <>
          <label className="ms-feld">
            {ZWECK_TEXT[zweck].adresse}
            <input className="admin-form-input" type="email" value={adresse} disabled={busy}
              onChange={e => setAdresse(e.target.value)} placeholder="info@firma.ch" />
          </label>
          <div className="ms-knoepfe">
            <button className="admin-btn admin-btn-primary" disabled={busy || !gueltigeAdresse(adresse)}
              onClick={verbinden}>
              {verbunden ? 'Neu verbinden' : 'Mit Microsoft verbinden'}
            </button>
            {zweck === 'versand' && zustand === 'verbunden' && (
              <button className="admin-btn admin-btn-secondary" disabled={busy} onClick={testmail}>Testmail an mich</button>
            )}
            <button className="admin-btn admin-btn-secondary" disabled={busy} onClick={freigeben}>
              Als Administrator freigeben
            </button>
          </div>
        </>
      )}
    </div>
  )
}

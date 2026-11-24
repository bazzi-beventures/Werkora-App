import { useEffect, useState } from 'react'
import * as scoped from '../../tenantScopedApi'
import type { Antwort } from '../../../api/generated'
import { useToast, ToastHost } from '../../../admin/components/useToast'
import { copyToClipboard } from '../../clipboard'
import { ZWECK_TEXT, type MsZweck, gueltigeAdresse, kartenZustand, zustandText } from '../../../shared/microsoftKarte'

// ─── Reiter «Microsoft 365» (docs/specs/microsoft-365-verbindung.md §9.3) ─────
//
// Zustand beider Verbindungen des Mandanten und «Link für den Betrieb erzeugen»:
// 7 Tage gültig, einmal einlösbar. «Testmail an mich» und «Trennen» gibt es nur hier,
// nicht im Admin des Betriebs (Spec §15/9). «Per Mail senden» zeigt zuerst einen kurzen
// Standard-Entwurf (Empfänger, Betreff, Text änderbar); erst «Senden» erzeugt den Link,
// setzt ihn für den Platzhalter ein und schickt die Mail aus dem Postfach des
// Betreiber-Mandanten (§15/10). Verbinden muss sich der Betrieb selbst — mit
// dem Postfach, dessen Adresse hier steht; meldet sich ein anderes Konto an,
// lehnt Werkora ab (§6.2). Rückfälle im Pilot und Schatten-Abweichungen stehen
// unter «Error-Logs» (Quellen `ms_rueckfall`, `ms_schatten_abweichung`).

type Zustand = Antwort<'MsZustand'>

export function MicrosoftTab({ tenantId }: { tenantId: string }) {
  const { toast, showToast } = useToast(5000)
  const [zustand, setZustand] = useState<Zustand | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const laden = () => {
    scoped.getPlatformMicrosoft(tenantId)
      .then(z => { setZustand(z); setFehler(null) })
      .catch((e: Error) => setFehler(e.message))
  }
  useEffect(laden, [tenantId])

  if (fehler) return <div className="admin-form-error">Zustand nicht lesbar: {fehler}</div>
  if (!zustand) return <div className="admin-loading"><div className="admin-spinner" /> Wird geladen…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      {!zustand.eingerichtet && (
        <div className="admin-form-error">
          In dieser Umgebung fehlt die Werkora-App (MS_APP_CLIENT_ID, MS_APP_CLIENT_SECRET,
          MS_OAUTH_REDIRECT_URI, MS_TOKEN_KEY).
        </div>
      )}
      {(['versand', 'eingang'] as MsZweck[])
        .filter(z => z === 'versand' || zustand.mail_eingang)
        .map(zweck => (
          <Karte key={zweck} tenantId={tenantId} zweck={zweck} eingerichtet={zustand.eingerichtet}
            verbindung={zustand.verbindungen.find(v => v.zweck === zweck)}
            vorschlag={zustand.vorschlag?.[zweck] ?? ''} absender={zustand.link_absender ?? null}
            neuLaden={laden} showToast={showToast} />
        ))}
      <ToastHost toast={toast} />
    </div>
  )
}

function Karte({ tenantId, zweck, eingerichtet, verbindung, vorschlag, absender, neuLaden, showToast }: {
  tenantId: string
  zweck: MsZweck
  eingerichtet: boolean
  verbindung: Antwort<'MsVerbindung'> | undefined
  vorschlag: string
  absender: string | null
  neuLaden: () => void
  showToast: ReturnType<typeof useToast>['showToast']
}) {
  const zustand = kartenZustand(eingerichtet, verbindung)
  const [adresse, setAdresse] = useState(verbindung?.mailbox || vorschlag)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mail, setMail] = useState<{ an: string; betreff: string; text: string; platzhalter: string } | null>(null)

  async function erzeugen() {
    setBusy(true)
    try {
      const { url } = await scoped.createMicrosoftLink(tenantId, zweck, adresse.trim())
      setLink(url)
      showToast(await copyToClipboard(url) ? 'Link kopiert (7 Tage gültig)' : 'Link erzeugt')
    } catch (e) {
      showToast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function perMail() {
    if (!mail) return
    setBusy(true)
    try {
      const antwort = await scoped.sendMicrosoftLinkMail(tenantId, zweck, adresse.trim(), mail.an.trim(),
        mail.betreff, mail.text)
      showToast(antwort.message || 'Link gesendet')
      setMail(null)
    } catch (e) {
      showToast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function entwurf() {
    setBusy(true)
    try {
      const e = await scoped.getMicrosoftLinkEntwurf(tenantId, zweck, adresse.trim())
      setMail({ an: e.an, betreff: e.betreff, text: e.text, platzhalter: e.platzhalter })
    } catch (e) {
      showToast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function testmail() {
    setBusy(true)
    try {
      const antwort = await scoped.sendPlatformMicrosoftTestmail(tenantId)
      showToast(antwort.message || 'Testmail gesendet')
    } catch (e) {
      showToast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function trennen() {
    if (!window.confirm(`${ZWECK_TEXT[zweck].titel} dieses Betriebs trennen?`)) return
    setBusy(true)
    try {
      await scoped.deletePlatformMicrosoft(tenantId, zweck)
      showToast('Verbindung getrennt')
      neuLaden()
    } catch (e) {
      showToast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 20 }}>
      <div className="admin-section-title">{ZWECK_TEXT[zweck].titel}</div>
      <p style={{ margin: '8px 0', fontWeight: 600 }}>{zustandText(zustand, verbindung)}</p>
      {verbindung?.verbunden && (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
          Letzter Erfolg: {verbindung.last_ok_at ?? '–'} · Rechte: {(verbindung.granted_scopes ?? []).join(', ') || '–'}
          {verbindung.last_error ? ` · Letzter Fehler: ${verbindung.last_error}` : ''}
        </p>
      )}
      {eingerichtet && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="admin-form-input" style={{ maxWidth: 280 }} type="email" value={adresse}
            onChange={e => setAdresse(e.target.value)} placeholder={ZWECK_TEXT[zweck].adresse} />
          <button className="admin-btn admin-btn-primary" disabled={busy || !gueltigeAdresse(adresse)}
            onClick={() => void erzeugen()}>
            Link für den Betrieb erzeugen
          </button>
          <button className="admin-btn admin-btn-secondary" disabled={busy || !gueltigeAdresse(adresse) || !absender}
            title={absender ? undefined : 'Ihr Konto gehört nicht zum Betreiber-Mandanten'}
            onClick={() => void entwurf()}>
            Per Mail senden
          </button>
          {zweck === 'versand' && zustand === 'verbunden' && (
            <button className="admin-btn admin-btn-secondary" disabled={busy} onClick={() => void testmail()}>
              Testmail an mich
            </button>
          )}
          {verbindung?.verbunden && (
            <button className="admin-btn admin-btn-secondary" disabled={busy} onClick={() => void trennen()}>
              Trennen
            </button>
          )}
        </div>
      )}
      {mail && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="admin-section-title">Entwurf — vor dem Senden durchlesen</div>
          <label style={{ fontSize: 13 }}>
            An
            <input className="admin-form-input" type="email" value={mail.an} disabled={busy}
              onChange={e => setMail({ ...mail, an: e.target.value })} />
          </label>
          <label style={{ fontSize: 13 }}>
            Betreff
            <input className="admin-form-input" maxLength={200} value={mail.betreff} disabled={busy}
              onChange={e => setMail({ ...mail, betreff: e.target.value })} />
          </label>
          <label style={{ fontSize: 13 }}>
            Text
            <textarea className="admin-form-input" rows={10} maxLength={4000} value={mail.text} disabled={busy}
              onChange={e => setMail({ ...mail, text: e.target.value })} />
          </label>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            Absender: {absender}. {mail.platzhalter} wird beim Senden durch einen neuen Link (7 Tage gültig)
            ersetzt — als Knopf «Mit Microsoft verbinden» und als Text.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="admin-btn admin-btn-primary"
              disabled={busy || !gueltigeAdresse(mail.an) || !mail.betreff.trim() || !mail.text.trim()}
              onClick={() => void perMail()}>
              Senden
            </button>
            <button className="admin-btn admin-btn-secondary" disabled={busy} onClick={() => setMail(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {link && (
        <textarea className="admin-form-input" readOnly rows={3} value={link}
          style={{ marginTop: 12, width: '100%', fontFamily: 'var(--mono)', fontSize: 12 }} />
      )}
    </div>
  )
}

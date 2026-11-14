import { useEffect, useState } from 'react'
import {
  type Terminanfrage, type TerminwahlAnsicht,
  anfrageStandText, fetchKundenlink, fetchTerminwahl, sperreKundenlink, zieheTerminanfrageZurueck,
} from '../../../api/serviceBegleitung'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { TerminwahlDialog } from './TerminwahlDialog'

// Kachel «Termin mit dem Kunden» im Projekt — Servicebegleitung
// (docs/specs/servicebegleitung.md §7, §8). Zwei Teile, je nach Werkzeug:
//
// - Terminwahl per Link: Stand der letzten Anfrage, «Dem Kunden zur Wahl senden»,
//   «Zurückziehen». Eine offene Anfrage je Projekt.
// - Kundenlink (Terminwahl oder Statusseite): «Kundenlink kopieren» und «Link
//   sperren» — Letzteres macht alle bisher verschickten Links ungültig (falscher
//   Empfänger), der neue gilt sofort.

interface Props {
  projectId: string
  staff: { id: string; name: string }[]
  /** Werkzeug «terminwahl» für dieses Konto an; sonst nur der Kundenlink (Statusseite). */
  terminwahl: boolean
}

function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function TerminwahlKachel({ projectId, staff, terminwahl }: Props) {
  const [ansicht, setAnsicht] = useState<TerminwahlAnsicht | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [fehler, setFehler] = useState('')
  const [hinweis, setHinweis] = useState('')
  const [dialog, setDialog] = useState(false)
  const [frage, setFrage] = useState<'zurueck' | 'sperren' | null>(null)

  useEffect(() => {
    let alive = true
    const laden = terminwahl ? fetchTerminwahl(projectId).then(a => { if (alive) { setAnsicht(a); setLink(a.kundenlink) } })
      : fetchKundenlink(projectId).then(r => { if (alive) setLink(r.url) })
    laden.catch(e => { if (alive) setFehler(fehlerText(e)) })
    return () => { alive = false }
  }, [projectId, terminwahl])

  const offen: Terminanfrage | undefined = ansicht?.anfragen.find(a => a.status === 'offen')
  const letzte = ansicht?.anfragen[0]

  async function kopieren() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setHinweis('Kundenlink kopiert.')
    } catch {
      setHinweis(link)
    }
  }

  async function bestaetigt() {
    const was = frage
    setFrage(null)
    setFehler('')
    try {
      if (was === 'zurueck' && offen) {
        await zieheTerminanfrageZurueck(offen.id)
        setAnsicht(await fetchTerminwahl(projectId))
        setHinweis('Anfrage zurückgezogen — die Fenster sind wieder frei.')
      } else if (was === 'sperren') {
        const r = await sperreKundenlink(projectId)
        setLink(r.url)
        setHinweis('Link gesperrt. Frühere Links gelten nicht mehr; der neue Link ist aktiv.')
      }
    } catch (e) {
      setFehler(fehlerText(e))
    }
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24, marginTop: 16 }}>
      <div className="admin-section-title">Termin mit dem Kunden</div>

      {terminwahl && ansicht && (
        <>
          {letzte ? (
            <div style={{ fontSize: 14, marginBottom: 10 }} data-testid="terminwahl-stand">
              <strong>{anfrageStandText(letzte)}</strong>
              {letzte.status === 'offen' && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {letzte.optionen.filter(o => o.status === 'reserviert').map(o => <li key={o.id}>{o.text}</li>)}
                </ul>
              )}
              {letzte.status === 'offen' && letzte.reserviert_bis_text && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Reserviert bis {letzte.reserviert_bis_text} · an {letzte.empfaenger}
                </div>
              )}
              {letzte.hinweis_kunde && (
                <div style={{ fontSize: 13, marginTop: 4 }}>Hinweis des Kunden: {letzte.hinweis_kunde}</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
              Noch keine Terminanfrage. Der Kunde wählt aus zwei bis drei Fenstern, die Sie freigeben.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {!offen && (
              <button type="button" className="admin-btn admin-btn-primary" onClick={() => setDialog(true)}>
                Dem Kunden zur Wahl senden
              </button>
            )}
            {offen && (
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setFrage('zurueck')}>
                Anfrage zurückziehen
              </button>
            )}
          </div>
        </>
      )}

      {link && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => void kopieren()}>
            Kundenlink kopieren
          </button>
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setFrage('sperren')}>
            Link sperren
          </button>
        </div>
      )}

      {hinweis && <div role="status" style={{ fontSize: 13, marginTop: 10, wordBreak: 'break-all' }}>{hinweis}</div>}
      {fehler && <div className="admin-form-error" role="alert" style={{ marginTop: 10 }}>{fehler}</div>}

      {dialog && ansicht && (
        <TerminwahlDialog
          projectId={projectId}
          staff={staff}
          vorgabe={{ empfaenger: ansicht.empfaenger_vorschlag, reserviertBis: ansicht.vorgabe_reserviert_bis }}
          onClose={() => setDialog(false)}
          onSent={a => { setAnsicht(a); setLink(a.kundenlink); setDialog(false); setHinweis('Die Mail ist beim Kunden.') }}
        />
      )}
      {frage && (
        <ConfirmDialog
          title={frage === 'zurueck' ? 'Anfrage zurückziehen?' : 'Kundenlink sperren?'}
          message={frage === 'zurueck'
            ? 'Der Kunde kann danach keinen dieser Termine mehr wählen; die Fenster werden frei.'
            : 'Alle bisher verschickten Links (Terminwahl, Statusseite) werden ungültig. Nötig, wenn ein Link an den falschen Empfänger ging.'}
          confirmLabel={frage === 'zurueck' ? 'Zurückziehen' : 'Sperren'}
          onConfirm={() => void bestaetigt()}
          onCancel={() => setFrage(null)}
        />
      )}
    </div>
  )
}

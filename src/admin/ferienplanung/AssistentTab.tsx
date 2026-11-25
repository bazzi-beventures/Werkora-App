// Reiter «Assistent» der Ferienplanung (Zusatzmodul `ferienplanung_assistent`,
// docs/specs/ferienplanung.md §11): links die Themenliste mit Stand, rechts der Chat.
// Der Assistent legt nur Vorschläge an — übernommen wird in den Reitern Sperrfristen,
// Regeln und Gruppen. Der Verlauf bleibt im Browser (wie beim Kennzahlen-Assistenten).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { frageAssistent, getAssistentStand, type AssistentStand } from '../../api/admin/ferienplanung'
import { queryClient } from '../../shared/queryClient'
import { STAMMDATEN_KEY } from './useFerienStammdaten'

const STAND_KEY = ['ferienplanung', 'assistent', 'stand'] as const
const STATUS_ZEICHEN: Record<string, string> = { erledigt: '✓', uebersprungen: '–', offen: '○' }
const MAX_VERLAUF = 12

interface Nachricht { role: 'user' | 'assistant'; text: string }

export function AssistentTab() {
  const { data: stand } = useQuery<AssistentStand>({ queryKey: STAND_KEY, queryFn: getAssistentStand }, queryClient)
  const [verlauf, setVerlauf] = useState<Nachricht[]>([])
  const [eingabe, setEingabe] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [werkzeug, setWerkzeug] = useState('')
  const [fehler, setFehler] = useState('')

  async function senden(text: string) {
    const frage = text.trim()
    if (!frage || laeuft) return
    const bisher = verlauf.slice(-MAX_VERLAUF)
    setVerlauf([...verlauf, { role: 'user', text: frage }, { role: 'assistant', text: '' }])
    setEingabe('')
    setLaeuft(true)
    setFehler('')
    let antwort = ''
    try {
      for await (const ev of frageAssistent(frage, bisher)) {
        if (ev.type === 'delta' && ev.text) {
          antwort += ev.text
          setVerlauf(v => [...v.slice(0, -1), { role: 'assistant', text: antwort }])
        } else if (ev.type === 'tool') {
          setWerkzeug(ev.label ?? '')
        } else if (ev.type === 'vorschlag') {
          void queryClient.invalidateQueries({ queryKey: STAMMDATEN_KEY })
          void queryClient.invalidateQueries({ queryKey: STAND_KEY })
        } else if (ev.type === 'error') {
          setFehler(ev.message ?? 'Der Assistent ist gerade nicht erreichbar.')
        }
      }
    } catch {
      setFehler('Der Assistent ist gerade nicht erreichbar.')
    } finally {
      setLaeuft(false)
      setWerkzeug('')
      void queryClient.invalidateQueries({ queryKey: STAND_KEY })
    }
  }

  return (
    <div className="ferien-assistent">
      <div className="admin-table-wrap ferien-panel">
        <div className="admin-section-title">Themen</div>
        {stand?.themen.map(t => (
          <div key={t.thema} className="ferien-thema" title={t.notiz || t.frage} data-testid="ferien-thema">
            <span className={`ferien-thema-status ${t.status}`}>{STATUS_ZEICHEN[t.status] ?? '○'}</span> {t.titel}
          </div>
        ))}
        {!!stand?.vorschlaege && (
          <p className="ferien-liste-meta">{stand.vorschlaege} Vorschläge warten in den Reitern auf «Übernehmen».</p>
        )}
      </div>

      <div className="admin-table-wrap ferien-panel ferien-chat">
        {verlauf.length === 0 && (
          <div className="ferien-chat-start">
            <p>Ich gehe mit Ihnen die Regeln für die Ferienplanung durch und lege Vorschläge an, die Sie danach übernehmen.</p>
            <button className="admin-btn admin-btn-primary" onClick={() => void senden('Los geht’s — beginnen wir beim ersten offenen Thema.')}>
              Gespräch starten
            </button>
          </div>
        )}
        {verlauf.map((n, i) => (
          <div key={i} className={`ferien-chat-nachricht ${n.role}`}>{n.text || (laeuft ? '…' : '')}</div>
        ))}
        {werkzeug && <div className="ferien-liste-meta">{werkzeug}</div>}
        {fehler && <div className="admin-form-error" role="alert">{fehler}</div>}
        <form className="ferien-chat-eingabe" onSubmit={e => { e.preventDefault(); void senden(eingabe) }}>
          <input className="admin-form-input" aria-label="Nachricht an den Assistenten" value={eingabe}
            placeholder="Antwort oder Frage …" maxLength={1500} onChange={e => setEingabe(e.target.value)} />
          <button className="admin-btn admin-btn-primary" type="submit" disabled={laeuft || !eingabe.trim()}>Senden</button>
        </form>
        <p className="ferien-liste-meta">KI-Assistent (Mistral, EU). Namen und Funktionen gehen dafür an Mistral, keine Absenzen.</p>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  askKpiAssistent, createKpiBriefing, getKpiBriefing, listKpiBriefings,
  type KpiBriefing, type KpiBriefingKurz, type KpiReiter,
} from '../../../api/admin/kpiAssistent'
import {
  type ChatNachricht, erstellAngebot, vergleichZeile, verlaufFuer, vorschlaege, wochenLabel,
} from '../assistent'

// Reiter «Assistent» der Kennzahlen (docs/specs/kennzahlen-assistent.md §3.2):
// die Wochenanalyse als erste Nachricht, darunter Vorschlagsfragen und der Chat.
//
// Der Verlauf lebt nur im Zustand dieses Reiters (Spec E8) — kein localStorage.
// Beim Wechsel der Woche beginnt das Gespräch neu: es bezieht sich auf genau eine
// Analyse.

function ReiterKnopf({ reiter, onOpen }: { reiter: KpiReiter; onOpen: (r: KpiReiter) => void }) {
  return (
    <button type="button" className="kpi-assistent-reiter" onClick={() => onOpen(reiter)}>
      {reiter.label} →
    </button>
  )
}

interface Props {
  /** Aus der Montags-Push: genau diese Woche öffnen. */
  initialBriefingId?: string | null
  /** Ein Reiter-Knopf wurde gedrückt (Handlungsbedarf oder Antwort). */
  onOpenReiter: (reiter: KpiReiter) => void
}

export default function AssistentTab({ initialBriefingId, onOpenReiter }: Props) {
  const [liste, setListe] = useState<KpiBriefingKurz[] | null>(null)
  const [kiHinweis, setKiHinweis] = useState('')
  const [gewaehlt, setGewaehlt] = useState<string | null>(initialBriefingId || null)
  const [briefing, setBriefing] = useState<KpiBriefing | null>(null)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [erstellt, setErstellt] = useState<'idle' | 'laeuft' | 'fehler'>('idle')
  const [nachrichten, setNachrichten] = useState<ChatNachricht[]>([])
  const [eingabe, setEingabe] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const naechsteId = useRef(1)

  async function ladeListe(auswahl?: string | null) {
    try {
      const res = await listKpiBriefings()
      setListe(res.briefings)
      setKiHinweis(res.ki_hinweis)
      setGewaehlt(prev => auswahl ?? prev ?? res.briefings[0]?.id ?? null)
    } catch (e) {
      setLadeFehler(e instanceof Error ? e.message : 'Die Wochenanalysen konnten nicht geladen werden.')
      setListe([])
    }
  }

  useEffect(() => {
    void ladeListe()
  }, [])

  useEffect(() => {
    if (!gewaehlt) return
    let aktiv = true
    setBriefing(null)
    setNachrichten([])
    getKpiBriefing(gewaehlt)
      .then(b => { if (aktiv) setBriefing(b) })
      .catch(e => { if (aktiv) setLadeFehler(e instanceof Error ? e.message : 'Analyse nicht gefunden.') })
    return () => { aktiv = false }
  }, [gewaehlt])

  async function erstellen() {
    setErstellt('laeuft')
    try {
      const b = await createKpiBriefing()
      setErstellt('idle')
      setBriefing(b)
      await ladeListe(b.id)
    } catch {
      setErstellt('fehler')
    }
  }

  function aktualisiere(id: number, f: (m: ChatNachricht) => ChatNachricht) {
    setNachrichten(alle => alle.map(m => (m.id === id ? f(m) : m)))
  }

  async function senden(text: string) {
    const frage = text.trim()
    if (!frage || laeuft) return
    const verlauf = verlaufFuer(nachrichten)
    const idFrage = naechsteId.current++
    const idAntwort = naechsteId.current++
    setNachrichten(alle => [
      ...alle,
      { id: idFrage, role: 'user', text: frage },
      { id: idAntwort, role: 'assistant', text: '' },
    ])
    setEingabe('')
    setLaeuft(true)
    setStatus(null)
    try {
      for await (const ev of askKpiAssistent(frage, briefing?.id ?? null, verlauf)) {
        if (ev.type === 'delta') {
          setStatus(null)
          aktualisiere(idAntwort, m => ({ ...m, text: m.text + ev.text }))
        } else if (ev.type === 'tool') {
          setStatus(ev.label)
        } else if (ev.type === 'links') {
          aktualisiere(idAntwort, m => ({ ...m, links: ev.links }))
        } else if (ev.type === 'error') {
          aktualisiere(idAntwort, m => ({ ...m, error: ev.message }))
        }
      }
    } catch (e) {
      aktualisiere(idAntwort, m => ({
        ...m, error: e instanceof Error ? e.message : 'Der Assistent ist gerade nicht erreichbar.',
      }))
    } finally {
      setLaeuft(false)
      setStatus(null)
    }
  }

  if (liste === null) {
    return <div className="kpi-assistent-leer">Wochenanalysen werden geladen …</div>
  }

  const angebot = erstellAngebot(liste, new Date())
  const analyse = briefing?.analysis ?? null

  return (
    <div className="kpi-assistent">
      <div className="kpi-assistent-kopf">
        <span className="kpi-assistent-titel">Wochenanalyse</span>
        {liste.length > 0 && (
          <select
            className="kpi-assistent-woche"
            aria-label="Woche wählen"
            value={gewaehlt ?? ''}
            onChange={e => setGewaehlt(e.target.value)}
          >
            {liste.map(b => <option key={b.id} value={b.id}>{wochenLabel(b)}</option>)}
          </select>
        )}
        <span className="kpi-assistent-ki" title={kiHinweis}>KI · Mistral</span>
      </div>

      {ladeFehler && <div className="kpi-assistent-fehler">{ladeFehler}</div>}

      {angebot && (
        <div className="kpi-assistent-erstellen">
          <span>
            {angebot === 'erstellen'
              ? 'Für diese Woche gibt es noch keine Analyse.'
              : 'Die KI-Analyse dieser Woche ist nicht zustande gekommen.'}
          </span>
          <button className="admin-btn admin-btn-primary" onClick={() => void erstellen()} disabled={erstellt === 'laeuft'}>
            {erstellt === 'laeuft'
              ? 'Wird erstellt …'
              : angebot === 'erstellen' ? 'Wochenanalyse jetzt erstellen' : 'Erneut versuchen'}
          </button>
          {erstellt === 'fehler' && (
            <span className="kpi-assistent-fehler">Das hat nicht geklappt — bitte später nochmals versuchen.</span>
          )}
        </div>
      )}

      {briefing && (
        <div className="kpi-assistent-analyse" data-testid="kpi-analyse">
          {briefing.status === 'laeuft' && <p>Die Analyse wird gerade erstellt …</p>}
          {briefing.status === 'ki_fehlgeschlagen' && (
            <>
              <p className="kpi-assistent-fehler">
                KI-Analyse momentan nicht verfügbar. Die Zahlen seit letzter Woche:
              </p>
              <ul>
                {(briefing.snapshot._vergleich?.werte ?? []).filter(w => w.veraendert).map(w => (
                  <li key={w.kennzahl}>{vergleichZeile(w)}</li>
                ))}
              </ul>
            </>
          )}
          {analyse && (
            <>
              <section>
                <h3>Gesamtbild</h3>
                <p>{analyse.gesamtbild}</p>
              </section>
              {analyse.veraenderungen.length > 0 && (
                <section>
                  <h3>Seit letzter Woche</h3>
                  <ul>{analyse.veraenderungen.map((v, i) => <li key={i}>{v}</li>)}</ul>
                </section>
              )}
              {analyse.handlungsbedarf.length > 0 && (
                <section>
                  <h3>Braucht Aufmerksamkeit</h3>
                  <ol className="kpi-assistent-punkte">
                    {analyse.handlungsbedarf.map((p, i) => (
                      <li key={i}>
                        <strong>{p.titel}</strong>
                        {p.text && <span> — {p.text}</span>}
                        {p.reiter && <ReiterKnopf reiter={p.reiter} onOpen={onOpenReiter} />}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}
        </div>
      )}

      <div className="kpi-assistent-chat">
        {nachrichten.map(m => (
          <div key={m.id} className={`kpi-assistent-nachricht ${m.role}`}>
            {m.role === 'assistant'
              ? <div className="chat-md"><ReactMarkdown>{m.text || (laeuft ? '…' : '')}</ReactMarkdown></div>
              : m.text}
            {m.error && <div className="kpi-assistent-fehler">{m.error}</div>}
            {m.links && m.links.length > 0 && (
              <div className="kpi-assistent-links">
                {m.links.map(l => <ReiterKnopf key={l.id} reiter={l} onOpen={onOpenReiter} />)}
              </div>
            )}
          </div>
        ))}
        {status && <div className="kpi-assistent-status">{status}</div>}
      </div>

      {nachrichten.length === 0 && (
        <div className="kpi-assistent-vorschlaege">
          {vorschlaege(analyse).map(v => (
            <button key={v} className="kpi-assistent-vorschlag" onClick={() => void senden(v)} disabled={laeuft}>
              {v}
            </button>
          ))}
        </div>
      )}

      <form
        className="kpi-assistent-eingabe"
        onSubmit={e => { e.preventDefault(); void senden(eingabe) }}
      >
        <input
          type="text"
          value={eingabe}
          maxLength={1000}
          placeholder="Frag etwas zu deinen Kennzahlen …"
          aria-label="Frage an den Kennzahlen-Assistenten"
          onChange={e => setEingabe(e.target.value)}
          disabled={laeuft}
        />
        <button type="submit" className="admin-btn admin-btn-primary" disabled={laeuft || !eingabe.trim()}>
          Senden
        </button>
      </form>
      <div className="kpi-assistent-fuss">{kiHinweis}</div>
    </div>
  )
}

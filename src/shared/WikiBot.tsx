import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  askWiki, identifyByPhoto, listWikiHandbooks,
  WikiChoice, WikiHandbook, WikiSource,
} from '../api/wiki'
import { ApiError, isOfflineError } from '../api/client'

// ────────────────────────────────────────────────────────────────────────────
// Lieferanten-Wiki in der Hilfe-Blase (Spec docs/specs/lieferanten-wiki.md).
//
// Zwei Ansichten in einem Reiter:
//   Suchen — Chat über die Handbücher, mit Quellenangabe je Antwort
//   Handbücher — die Liste, um ein PDF direkt zu öffnen
//
// «Suchen» statt «Fragen»: der äussere Reiter des Hilfe-Bots heisst bereits
// «Fragen», zwei gleichnamige Umschalter in einer Blase wären nicht zu
// unterscheiden.
//
// Der Monteur auf der Baustelle will meist beides: die schnelle Antwort, und
// dann doch die Seite im Original (Schaltplan, Explosionszeichnung). Deshalb
// führen die Quellen unter der Antwort direkt zum PDF.
//
// **Das Gerät der Sitzung** (§13): sobald feststeht, um welches Handbuch es
// geht, merkt sich die App das und schickt es bei jeder Folgefrage mit — der
// Monteur steht ja eine Viertelstunde vor demselben Kessel. Bewusst hier und
// nicht im Server: prozesslokaler Chat-State ist die Stelle, die eine zweite
// Backend-Instanz zerbrechen würde (Single-Process-Annahme, CLAUDE.md).
// ────────────────────────────────────────────────────────────────────────────

type Role = 'user' | 'assistant'

interface Message {
  id: number
  role: Role
  text: string
  sources?: WikiSource[]
  /** Auswahl statt Antwort: das Gerät war unklar (`choice`-Event). */
  choices?: WikiChoice[]
  error?: string
}

interface Props {
  /** Firmenname des Mandanten — steht im leeren Zustand als Kontext. */
  tenantName?: string
}

const SUGGESTIONS = [
  'Welches Drehmoment gilt für die Verschraubung?',
  'Wie setze ich das Gerät zurück?',
  'Welche Ersatzteile brauche ich für den Service?',
]

let _nextId = 1

function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return ''
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Eine Quelle je Handbuch, stärkster Treffer zuerst — drei Zeilen zum selben
 *  PDF sind keine drei Quellen, sondern eine. */
export function dedupeSources(sources: WikiSource[]): WikiSource[] {
  const seen = new Set<string>()
  const out: WikiSource[] = []
  for (const s of sources) {
    const key = s.handbook_id || s.source_file || s.section
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

export default function WikiBot({ tenantName }: Props) {
  const [view, setView] = useState<'ask' | 'docs'>('ask')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [handbooks, setHandbooks] = useState<WikiHandbook[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  // Das Gerät, um das es in dieser Sitzung geht. Null = noch offen.
  const [device, setDevice] = useState<WikiChoice | null>(null)
  const [scanning, setScanning] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const photoRef = useRef<HTMLInputElement | null>(null)
  // Die letzte Frage, damit eine Chip-Auswahl sie beantwortet, statt den
  // Monteur zum Abtippen zu zwingen.
  const pendingRef = useRef<string>('')

  // Die Liste wird einmal beim Öffnen geladen: sie trägt die signierten Links
  // (1 h gültig) und sagt zugleich, ob überhaupt schon Handbücher da sind.
  useEffect(() => {
    let alive = true
    listWikiHandbooks()
      .then(hbs => { if (alive) setHandbooks(hbs) })
      .catch(err => {
        if (!alive) return
        setLoadError(isOfflineError(err)
          ? 'Offline — die Handbücher brauchen eine Verbindung.'
          : 'Handbücher konnten nicht geladen werden.')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const byId = new Map(handbooks.map(h => [h.id, h]))

  async function send(question: string, handbookId?: string | null) {
    const q = question.trim()
    if (!q || busy) return
    const scope = handbookId ?? device?.handbook_id ?? null

    const userMsg: Message = { id: _nextId++, role: 'user', text: q }
    const botMsg: Message = { id: _nextId++, role: 'assistant', text: '' }
    setMessages(prev => [...prev, userMsg, botMsg])
    setInput('')
    setBusy(true)
    pendingRef.current = q

    try {
      for await (const ev of askWiki(q, scope)) {
        if (ev.type === 'delta') {
          setMessages(prev => prev.map(m =>
            m.id === botMsg.id ? { ...m, text: m.text + ev.text } : m
          ))
        } else if (ev.type === 'sources') {
          setMessages(prev => prev.map(m =>
            m.id === botMsg.id ? { ...m, sources: dedupeSources(ev.sources ?? []) } : m
          ))
        } else if (ev.type === 'choice') {
          setMessages(prev => prev.map(m =>
            m.id === botMsg.id
              ? { ...m, text: ev.message, choices: ev.handbooks ?? [] }
              : m
          ))
        } else if (ev.type === 'error') {
          setMessages(prev => prev.map(m =>
            m.id === botMsg.id ? { ...m, error: ev.message } : m
          ))
        }
      }
    } catch (err) {
      const msg = isOfflineError(err)
        ? 'Keine Internetverbindung.'
        : err instanceof ApiError && err.status === 429
        ? 'Zu viele Anfragen. Bitte kurz warten.'
        : 'Antwort konnte nicht geladen werden.'
      setMessages(prev => prev.map(m =>
        m.id === botMsg.id ? { ...m, error: msg } : m
      ))
    } finally {
      setBusy(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  /** Chip angetippt: Gerät merken und die offene Frage damit beantworten. */
  function pickDevice(choice: WikiChoice) {
    setDevice(choice)
    // Die Auswahl-Nachricht hat ihren Zweck erfüllt; die Antwort kommt neu.
    setMessages(prev => prev.map(m => (m.choices ? { ...m, choices: undefined } : m)))
    const question = pendingRef.current
    if (question) send(question, choice.handbook_id)
  }

  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''  // erlaubt dasselbe Bild erneut
    if (!file) return
    setScanning(true)
    try {
      const res = await identifyByPhoto(file)
      if (!res.recognized || res.handbooks.length === 0) {
        setMessages(prev => [...prev, {
          id: _nextId++, role: 'assistant',
          text: 'Auf dem Foto war keine Typenbezeichnung zu erkennen, die zu einem hinterlegten Handbuch passt. Wähle das Gerät bitte aus der Liste «Handbücher».',
        }])
        return
      }
      if (res.handbooks.length === 1) {
        const only = res.handbooks[0]
        setDevice(only)
        setMessages(prev => [...prev, {
          id: _nextId++, role: 'assistant',
          text: `Erkannt: **${only.label}**. Stell jetzt deine Frage dazu.`,
        }])
        return
      }
      // Mehrere Treffer: erkannt heisst vorausgewählt, nicht entschieden.
      setMessages(prev => [...prev, {
        id: _nextId++, role: 'assistant',
        text: 'Um welches dieser Geräte geht es?',
        choices: res.handbooks,
      }])
    } catch (err) {
      const msg = isOfflineError(err)
        ? 'Keine Internetverbindung.'
        : err instanceof ApiError && err.status === 429
        ? 'Zu viele Anfragen. Bitte kurz warten.'
        : 'Das Foto konnte nicht ausgewertet werden.'
      setMessages(prev => [...prev, {
        id: _nextId++, role: 'assistant', text: '', error: msg,
      }])
    } finally {
      setScanning(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    send(input)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const linkStyle: React.CSSProperties = {
    color: 'var(--accent, #1e3a5f)', textDecoration: 'underline', fontSize: '0.8rem',
  }
  const chipStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 'var(--radius-xl)', fontSize: '0.85rem',
    background: 'var(--surface, #fff)', color: 'var(--text, #111)',
    border: '1px solid var(--border, #e5e7eb)', cursor: 'pointer', textAlign: 'left',
  }

  const askable = handbooks.some(h => h.index_status === 'indexed')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Umschalter Suchen / Handbücher */}
      <div style={{
        display: 'flex', gap: 4, padding: '8px 12px 0',
        borderBottom: '1px solid var(--border, #e5e7eb)', flexShrink: 0,
      }}>
        {([['ask', 'Suchen'], ['docs', `Handbücher${handbooks.length ? ` (${handbooks.length})` : ''}`]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            aria-pressed={view === id}
            style={{
              flex: 1, textAlign: 'center', padding: '6px 10px', border: 'none',
              cursor: 'pointer', background: 'transparent', color: 'inherit', font: 'inherit',
              borderBottom: view === id ? '2px solid var(--accent, #1e3a5f)' : '2px solid transparent',
              fontWeight: view === id ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'docs' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ color: 'var(--muted, #6b7280)', fontSize: '0.9rem' }}>Wird geladen…</div>
          ) : loadError ? (
            <div style={{ color: 'var(--accent-red)', fontSize: '0.9rem' }}>{loadError}</div>
          ) : handbooks.length === 0 ? (
            <div style={{ color: 'var(--muted, #6b7280)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Es sind noch keine Lieferantenhandbücher hinterlegt. Das Büro kann sie
              im Admin-Bereich unter «Lieferanten-Wiki» hochladen.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {handbooks.map(h => (
                <div key={h.id} style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: 'var(--surface2, #f3f4f6)',
                }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-word' }}>
                    {h.title}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted, #6b7280)', marginTop: 2 }}>
                    {[h.supplier_name, formatBytes(h.size_bytes)].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {h.url && (
                      <a href={h.url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                        Öffnen
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDevice({ handbook_id: h.id, label: h.title })
                        setView('ask')
                      }}
                      style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      Dazu fragen
                    </button>
                    {h.index_status !== 'indexed' && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted, #6b7280)' }}>
                        {h.index_status === 'error'
                          ? 'nicht durchsuchbar'
                          : 'wird noch eingelesen — Öffnen geht schon'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Das Gerät der Sitzung — sichtbar, damit niemand rätselt, worauf sich
              die Antworten beziehen, und mit einem Weg zurück. */}
          {device && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              padding: '8px 16px', fontSize: '0.8rem',
              background: 'var(--surface2, #f3f4f6)',
              borderBottom: '1px solid var(--border, #e5e7eb)',
            }}>
              <span style={{ color: 'var(--muted, #6b7280)' }}>Gerät:</span>
              <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {device.label}
              </span>
              <button
                type="button"
                onClick={() => setDevice(null)}
                style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                wechseln
              </button>
            </div>
          )}

          <div ref={scrollRef} style={{
            flex: 1, overflowY: 'auto', padding: 16,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {messages.length === 0 && (
              <div style={{ color: 'var(--muted, #6b7280)', textAlign: 'center', marginTop: 32 }}>
                <div style={{ fontSize: '1rem', marginBottom: 8 }}>
                  Frag mich zu Geräten und Material.
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                  {handbooks.length === 0 && !loading
                    ? 'Sobald das Büro Handbücher hinterlegt, antworte ich daraus.'
                    : `Ich antworte aus den Lieferantenhandbüchern${tenantName ? ` von ${tenantName}` : ''}.`}
                </div>
              </div>
            )}

            {messages.map(m => {
              const isUser = m.role === 'user'
              return (
                <div key={m.id} style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: isUser ? 'var(--accent, #1e3a5f)' : 'var(--surface2, #f3f4f6)',
                  // Schrift auf der Akzentfläche über das Token — ein festes
                  // #fff kennt kein Theme (Token-Gate, scripts/token-gate.mjs).
                  color: isUser ? 'var(--on-accent)' : 'var(--text, #111)',
                  fontSize: '0.95rem',
                  lineHeight: 1.4,
                  whiteSpace: isUser ? 'pre-wrap' : 'normal',
                  wordBreak: 'break-word',
                }}>
                  {isUser
                    ? m.text
                    : m.text
                      ? <div className="chat-md"><ReactMarkdown>{m.text}</ReactMarkdown></div>
                      : !m.error && (
                          <span style={{ opacity: 0.6, fontStyle: 'italic' }}>sucht im Handbuch…</span>
                        )}

                  {/* Auswahl statt Raten: nur Antippen, kein Abtippen. */}
                  {!!m.choices?.length && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {m.choices.map(c => (
                        <button
                          key={c.handbook_id}
                          type="button"
                          onClick={() => pickDevice(c)}
                          disabled={busy}
                          style={chipStyle}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Quellen: der Weg vom Zitat zur Originalseite. */}
                  {!isUser && !!m.sources?.length && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border, #e5e7eb)',
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                      {m.sources.map((s, i) => {
                        const hb = s.handbook_id ? byId.get(s.handbook_id) : undefined
                        const label = s.label || hb?.title || s.section
                        return hb?.url ? (
                          <a key={i} href={hb.url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                            {label}
                          </a>
                        ) : (
                          <span key={i} style={{ fontSize: '0.8rem', color: 'var(--muted, #6b7280)' }}>
                            {label}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {m.error && (
                    <div style={{ color: 'var(--accent-red)', fontWeight: 500, marginTop: 4 }}>
                      {m.error}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {messages.length === 0 && askable && (
            <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  disabled={busy}
                  style={{
                    padding: '8px 12px', borderRadius: 'var(--radius-xl)', fontSize: '0.85rem',
                    background: 'var(--surface2, #f3f4f6)', color: 'var(--text, #111)',
                    border: '1px solid var(--border, #e5e7eb)', cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{
            display: 'flex', gap: 8, padding: 12, alignItems: 'center',
            borderTop: '1px solid var(--border, #e5e7eb)',
          }}>
            {/* Typenschild fotografieren statt abtippen. Das Bild geht direkt
                zum Server und wird nirgends abgelegt (Spec §14). */}
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={onPhoto}
            />
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              disabled={busy || scanning || handbooks.length === 0}
              aria-label="Typenschild fotografieren"
              title="Typenschild fotografieren"
              style={{
                width: 40, height: 40, flexShrink: 0,
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border, #d1d5db)',
                background: 'var(--surface, #fff)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: busy || scanning || handbooks.length === 0 ? 0.5 : 1,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={scanning ? 'Foto wird gelesen…' : 'Frage zum Gerät stellen…'}
              disabled={busy || scanning}
              style={{
                flex: 1, padding: '10px 12px',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border, #d1d5db)',
                fontSize: '0.95rem', fontFamily: 'inherit', resize: 'none',
                background: 'var(--surface, #fff)', color: 'var(--text, #111)',
              }}
            />
            <button
              type="submit"
              disabled={busy || scanning || !input.trim()}
              style={{
                padding: '0 16px', height: 40, borderRadius: 'var(--radius-sm)', border: 'none',
                background: 'var(--accent, #1e3a5f)', color: 'var(--on-accent)',
                fontWeight: 600, cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: busy || scanning || !input.trim() ? 0.5 : 1,
              }}
            >
              {busy ? '…' : 'Senden'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}

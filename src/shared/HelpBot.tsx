import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { askHelp } from '../api/help'
import { ApiError, isOfflineError } from '../api/client'

type Role = 'user' | 'assistant'

interface Message {
  id: number
  role: Role
  text: string
  error?: string
}

interface Props {
  /** Vorschlagsfragen, die als Quick-Action-Buttons angezeigt werden. */
  suggestions?: string[]
  /** Wenn gesetzt: zeigt einen Header mit Titel und optionalem Zurueck-Button. */
  header?: { title: string; onBack?: () => void }
  /** Begrenzt die maximale Breite (z.B. fuer Admin-Desktop). Default: full width. */
  maxWidth?: number
}

const DEFAULT_SUGGESTIONS = [
  'Wie erstelle ich eine neue Offerte?',
  'Wo sehe ich meine Ferientage?',
  'Wie funktioniert die Zeitkorrektur?',
  'Wie melde ich eine Abwesenheit?',
]

let _nextId = 1

export default function HelpBot({ suggestions = DEFAULT_SUGGESTIONS, header, maxWidth }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function send(question: string) {
    const q = question.trim()
    if (!q || busy) return

    const userMsg: Message = { id: _nextId++, role: 'user', text: q }
    const botMsg: Message = { id: _nextId++, role: 'assistant', text: '' }
    setMessages(prev => [...prev, userMsg, botMsg])
    setInput('')
    setBusy(true)

    try {
      for await (const ev of askHelp(q)) {
        if (ev.type === 'delta') {
          setMessages(prev => prev.map(m =>
            m.id === botMsg.id ? { ...m, text: m.text + ev.text } : m
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

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    maxWidth: maxWidth ? `${maxWidth}px` : undefined,
    margin: maxWidth ? '0 auto' : undefined,
  }

  return (
    <div style={wrapperStyle}>
      {header && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', borderBottom: '1px solid var(--border, #e5e7eb)',
        }}>
          {header.onBack && (
            <button
              onClick={header.onBack}
              aria-label="Zurueck"
              style={{
                width: 36, height: 36, borderRadius: 8, border: 'none',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}
          <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{header.title}</div>
        </div>
      )}

      {/* Verlauf */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: 16,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--muted, #6b7280)', textAlign: 'center', marginTop: 32 }}>
            <div style={{ fontSize: '1rem', marginBottom: 8 }}>Stell mir eine Frage zur Bedienung der App.</div>
            <div style={{ fontSize: '0.85rem' }}>Ich antworte auf Basis des Handbuchs.</div>
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
              background: isUser
                ? 'var(--accent-blue, #1e3a5f)'
                : 'var(--surface-muted, #f3f4f6)',
              color: isUser ? '#fff' : 'var(--text, #111)',
              fontSize: '0.95rem',
              lineHeight: 1.4,
              // Nutzer-Eingabe als Klartext (Zeilenumbrueche erhalten); Bot-Antwort
              // rendert Markdown selbst, daher hier kein pre-wrap.
              whiteSpace: isUser ? 'pre-wrap' : 'normal',
              wordBreak: 'break-word',
            }}>
              {isUser
                ? m.text
                : m.text
                  ? <div className="chat-md"><ReactMarkdown>{m.text}</ReactMarkdown></div>
                  : !m.error && (
                      <span style={{ opacity: 0.6, fontStyle: 'italic' }}>denkt nach…</span>
                    )}
              {m.error && (
                <div style={{ color: '#ef4444', fontWeight: 500, marginTop: 4 }}>
                  {m.error}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Vorschlaege (nur solange noch keine Nachrichten existieren) */}
      {messages.length === 0 && suggestions.length > 0 && (
        <div style={{
          padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 8,
        }}>
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={busy}
              style={{
                padding: '8px 12px', borderRadius: 16, fontSize: '0.85rem',
                background: 'var(--surface-muted, #f3f4f6)', color: 'var(--text, #111)',
                border: '1px solid var(--border, #e5e7eb)', cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Eingabe */}
      <form onSubmit={handleSubmit} style={{
        display: 'flex', gap: 8, padding: 12,
        borderTop: '1px solid var(--border, #e5e7eb)',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Frage zur App stellen…"
          disabled={busy}
          style={{
            flex: 1, padding: '10px 12px',
            borderRadius: 8, border: '1px solid var(--border, #d1d5db)',
            fontSize: '0.95rem', fontFamily: 'inherit', resize: 'none',
            background: 'var(--surface, #fff)', color: 'var(--text, #111)',
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            padding: '0 16px', borderRadius: 8, border: 'none',
            background: 'var(--accent-blue, #1e3a5f)', color: '#fff',
            fontWeight: 600, cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || !input.trim() ? 0.5 : 1,
          }}
        >
          {busy ? '…' : 'Senden'}
        </button>
      </form>
    </div>
  )
}

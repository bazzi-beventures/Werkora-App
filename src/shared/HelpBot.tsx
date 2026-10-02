import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { askHelp } from '../api/help'
import type { UserInfo } from '../api/auth'
import { ApiError, isOfflineError } from '../api/client'
import { isExternalLink, resolveHelpLink, type HelpApp, type HelpTarget } from './helpTargets'
import { historyFor, sourceLabels, type HelpMessage } from './helpChat'

interface Props {
  /** Vorschlagsfragen, die als Quick-Action-Buttons angezeigt werden. */
  suggestions?: string[]
  /** Wenn gesetzt: zeigt einen Header mit Titel und optionalem Zurueck-Button. */
  header?: { title: string; onBack?: () => void }
  /** Begrenzt die maximale Breite (z.B. fuer Admin-Desktop). Default: full width. */
  maxWidth?: number
  /** In welcher App der Chat sitzt — bestimmt, welche Masken der Bot verlinkt. */
  app?: HelpApp
  /** Aktuelle Maske (Screen-Schlüssel) — der Bot sagt dann «Sie sind schon richtig». */
  route?: string
  /** Angemeldeter Nutzer: prüft, ob ein Link zum Knopf werden darf. */
  user?: UserInfo | null
  /** Öffnet eine Maske. Ohne Callback bleiben Masken-Links reiner Text. */
  onNavigate?: (target: HelpTarget) => void
  /** Gesprächsverlauf von aussen: die Blase hält ihn, damit er das Schliessen
   *  (und den Sprung in eine Maske) überlebt. Ohne Prop hält HelpBot ihn selbst. */
  conversation?: [HelpMessage[], Dispatch<SetStateAction<HelpMessage[]>>]
}

const linkButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '2px 10px', margin: '1px 2px', borderRadius: 'var(--radius-xl)',
  fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.5,
  background: 'var(--surface, #fff)', color: 'var(--accent, #1e3a5f)',
  border: '1px solid var(--accent, #1e3a5f)', cursor: 'pointer',
  fontFamily: 'inherit', verticalAlign: 'baseline',
}

/**
 * Link-Renderer für Bot-Antworten (Spec §4.2):
 * - Masken-Link, den dieser Nutzer öffnen darf → Knopf, ruft onNavigate
 * - externer Link → neuer Tab (die PWA wird nie im selben Tab verlassen)
 * - alles andere → reiner Text
 */
function makeLinkRenderer(
  app: HelpApp | undefined,
  user: UserInfo | null | undefined,
  onNavigate: ((target: HelpTarget) => void) | undefined,
): Components['a'] {
  return function HelpLink({ href, children }: { href?: string; children?: ReactNode }) {
    const target = app && onNavigate ? resolveHelpLink(href, user ?? null, app) : null
    if (target && onNavigate) {
      return (
        <button type="button" style={linkButtonStyle} onClick={() => onNavigate(target)}>
          {children}
          <span aria-hidden="true">→</span>
        </button>
      )
    }
    if (isExternalLink(href)) {
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    }
    return <>{children}</>
  }
}

const DEFAULT_SUGGESTIONS = [
  'Wie erstelle ich eine neue Offerte?',
  'Wo sehe ich meine Ferientage?',
  'Wie funktioniert die Zeitkorrektur?',
  'Wie melde ich eine Abwesenheit?',
]

let _nextId = 1

export default function HelpBot({
  suggestions = DEFAULT_SUGGESTIONS, header, maxWidth, app, route, user, onNavigate, conversation,
}: Props) {
  const ownConversation = useState<HelpMessage[]>([])
  const [messages, setMessages] = conversation ?? ownConversation
  const markdownComponents = useMemo<Components>(
    () => ({ a: makeLinkRenderer(app, user, onNavigate) }),
    [app, user, onNavigate],
  )
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

    const history = historyFor(messages)
    const userMsg: HelpMessage = { id: _nextId++, role: 'user', text: q }
    const botMsg: HelpMessage = { id: _nextId++, role: 'assistant', text: '' }
    setMessages(prev => [...prev, userMsg, botMsg])
    setInput('')
    setBusy(true)

    try {
      for await (const ev of askHelp(q, { app, route, history })) {
        if (ev.type === 'delta') {
          setMessages(prev => prev.map(m =>
            m.id === botMsg.id ? { ...m, text: m.text + ev.text } : m
          ))
        } else if (ev.type === 'sources') {
          setMessages(prev => prev.map(m =>
            m.id === botMsg.id ? { ...m, sources: ev.sources } : m
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
                width: 36, height: 36, borderRadius: 'var(--radius-sm)', border: 'none',
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
                ? 'var(--accent, #1e3a5f)'
                : 'var(--surface2, #f3f4f6)',
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
                  ? <div className="chat-md"><ReactMarkdown components={markdownComponents}>{m.text}</ReactMarkdown></div>
                  : !m.error && (
                      <span style={{ opacity: 0.6, fontStyle: 'italic' }}>denkt nach…</span>
                    )}
              {!isUser && m.text && sourceLabels(m.sources).length > 0 && (
                <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--muted, #6b7280)' }}>
                  Aus dem Handbuch: {sourceLabels(m.sources).join(' · ')}
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
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border, #d1d5db)',
            fontSize: '0.95rem', fontFamily: 'inherit', resize: 'none',
            background: 'var(--surface, #fff)', color: 'var(--text, #111)',
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            padding: '0 16px', borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent, #1e3a5f)', color: '#fff',
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

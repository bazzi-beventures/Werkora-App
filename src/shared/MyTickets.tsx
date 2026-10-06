import { useState } from 'react'
import { ApiError } from '../api/client'
import {
  MAX_SUPPORT_MESSAGE_CHARS,
  bezugPrefix,
  isOpenTicket,
  sendSupportAddendum,
  type MySupportTicket,
  type SupportAddendum,
  type SupportStatus,
} from '../api/support'

/**
 * «Meine Meldungen» — Spec docs/specs/support-antwort.md §4.1 und §13.
 *
 * Die Fläche, auf der die Antwort des Betreibers ankommt. Ohne sie hätte eine
 * Antwort keinen Ort: eine Push trägt ~120 Zeichen, «Hintergrund etc.» passt da
 * nicht hinein.
 *
 * **Offene Meldungen stehen oben** und lassen sich ergänzen oder als «hat sich
 * erledigt» abschliessen (§13). Anlass war WS-15: «Hat sich erledigt mit den
 * Absenzen» kam als eigene, neue Meldung — die eigentliche stand weiter offen im
 * Eingang, und der Betreiber musste den Zusammenhang erraten.
 *
 * Bewusst KEIN Rückkanal auf eine ERLEDIGTE Meldung (Spec A1/A8): unter der
 * letzten Antwort stehen «Passt» und «Passt nicht». «Passt nicht» führt zurück
 * ins Meldeformular mit vorbelegtem Bezug — es entsteht eine NEUE Meldung mit
 * FRISCHEM Aktivitäts-Snapshot, kein wiederaufgemachtes Ticket.
 */

interface Props {
  tickets: MySupportTicket[]
  loading: boolean
  /** Die Liste konnte nicht geladen werden (offline, Serverfehler). */
  failed: boolean
  /** «Passt nicht» — wechselt ins Formular, vorbelegt mit dem Bezug. */
  onNewWithReference: (prefill: string) => void
  /** Nach einem Nachtrag: Liste neu laden (Status, Abzeichen). */
  onChanged?: () => void
}

const STATUS_LABEL: Record<SupportStatus, string> = {
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  erledigt: 'Erledigt',
}

const ADDENDUM_ERROR: Record<string, string> = {
  addendum_required: 'Bitte schreib kurz, was du ergänzen möchtest.',
  ticket_closed: 'Diese Meldung ist schon erledigt. Melde ein neues Problem, wenn es wieder auftritt.',
  rate_limited: 'Du hast gerade viele Nachträge geschickt. Bitte später erneut.',
  not_found: 'Diese Meldung gibt es nicht mehr.',
}

function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** Offene zuerst, innerhalb der Gruppen die Reihenfolge des Servers (neueste
 *  zuerst). Reine Funktion — exportiert für den Test. */
export function sortOpenFirst(tickets: MySupportTicket[]): MySupportTicket[] {
  return [
    ...tickets.filter(isOpenTicket),
    ...tickets.filter(t => !isOpenTicket(t)),
  ]
}

const CARD: React.CSSProperties = {
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 'var(--radius-sm)',
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const BUTTON: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border, #e5e7eb)', background: 'transparent',
  color: 'inherit', cursor: 'pointer', fontSize: '0.85rem',
}

const PRIMARY: React.CSSProperties = {
  ...BUTTON,
  border: '1px solid var(--accent)', background: 'var(--accent)',
  color: 'var(--on-accent)', fontWeight: 600,
}

const SECTION_HEAD: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.04em', opacity: 0.7, marginTop: 4,
}

function StatusPill({ status }: { status: SupportStatus }) {
  const open = status !== 'erledigt'
  return (
    <span
      style={{
        fontSize: '0.7rem', fontWeight: 600, padding: '1px 8px', borderRadius: 999,
        border: `1px solid ${open ? 'var(--accent)' : 'var(--border, #e5e7eb)'}`,
        color: open ? 'var(--accent)' : 'inherit',
        opacity: open ? 1 : 0.7,
      }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

type Composer = { id: string; mode: 'add' | 'resolve' }

export default function MyTickets({
  tickets, loading, failed, onNewWithReference, onChanged,
}: Props) {
  // Wer «Passt» gedrückt hat, soll die Knöpfe nicht mehr sehen — rein optisch,
  // ohne Serverwirkung (Spec §4.3): ein «passt» ist keine Information, für die
  // es eine Push an den Betreiber bräuchte.
  const [acknowledged, setAcknowledged] = useState<string[]>([])
  const [composer, setComposer] = useState<Composer | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Lokal mitgeführt, bis das Neuladen durch ist: der Nachtrag soll im selben
  // Augenblick dastehen, in dem er abgeschickt ist — nicht erst, wenn eine
  // Baustellen-Verbindung die Liste ein zweites Mal geholt hat.
  const [local, setLocal] = useState<Record<string, { addenda: SupportAddendum[]; status: SupportStatus }>>({})

  if (loading && tickets.length === 0) {
    return <div style={{ padding: 16, fontSize: '0.9rem', opacity: 0.7 }}>Lädt …</div>
  }

  if (failed && tickets.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: '0.9rem', opacity: 0.8 }}>
        Deine Meldungen konnten nicht geladen werden. Sie liegen online — mit
        Netz sind sie wieder da. Melden kannst du trotzdem.
      </div>
    )
  }

  if (tickets.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: '0.9rem', opacity: 0.8 }}>
        Du hast noch nichts gemeldet.
      </div>
    )
  }

  function openComposer(id: string, mode: Composer['mode']) {
    setComposer({ id, mode })
    setDraft('')
    setError('')
  }

  async function submit(ticket: MySupportTicket) {
    if (!composer || busy) return
    const resolved = composer.mode === 'resolve'
    const text = draft.trim()
    if (!text && !resolved) { setError(ADDENDUM_ERROR.addendum_required); return }
    setBusy(true)
    setError('')
    try {
      const res = await sendSupportAddendum(ticket.id, resolved ? { text, resolved: true } : { text })
      setLocal(current => ({ ...current, [ticket.id]: { addenda: res.addenda ?? [], status: res.status } }))
      setComposer(null)
      setDraft('')
      onChanged?.()
    } catch (e) {
      const detail = e instanceof ApiError ? e.message : ''
      setError(ADDENDUM_ERROR[detail] || 'Der Nachtrag konnte nicht gesendet werden. Bitte später erneut.')
    } finally {
      setBusy(false)
    }
  }

  const merged = tickets.map(t => (local[t.id] ? { ...t, ...local[t.id] } : t))
  const sorted = sortOpenFirst(merged)
  const openCount = sorted.filter(isOpenTicket).length
  const closedCount = sorted.length - openCount

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sorted.map((ticket, index) => {
        const replies = ticket.replies ?? []
        const addenda = ticket.addenda ?? []
        const open = isOpenTicket(ticket)
        const done = acknowledged.includes(ticket.id)
        const composing = composer?.id === ticket.id
        // Überschrift je Gruppe — nur, wenn es beide gibt; eine Liste mit
        // lauter offenen Meldungen braucht kein «Offen» darüber.
        const showHead = openCount > 0 && closedCount > 0
          && (index === 0 || index === openCount)
        return (
          <div key={ticket.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {showHead && (
              <div style={SECTION_HEAD}>
                {open ? `Offen (${openCount})` : `Erledigt (${closedCount})`}
              </div>
            )}
            <div style={CARD}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600 }}>{ticket.reference}</span>
                <StatusPill status={ticket.status} />
                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                  {fmtDate(ticket.created_at)}
                </span>
              </div>

              <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{ticket.message}</div>

              {/* Nachträge des Melders direkt unter seinem Text — sie gehören
                  zur Meldung, nicht zu den Antworten. */}
              {addenda.map((a, i) => (
                <div
                  key={`${ticket.id}-n${i}`}
                  style={{
                    borderLeft: '3px solid var(--border, #e5e7eb)',
                    paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                >
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                    {a.resolved ? 'Von dir als erledigt gemeldet' : 'Dein Nachtrag'}
                    {a.at ? ` · ${fmtDate(a.at)}` : ''}
                  </div>
                  <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{a.text}</div>
                </div>
              ))}

              {replies.length === 0 && open && (
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                  Noch keine Antwort. Wir melden uns.
                </div>
              )}

              {/* Älteste zuerst: die Antworten lesen sich als Verlauf — erst der
                  Zwischenstand, dann die Lösung. */}
              {replies.map((reply, i) => (
                <div
                  key={`${ticket.id}-${i}`}
                  style={{
                    borderLeft: '3px solid var(--accent, #9A6716)',
                    paddingLeft: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                    Antwort{reply.by ? ` von ${reply.by}` : ''}
                    {reply.at ? ` · ${fmtDate(reply.at)}` : ''}
                  </div>
                  <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{reply.text}</div>
                </div>
              ))}

              {/* Offene Meldung: ergänzen oder selbst abschliessen (§13).
                  Ein Formular für beide Wege — beim Abschliessen ist der Text
                  freiwillig. */}
              {open && !composing && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" style={BUTTON} onClick={() => openComposer(ticket.id, 'add')}>
                    Ergänzen
                  </button>
                  <button type="button" style={BUTTON} onClick={() => openComposer(ticket.id, 'resolve')}>
                    Hat sich erledigt
                  </button>
                </div>
              )}

              {open && composing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label
                    htmlFor={`addendum-${ticket.id}`}
                    style={{ fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    {composer?.mode === 'resolve'
                      ? 'Was war los? (freiwillig)'
                      : `Nachtrag zu ${ticket.reference}`}
                  </label>
                  <textarea
                    id={`addendum-${ticket.id}`}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    maxLength={MAX_SUPPORT_MESSAGE_CHARS}
                    rows={3}
                    placeholder={composer?.mode === 'resolve'
                      ? 'Z.B. Funktioniert wieder, lag an …'
                      : 'Was möchtest du ergänzen oder korrigieren?'}
                    style={{
                      flexShrink: 0, width: '100%', boxSizing: 'border-box',
                      padding: 8, borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border, #e5e7eb)',
                      background: 'transparent', color: 'inherit', font: 'inherit',
                      fontSize: '0.85rem', resize: 'vertical',
                    }}
                  />
                  {error && (
                    <div role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger, #ef4444)' }}>
                      {error}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button" style={PRIMARY} disabled={busy}
                      onClick={() => void submit(ticket)}
                    >
                      {busy
                        ? 'Sendet …'
                        : composer?.mode === 'resolve' ? 'Als erledigt melden' : 'Nachtrag senden'}
                    </button>
                    <button
                      type="button" style={BUTTON} disabled={busy}
                      onClick={() => { setComposer(null); setError('') }}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}

              {!open && replies.length > 0 && !done && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button" style={BUTTON}
                    onClick={() => setAcknowledged(current => [...current, ticket.id])}
                  >
                    Passt
                  </button>
                  <button
                    type="button" style={BUTTON}
                    onClick={() => onNewWithReference(bezugPrefix(ticket.reference))}
                  >
                    Passt nicht
                  </button>
                </div>
              )}

              {!open && replies.length > 0 && done && (
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Erledigt — danke dir.</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

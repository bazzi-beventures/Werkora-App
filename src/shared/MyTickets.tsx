import { useState } from 'react'
import { bezugPrefix, type MySupportTicket, type SupportStatus } from '../api/support'

/**
 * «Meine Meldungen» — Spec docs/specs/support-antwort.md §4.1.
 *
 * Die Fläche, auf der die Antwort des Betreibers ankommt. Ohne sie hätte eine
 * Antwort keinen Ort: eine Push trägt ~120 Zeichen, «Hintergrund etc.» passt da
 * nicht hinein.
 *
 * Bewusst KEIN Rückkanal (Spec A1): unter der letzten Antwort stehen «Passt»
 * und «Passt nicht». «Passt nicht» führt zurück ins Meldeformular mit
 * vorbelegtem Bezug — es entsteht also eine NEUE Meldung mit FRISCHEM
 * Aktivitäts-Snapshot (A8), kein wiederaufgemachtes Ticket mit einem
 * eingefrorenen Snapshot von vor drei Wochen.
 */

interface Props {
  tickets: MySupportTicket[]
  loading: boolean
  /** Die Liste konnte nicht geladen werden (offline, Serverfehler). */
  failed: boolean
  /** «Passt nicht» — wechselt ins Formular, vorbelegt mit dem Bezug. */
  onNewWithReference: (prefill: string) => void
}

const STATUS_LABEL: Record<SupportStatus, string> = {
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  erledigt: 'Erledigt',
}

function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const CARD: React.CSSProperties = {
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 'var(--radius-sm)',
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

export default function MyTickets({ tickets, loading, failed, onNewWithReference }: Props) {
  // Wer «Passt» gedrückt hat, soll die Knöpfe nicht mehr sehen — rein optisch,
  // ohne Serverwirkung (Spec §4.3): ein «passt» ist keine Information, für die
  // es eine Push an den Betreiber bräuchte.
  const [acknowledged, setAcknowledged] = useState<string[]>([])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {tickets.map(ticket => {
        const replies = ticket.replies ?? []
        const done = acknowledged.includes(ticket.id)
        return (
          <div key={ticket.id} style={CARD}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>{ticket.reference}</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                {fmtDate(ticket.created_at)} · {STATUS_LABEL[ticket.status] ?? ticket.status}
              </span>
            </div>

            <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{ticket.message}</div>

            {replies.length === 0 && (
              <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                Noch keine Antwort. Wir melden uns.
              </div>
            )}

            {/* Älteste zuerst: die Antworten lesen sich als Verlauf — erst der
                Zwischenstand, dann die Lösung. */}
            {replies.map((reply, index) => (
              <div
                key={`${ticket.id}-${index}`}
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

            {replies.length > 0 && !done && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setAcknowledged(current => [...current, ticket.id])}
                  style={{
                    padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border, #e5e7eb)', background: 'transparent',
                    color: 'inherit', cursor: 'pointer', fontSize: '0.85rem',
                  }}
                >
                  Passt
                </button>
                <button
                  type="button"
                  onClick={() => onNewWithReference(bezugPrefix(ticket.reference))}
                  style={{
                    padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border, #e5e7eb)', background: 'transparent',
                    color: 'inherit', cursor: 'pointer', fontSize: '0.85rem',
                  }}
                >
                  Passt nicht
                </button>
              </div>
            )}

            {replies.length > 0 && done && (
              <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Erledigt — danke dir.</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

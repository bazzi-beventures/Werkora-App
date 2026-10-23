import { useCallback, useEffect, useState } from 'react'
import {
  fetchForwardedSupportTickets,
  fetchMySupportTickets,
  markSupportRepliesRead,
  type MySupportTicket,
} from '../api/support'

/**
 * Die eigenen Support-Meldungen samt Antworten — Spec docs/specs/support-antwort.md §4.
 *
 * Der Hook sitzt in der Hilfe-Blase, nicht im Formular: das Abzeichen am FAB
 * muss auch dann stimmen, wenn das Panel zu ist. Geladen wird **einmal beim
 * Mounten** (App-Start) und danach nur noch auf Anforderung — kein Polling. Die
 * Antwort ist kein Ereignis, auf das jemand im Sekundentakt wartet; der schnelle
 * Weg ist die Push, dieser hier der verlässliche.
 */

export interface MySupportTicketsState {
  tickets: MySupportTicket[]
  /** Meldungen mit ungelesener Antwort — vom Server gezählt (eine Regel, ein Ort). */
  unread: number
  /** Fremde Meldungen mit einer Rückfrage des Betreibers an mich
   *  (docs/specs/support-rueckfrage.md R5). */
  forwarded: MySupportTicket[]
  /** Fürs Abzeichen: ungelesene Antworten plus Rückfragen, die auf MICH warten
   *  — eigene und weitergeleitete, je Meldung einmal. */
  attention: number
  loading: boolean
  /** Laden fehlgeschlagen (offline, Serverfehler). Blockiert das Melden nie. */
  failed: boolean
  reload: () => Promise<void>
  markRead: () => Promise<void>
}

export function useMySupportTickets(enabled: boolean): MySupportTicketsState {
  const [tickets, setTickets] = useState<MySupportTicket[]>([])
  const [unread, setUnread] = useState(0)
  const [ownAttention, setOwnAttention] = useState(0)
  const [forwarded, setForwarded] = useState<MySupportTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      // Beide Listen zugleich; die weitergeleiteten sind Beiwerk — scheitern
      // sie, bleibt die eigene Liste trotzdem stehen.
      const [res, fwd] = await Promise.all([
        fetchMySupportTickets(),
        fetchForwardedSupportTickets().catch(() => null),
      ])
      setTickets(res?.tickets ?? [])
      setUnread(res?.unread ?? 0)
      setOwnAttention(res?.attention ?? res?.unread ?? 0)
      if (fwd) setForwarded(fwd.tickets ?? [])
      setFailed(false)
    } catch {
      // Kein Fehlerbanner: dieser Aufruf hängt am Öffnen der Hilfe-Blase. Wer
      // gerade ein Problem melden will, soll nicht zuerst lesen, dass das
      // Nachsehen nach alten Meldungen nicht geklappt hat.
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => { void reload() }, [reload])

  const markRead = useCallback(async () => {
    // Sofort lokal löschen, dann erst serverseitig: das Abzeichen soll im
    // selben Augenblick weg sein, in dem der Nutzer die Antwort sieht — nicht
    // erst, wenn eine Baustellen-Verbindung den POST durchgelassen hat.
    setUnread(0)
    // Eine offene Rückfrage an mich bleibt im Abzeichen: sie wartet auf eine
    // Antwort, nicht auf einen Blick (wie bei den Wünschen, §7.1a).
    setOwnAttention(tickets.filter(t => t.waits_on_me).length)
    try {
      await markSupportRepliesRead()
    } catch {
      // Eine verlorene Lesequittung ist ein Blick zu viel, kein Datenverlust.
      // Beim nächsten Laden steht das Abzeichen wieder da — das ist die
      // richtige Richtung, in die dieser Fehler fallen soll.
    }
  }, [tickets])

  const attention = ownAttention + forwarded.filter(t => t.waits_on_me).length
  return { tickets, unread, forwarded, attention, loading, failed, reload, markRead }
}

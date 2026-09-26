import { useCallback, useEffect, useState } from 'react'
import { fetchMyWishes, markWishesRead, type MyWish } from '../api/featureRequests'

/**
 * Die eigenen Wünsche samt Stand — Spec docs/specs/feature-anfragen.md §5.5.
 *
 * Dasselbe Muster wie `useMySupportTickets`: der Hook sitzt in der Hilfe-Blase,
 * damit das Abzeichen am FAB auch bei geschlossenem Panel stimmt. Geladen wird
 * einmal beim Mounten und danach auf Anforderung — kein Polling. Der schnelle
 * Weg ist die Push (`feature_update`), dieser hier der verlässliche.
 */

export interface MyWishesState {
  wishes: MyWish[]
  /** Benachrichtigt, aber noch nicht gelesen — vom Server gezählt. */
  unread: number
  loading: boolean
  failed: boolean
  reload: () => Promise<void>
  markRead: () => Promise<void>
}

export function useMyWishes(enabled: boolean): MyWishesState {
  const [wishes, setWishes] = useState<MyWish[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const res = await fetchMyWishes()
      setWishes(res?.requests ?? [])
      setUnread(res?.unread ?? 0)
      setFailed(false)
    } catch {
      // Kein Fehlerbanner — wer gerade etwas melden oder wünschen will, soll
      // nicht zuerst lesen, dass das Nachsehen nicht geklappt hat.
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => { void reload() }, [reload])

  const markRead = useCallback(async () => {
    // Lokal sofort, serverseitig danach: das Abzeichen soll im selben
    // Augenblick weg sein, in dem der Nutzer die Nachricht sieht.
    setUnread(0)
    try {
      await markWishesRead()
    } catch {
      // Eine verlorene Quittung ist ein Blick zu viel, kein Datenverlust.
    }
  }, [])

  return { wishes, unread, loading, failed, reload, markRead }
}

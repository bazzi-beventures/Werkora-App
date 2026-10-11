import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  fetchMyWishes, markWishesRead, type MySubscription, type MyWish, type WishNews,
} from '../api/featureRequests'

/**
 * Die eigenen Wünsche samt Stand — Spec docs/specs/feature-anfragen.md §5.5.
 *
 * Dasselbe Muster wie `useMySupportTickets`: der Hook sitzt in der Hilfe-Blase,
 * damit das Abzeichen am FAB auch bei geschlossenem Panel stimmt. Geladen wird
 * einmal beim Mounten und danach auf Anforderung — kein Polling. Der schnelle
 * Weg ist die Push (`feature_update`), dieser hier der verlässliche.
 */

// ── Zahl für die Navigation ─────────────────────────────────────────────────
// Der Navigationspunkt «Wünsche & Roadmap» im Admin zeigt, wie viel auf den
// Nutzer wartet. Er lädt dafür nicht selbst: die Hilfe-Blase hält den Hook
// ohnehin (und steht immer, wenn das Modul an ist), die Roadmap ebenso. Jeder
// Ladevorgang und jede Quittung meldet die Zahl hierher — ein Request weniger
// je Screenwechsel, und Leiste und Blase können nicht auseinanderlaufen.
let attentionValue = 0
const attentionListeners = new Set<() => void>()

function publishAttention(n: number) {
  if (n === attentionValue) return
  attentionValue = n
  attentionListeners.forEach(fn => fn())
}

function subscribeAttention(fn: () => void) {
  attentionListeners.add(fn)
  return () => { attentionListeners.delete(fn) }
}

/** Was auf den Nutzer wartet: ungelesene Nachrichten plus offene Rückfragen. */
export function useWishAttention(): number {
  return useSyncExternalStore(subscribeAttention, () => attentionValue, () => 0)
}

export function resetWishAttentionForTests() {
  attentionValue = 0
}

export interface MyWishesState {
  wishes: MyWish[]
  /** Abonnierte Features (Spec §5.9). */
  subscriptions: MySubscription[]
  /** Was seit dem letzten Öffnen passiert ist — je Feature einmal. Grundlage
   *  für den Hinweis beim Start der App (`WishNewsNotice`). */
  news: WishNews[]
  /** Benachrichtigt, aber noch nicht gelesen — vom Server gezählt. */
  unread: number
  /** Ungelesenes plus offene Rückfragen (Spec §7.1a) — «OK» quittiert eine
   *  Rückfrage, beantwortet sie aber nicht; sie zählt hier weiter. */
  attention: number
  loading: boolean
  failed: boolean
  reload: () => Promise<void>
  markRead: () => Promise<void>
}

export function useMyWishes(enabled: boolean): MyWishesState {
  const [wishes, setWishes] = useState<MyWish[]>([])
  const [subscriptions, setSubscriptions] = useState<MySubscription[]>([])
  const [news, setNews] = useState<WishNews[]>([])
  const [unread, setUnread] = useState(0)
  const [attention, setAttention] = useState(0)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const res = await fetchMyWishes()
      setWishes(res?.requests ?? [])
      setSubscriptions(res?.subscriptions ?? [])
      setNews(res?.news ?? [])
      setUnread(res?.unread ?? 0)
      const count = res?.attention ?? res?.unread ?? 0
      setAttention(count)
      publishAttention(count)
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
    setNews([])
    // Offene Rückfragen bleiben — quittiert ist nur die Nachricht.
    const open = wishes.filter(w => w.triage === 'rueckfrage').length
    setAttention(open)
    publishAttention(open)
    try {
      await markWishesRead()
    } catch {
      // Eine verlorene Quittung ist ein Blick zu viel, kein Datenverlust.
    }
  }, [wishes])

  return { wishes, subscriptions, news, unread, attention, loading, failed, reload, markRead }
}

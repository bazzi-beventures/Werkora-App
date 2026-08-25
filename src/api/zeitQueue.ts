/**
 * Offline-Queue der Zeiterfassung — Persistenz und Drain-Logik.
 *
 * Aus ArbeitsZeitScreen.tsx herausgezogen, damit die Reihenfolge-Regeln ohne
 * gerendertes UI testbar sind. Auf der Baustelle ist ein verlorener Stempel
 * verlorener Lohn; die Regeln hier sind deshalb bewusst konservativ.
 */
import { ChatResponse, ZeitAction, ZeitOutcome } from './chat'

export const OFFLINE_QUEUE_KEY = 'zeit_offline_queue'

// Nach so vielen fehlgeschlagenen Drain-Versuchen gilt die Queue als verklemmt.
// Schützt vor dem Bevenetures-Szenario: alte SW-Installation hängt auf alter
// Origin, Backend blockt sie per CORS, Browser ist online, jede Drain-Runde
// scheitert — ohne Cap würde die Queue ewig wachsen und der User würde es nie
// bemerken.
export const MAX_DRAIN_ATTEMPTS = 10

export interface QueuedAction {
  action: ZeitAction
  recorded_at: string
  attempts?: number
}

export interface RejectedAction {
  item: QueuedAction
  reply: string
}

export interface DrainResult {
  /** Was in der Queue bleibt (unverändert in Reihenfolge). */
  remaining: QueuedAction[]
  /** Stempel, die gewirkt haben oder bereits gebucht waren. */
  applied: number
  /** Dauerhaft abgelehnte Stempel — der Nutzer muss davon erfahren. */
  rejected: RejectedAction[]
}

export function loadQueue(): QueuedAction[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveQueue(q: QueuedAction[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q))
}

export function isQueueStuck(q: QueuedAction[]): boolean {
  return q.some(it => (it.attempts ?? 0) >= MAX_DRAIN_ATTEMPTS)
}

/**
 * Leitet das Ergebnis einer Antwort ab.
 *
 * Das Feld `outcome` liefert erst das Backend ab dieser Änderung. Für die
 * Übergangszeit (neue PWA, noch nicht ausgerolltes Backend) wird aus
 * `action_taken` abgeleitet: hat die Aktion gewirkt, ist sie erledigt — sonst
 * ist sie fachlich nicht durchgegangen und ein erneuter Versuch würde daran
 * nichts ändern.
 */
export function outcomeOf(res: ChatResponse): ZeitOutcome {
  return res.outcome ?? (res.action_taken ? 'applied' : 'rejected')
}

/**
 * Arbeitet die Queue der Reihe nach ab.
 *
 * Die Queue ist ein geordnetes Protokoll **einer** Person: ein Ausstempeln ergibt
 * nur nach dem zugehörigen Einstempeln Sinn. Deshalb:
 *
 * - `applied`/`noop` → Eintrag ist erledigt, weiter mit dem nächsten.
 * - `retry` (Netzfehler, Server-Fehler) → **Abbruch**. Der Eintrag und alles
 *   dahinter bleiben in Reihenfolge liegen. Vorher lief die Schleife weiter und
 *   schickte das Ausstempeln zu einer Session, die es noch gar nicht gab — der
 *   Server antwortete mit HTTP 200 („Du bist nicht eingestempelt"), der Eintrag
 *   galt als erledigt und die Arbeitszeit war weg.
 * - `rejected` → wird nie durchgehen (zu alt, kein passender Gegenstempel).
 *   Eintrag entfernen und dem Nutzer melden, damit er einen Korrekturantrag
 *   stellt. Weitermachen ist sicher: hängt ein Ausstempeln an einem abgelehnten
 *   Einstempeln, lehnt der Server es aus demselben Grund ebenfalls ab.
 */
export async function drainActions(
  queue: QueuedAction[],
  send: (item: QueuedAction) => Promise<ChatResponse>,
): Promise<DrainResult> {
  const rejected: RejectedAction[] = []
  let applied = 0

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]
    let outcome: ZeitOutcome
    let reply = ''
    try {
      const res = await send(item)
      outcome = outcomeOf(res)
      reply = res.reply
    } catch {
      outcome = 'retry'
    }

    if (outcome === 'applied' || outcome === 'noop') {
      applied++
      continue
    }
    if (outcome === 'rejected') {
      rejected.push({ item, reply })
      continue
    }
    // retry — hier ist Schluss, der Rest bleibt unangetastet in der Reihenfolge.
    const head: QueuedAction = { ...item, attempts: (item.attempts ?? 0) + 1 }
    return { remaining: [head, ...queue.slice(i + 1)], applied, rejected }
  }

  return { remaining: [], applied, rejected }
}

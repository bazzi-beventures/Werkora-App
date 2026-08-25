/**
 * Offline-Queue der abgehakten Projekt-Aufgaben — Persistenz und Reconcile.
 *
 * Aus ProjekteScreen.tsx herausgezogen, damit die Regeln ohne gerendertes UI
 * testbar sind (dasselbe Muster wie api/zeitQueue.ts für die Zeiterfassung).
 *
 * Anders als bei den Stempeln (Lohn!) und den Projekt-Entwürfen ist ein
 * Abhak-Eintrag entbehrlich: der Server-Toggle ist idempotent, der Haken ist
 * beim nächsten Laden der Aufgabenliste wieder sichtbar korrekt. Deshalb wird
 * hier am Versuchs-Deckel GELÖSCHT statt nur gewarnt — ein Eintrag, der zehn
 * Online-Drains überlebt hat (Aufgabe gelöscht → 404, oder der
 * CORS-/Origin-Dauerfehler aus api/client.ts), ginge sonst nie mehr weg und
 * würde bei jedem online-Event neu versucht (Endlos-Queue, siehe Warnung in
 * api/client.ts). Genau dieser Deckel fehlte: MAX_DRAIN_ATTEMPTS war definiert
 * und attempts wurde hochgezählt, aber nie geprüft.
 */

const TASK_QUEUE_KEY = 'hinweise_offline_queue'

// Nach so vielen fehlgeschlagenen Drain-Versuchen (jeweils mit onLine === true)
// fliegt der Eintrag raus. attempts zählt nur echte Versuche — offline bricht
// der Drain ab, bevor er etwas hochzählt.
export const MAX_DRAIN_ATTEMPTS = 10

export interface QueuedTaskToggle {
  project_id: string
  task_id: string
  is_done: boolean
  queued_at: string
  attempts?: number
}

export function loadTaskQueue(): QueuedTaskToggle[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASK_QUEUE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTaskQueue(q: QueuedTaskToggle[]) {
  localStorage.setItem(TASK_QUEUE_KEY, JSON.stringify(q))
}

/** Mehrfaches Togglen derselben Aufgabe kollabiert auf den letzten Stand —
 *  nur der zuletzt gewünschte is_done-Wert muss synchronisiert werden. */
export function enqueueTaskToggle(item: QueuedTaskToggle) {
  const q = loadTaskQueue().filter(it => it.task_id !== item.task_id)
  q.push(item)
  saveTaskQueue(q)
}

/** Identität eines Queue-Eintrags. task_id allein reicht nicht: wird eine
 *  Aufgabe während des Drains neu getoggelt, ersetzt enqueueTaskToggle den alten
 *  Eintrag durch einen mit neuem queued_at — beide unterscheiden sich nur darüber. */
export const taskKey = (it: QueuedTaskToggle) => `${it.task_id}|${it.queued_at}`

/**
 * Führt das Drain-Ergebnis mit dem AKTUELLEN Queue-Stand zusammen.
 *
 * Reconcile statt blind überschreiben: ein während des Drains erfolgtes
 * Re-Toggle (enqueueTaskToggle) darf nicht verlorengehen, und Fehlversuche
 * müssen ihre attempts behalten.
 *
 * - `sent` (erfolgreich synchronisiert) → raus.
 * - gleicher Eintrag fehlgeschlagen → attempts-erhöhte Version; hat sie den
 *   Deckel erreicht, fliegt sie raus (siehe Kopf-Kommentar).
 * - anderes queued_at → während des Drains neu getoggelt → dieser gilt,
 *   mit frischen attempts (der neue Wunsch hatte noch keinen Fehlversuch).
 */
export function reconcileTaskQueue(
  current: QueuedTaskToggle[],
  sent: Set<string>,
  failed: QueuedTaskToggle[],
): QueuedTaskToggle[] {
  const failedByTask = new Map(failed.map(it => [it.task_id, it]))
  return current.flatMap(it => {
    if (sent.has(taskKey(it))) return []
    const f = failedByTask.get(it.task_id)
    if (!f || f.queued_at !== it.queued_at) return [it]
    if ((f.attempts ?? 0) >= MAX_DRAIN_ATTEMPTS) {
      // Diagnose-Spur statt stillem Verlust — der Toggle selbst ist entbehrlich.
      console.warn(`Aufgaben-Toggle nach ${MAX_DRAIN_ATTEMPTS} Fehlversuchen verworfen (Aufgabe ${f.task_id})`)
      return []
    }
    return [f]
  })
}

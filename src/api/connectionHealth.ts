/**
 * Trägt die Leitung? — die ehrlichere Antwort als `navigator.onLine`.
 *
 * `navigator.onLine` sagt nur, ob eine Netzwerkschnittstelle da ist. In der
 * Tiefgarage mit einem Balken Empfang sagt der Browser **online**, und kein
 * Request kommt durch. Genau dieser Fall ist der Normalfall, für den der
 * Offline-Rapport gebaut ist (docs/specs/offline-modus.md §4.5) — hinge sein
 * Einstieg allein am Flag, ginge das Feature dort nie auf.
 *
 * Dieselbe Erkenntnis steht schon in [photoQueue.ts](./photoQueue.ts): gepuffert
 * wird **am Fehlschlag**, nicht am Flag. Dieses Modul zieht sie an eine Stelle,
 * an der auch die Oberfläche sie befragen kann.
 *
 * **Wie es funktioniert:** [client.ts](./client.ts) meldet jeden Ausgang eines
 * Requests hierher — durchgekommen oder Netzfehler. «Weg» heisst: der Browser
 * sagt offline, ODER der letzte Versuch scheiterte am Netz und seither kam
 * nichts mehr durch. Ein einziger gelungener Request macht die Leitung sofort
 * wieder gut; ohne einen solchen verfällt die Annahme nach `DOWN_TTL_MS` von
 * selbst.
 *
 * **Warum das gefahrlos ist**, obwohl `isNetworkError` auch CORS-, Cert- und
 * Origin-Probleme einfängt (die Warnung in `client.ts`): der einzige Nutzer
 * dieses Signals ist der Einstieg in ein Formular, dessen Ergebnis in eine
 * Queue **mit Versuchs-Deckel** geht und dort nie stillschweigend verschwindet.
 * Genau die Bedingung, die `client.ts` für `isNetworkError` verlangt.
 */

/** Wie lange ein Netzfehler ohne neuen Erfolg nachwirkt. Kurz genug, dass eine
 *  einzelne Störung nicht den ganzen Nachmittag prägt; lang genug, dass der
 *  Weg vom Fehlschlag zum Antippen des Knopfes hineinpasst. */
export const DOWN_TTL_MS = 60 * 1000

/** Name des Ereignisses, mit dem sich die Oberfläche neu zeichnet. */
export const CONNECTION_EVENT = 'werkora-connection'

let lastFailureAt = 0
let lastSuccessAt = 0

function announce(): void {
  try {
    window.dispatchEvent(new Event(CONNECTION_EVENT))
  } catch {
    // Kein window (Tests, Worker) — der Zustand stimmt trotzdem, nur zeichnet
    // niemand neu.
  }
}

/** Ein Request ist durchgekommen. */
export function noteRequestSuccess(now: number = Date.now()): void {
  const war = connectionSeemsDown(now)
  lastSuccessAt = now
  if (war) announce()
}

/** Ein Request ist am Netz gescheitert (ApiError status 0). */
export function noteNetworkFailure(now: number = Date.now()): void {
  const war = connectionSeemsDown(now)
  lastFailureAt = now
  if (!war) announce()
}

/**
 * Ist gerade kein Durchkommen? Reine Abfrage — keine Nebenwirkung.
 *
 * `true` heisst nicht «der Browser ist offline», sondern «ein Request würde
 * jetzt aller Wahrscheinlichkeit nach scheitern».
 */
export function connectionSeemsDown(now: number = Date.now()): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (!lastFailureAt) return false
  // Seit dem Fehlschlag kam etwas durch — die Leitung trägt wieder.
  if (lastSuccessAt >= lastFailureAt) return false
  return now - lastFailureAt < DOWN_TTL_MS
}

/** Zurücksetzen — für Tests und für den Logout (der nächste Nutzer soll nicht
 *  die Netzgeschichte des vorherigen erben). */
export function resetConnectionHealth(): void {
  lastFailureAt = 0
  lastSuccessAt = 0
}

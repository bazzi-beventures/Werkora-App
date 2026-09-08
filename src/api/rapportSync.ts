/**
 * Die Netz-Momente des Offline-Rapports —
 * [docs/specs/offline-modus.md](../../../docs/specs/offline-modus.md) §4.5.5.
 *
 * Zwei Richtungen, ein Auslöser:
 *   * **raus** — wartende Rapporte hochladen ([rapportQueue.ts](./rapportQueue.ts)),
 *   * **rein** — den Materialkatalog spiegeln, damit der Ersatzteil-Schritt beim
 *     nächsten Funkloch etwas anzuzeigen hat ([materialCatalog.ts](./materialCatalog.ts)).
 *
 * Gerufen an denselben drei Stellen wie der Prefetch des Lesepakets: App-Start,
 * `online`-Ereignis und nach dem Einstempeln. Das Einstempeln ist der
 * verlässlichste Netz-Moment des Tages — morgens im Werkhof, bevor es in die
 * Tiefgarage geht.
 *
 * Wirft nie und blockiert nie: beide Richtungen sind best-effort, und ein
 * misslungener Lauf ist ein Nicht-Ereignis (die Queue bleibt liegen, der alte
 * Katalog-Stand bleibt stehen).
 */
import { refreshCatalog } from './materialCatalog'
import { drainRapportQueue, type RapportDrainResult } from './rapportQueue'

/**
 * Wie oft der Katalog gespiegelt wird — **zweimal am Tag**, nicht alle 15 Minuten
 * wie das Lesepaket.
 *
 * Der Unterschied ist die Natur der Daten. Das Lesepaket führt Aufgaben und
 * Kommentare: die ändern sich stündlich, und ein alter Stand ist dort teuer. Der
 * Materialkatalog sind **Stammdaten** — ein neuer Artikel kommt vielleicht
 * wöchentlich dazu.
 *
 * Und er ist der mit Abstand grösste Fetch der App. Gemessen (ohne Bilder, nur
 * Text): 500 Artikel ≈ 85 KB, 4500 ≈ 765 KB. Bei einer 15-Minuten-Drossel und
 * einem Arbeitstag, an dem das `online`-Ereignis zwischen zwei Baustellen
 * mehrfach flackert, wären das bis zu 24 MB je Monteur und Tag — für eine Liste,
 * die sich in der Zwischenzeit nie geändert hat. Bei acht Monteuren summiert sich
 * das auf mehrere Gigabyte im Monat, auf Mobilfunk.
 *
 * Zwölf Stunden heisst in der Praxis: einmal morgens beim Einstempeln, einmal am
 * Abend. Wer den Spiegel noch nie hat (neues Gerät, neuer Nutzer am geteilten
 * Tablet), bekommt ihn beim ersten Lauf sofort — die Drossel greift erst ab dem
 * zweiten. Und **online** geht der Picker ohnehin ans Netz: die Drossel verzögert
 * nie, was der Monteur gerade sieht, nur seinen Vorrat fürs nächste Funkloch.
 */
export const CATALOG_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000

// Re-Entrancy-Schutz: flatterndes Netz darf keine zwei Läufe parallel starten.
// Der Upload ist zwar idempotent (dafür ist die client_id da), aber zwei
// parallele Drains verbrennen Versuche gegen den Deckel.
let running = false
// Je Nutzer, nicht global: auf dem geteilten Werkhof-Tablet meldet sich der
// nächste Monteur binnen Minuten an, und SEIN Katalog-Spiegel ist noch leer.
const lastCatalogAt: Record<string, number> = {}

/** Nur für Tests — ein abgebrochener Lauf soll den nächsten Testfall nicht sperren. */
export function resetRapportSyncGuard(): void {
  running = false
  for (const k of Object.keys(lastCatalogAt)) delete lastCatalogAt[k]
}

export interface RapportSyncOptions {
  /** Feature `rapport_offline_formular` für DIESES Konto. Ohne das Feature bleibt
   *  die Queue liegen, statt gegen einen Endpoint zu laufen, der mit 403
   *  antwortet — der wartende Rapport ist dann Sache des Supports, nicht ein
   *  Dauerfehler im Netzwerk-Log. */
  enabled: boolean
  now?: number
}

export interface RapportSyncResult {
  drain: RapportDrainResult | null
  catalogRefreshed: boolean
}

export async function syncOfflineRapporte(
  userId: string,
  opts: RapportSyncOptions,
): Promise<RapportSyncResult> {
  const empty: RapportSyncResult = { drain: null, catalogRefreshed: false }
  if (!userId || !opts.enabled) return empty
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return empty
  if (running) return empty

  running = true
  const now = opts.now ?? Date.now()
  try {
    // Erst raus, dann rein: die wartende Arbeit des Monteurs hat Vorrang vor
    // einem frischeren Katalog. Auf einer schmalen Leitung entscheidet genau
    // diese Reihenfolge, was noch durchkommt.
    const drain = await drainRapportQueue(userId)
    let catalogRefreshed = false
    // «Noch nie gespiegelt» ist ausdrücklich, nicht ein Zahlenvergleich gegen 0:
    // ein neues Gerät (oder der nächste Monteur am geteilten Tablet) braucht den
    // Katalog SOFORT, nicht erst nach Ablauf eines Intervalls, das er nie
    // begonnen hat.
    const zuletzt = lastCatalogAt[userId]
    if (zuletzt === undefined || now - zuletzt >= CATALOG_MIN_INTERVAL_MS) {
      catalogRefreshed = await refreshCatalog(userId)
      // Auch ein misslungener Versuch setzt die Drossel: sonst läuft die App bei
      // einem dauerhaft fehlschlagenden Katalog-Fetch in eine Schleife.
      lastCatalogAt[userId] = now
    }
    return { drain, catalogRefreshed }
  } catch {
    return empty
  } finally {
    running = false
  }
}

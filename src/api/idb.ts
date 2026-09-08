/**
 * Schmaler IndexedDB-Adapter für die Offline-Puffer der Monteur-App.
 *
 * Herausgelöst aus [photoQueue.ts](./photoQueue.ts), als der zweite Puffer dazu
 * kam (die Rapport-Queue, [docs/specs/offline-modus.md](../../../docs/specs/offline-modus.md)
 * §4.5.5). Zwei Kopien derselben `openDb`/`withStore`-Mechanik wären genau die
 * Art Duplikat, die auseinanderläuft: die eine bekommt eine Härtung (ein
 * `onblocked`, ein `close()` im Fehlerfall), die andere nicht — und der
 * Unterschied fällt erst auf einem Baustellen-iPhone auf.
 *
 * **Best-effort ist Programm.** Private Mode, gesperrter Storage, ein Browser
 * ohne IndexedDB: nichts davon darf die App zum Absturz bringen. Jede Operation
 * liefert dann den übergebenen `fallback`, und der Aufrufer sagt dem Monteur
 * ehrlich, dass es nicht ging — statt ihm etwas zu versprechen, das nirgends
 * liegt.
 *
 * Bewusst **keine** Bibliothek (idb, dexie): gebraucht werden `getAll`, `add`,
 * `put` und `delete` auf einem einzigen Store je Datenbank. Das sind die 60
 * Zeilen hier gegen ein weiteres Paket im Bundle einer App, die auf einem
 * schlecht angebundenen Handy startet.
 */

/** Env-Trennung wie bei den localStorage-Keys ([storageKeys.ts](./storageKeys.ts)):
 *  Prod und Staging liegen auf derselben Origin und teilten sich sonst die
 *  Datenbanken. */
export const ENV_SUFFIX = import.meta.env.VITE_ENV_SUFFIX ?? ''

export interface IdbStore {
  /**
   * Führt eine Transaktion auf dem Store aus und räumt die Verbindung wieder ab.
   * Jeder Fehler — auch eine geworfene Exception im `run`-Callback — wird zu
   * `fallback`; der Aufrufer sieht nie eine Exception.
   *
   * Bei `readwrite` zählt `tx.oncomplete`, nicht der Erfolg des einzelnen
   * Requests: IndexedDB meldet den Request-Erfolg, bevor die Transaktion
   * committet ist, und ein späterer Abbruch (Quota, geschlossene Verbindung)
   * käme danach. `saveRapport` gäbe sonst `true` für einen Schreibvorgang
   * zurück, der nie ankam — und der Aufrufer löscht auf dieses `true` hin den
   * Entwurf.
   */
  withStore<T>(
    mode: IDBTransactionMode,
    fallback: T,
    run: (store: IDBObjectStore, done: (value: T) => void) => void,
  ): Promise<T>
}

/**
 * Erzeugt den Zugriff auf **einen** Object-Store in **einer** Datenbank.
 *
 * `params` legt den Schlüssel fest und ist damit die einzige Stelle, an der die
 * Puffer sich unterscheiden: der Foto-Puffer nummeriert automatisch durch (die
 * id ist zugleich die Aufnahmereihenfolge), die Rapport-Queue schlüsselt über
 * die `clientId` — derselbe Rapport zweimal einzureihen ist damit schon lokal
 * unmöglich, nicht erst auf dem Server.
 */
export function createIdbStore(
  dbName: string,
  storeName: string,
  params: IDBObjectStoreParameters,
  version = 1,
): IdbStore {
  function openDb(): Promise<IDBDatabase | null> {
    return new Promise(resolve => {
      try {
        if (typeof indexedDB === 'undefined' || !indexedDB) { resolve(null); return }
        const req = indexedDB.open(dbName, version)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, params)
          }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
        // Ein `blocked`-Event heisst: ein anderer Tab hält eine ältere Version
        // offen. Nicht ewig hängen bleiben — lieber ohne Puffer weiterarbeiten.
        req.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }

  return {
    async withStore<T>(
      mode: IDBTransactionMode,
      fallback: T,
      run: (store: IDBObjectStore, done: (value: T) => void) => void,
    ): Promise<T> {
      const db = await openDb()
      if (!db) return fallback
      return new Promise<T>(resolve => {
        let settled = false
        // Ergebnis des Requests — erst beim Commit herausgegeben.
        let pending: { value: T } | null = null
        const finish = (value: T) => {
          if (settled) return
          settled = true
          resolve(value)
          try { db.close() } catch { /* schon zu */ }
        }
        try {
          const tx = db.transaction(storeName, mode)
          tx.onerror = () => finish(fallback)
          tx.onabort = () => finish(fallback)
          tx.oncomplete = () => finish(pending ? pending.value : fallback)
          run(tx.objectStore(storeName), value => {
            pending = { value }
            // Lesen braucht kein Commit-Signal: die Daten sind da, und ein
            // `readonly`-tx ohne weitere Requests kann in manchen Browsern
            // schliessen, bevor `oncomplete` feuert.
            if (mode === 'readonly') finish(value)
          })
        } catch {
          finish(fallback)
        }
      })
    },
  }
}

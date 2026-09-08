/**
 * Materialkatalog auf dem Gerät — damit der Ersatzteil-Schritt des offline
 * erfassten Rapports funktioniert
 * ([docs/specs/offline-modus.md](../../../docs/specs/offline-modus.md) §4.5.3).
 *
 * Zwei Listen, ein Stand:
 *   * die **kuratierte Ersatzteil-Liste** (`/pwa/chat/frequent-materials`) —
 *     klein, ein- bis zweistellig,
 *   * der **Artikelkatalog** (`/pwa/chat/material-gallery`) — bei Stobag rund
 *     4500 aktive Artikel.
 *
 * **Warum IndexedDB und nicht das Lesepaket:** gemessen sind es ~174 Byte je
 * Artikel, also 85 KB bei 500 Artikeln und 765 KB bei den ~4500 eines grossen
 * Katalogs. Für IndexedDB ist das nichts (der Foto-Puffer nebenan hält bis zu
 * 50 MB), für localStorage dagegen bis zu ein Sechstel des gesamten 5-MB-Budgets,
 * das sich Entwurf, Stempel-Queue und Lesepaket ohnehin schon teilen — ein
 * Schreibversuch dieser Grösse ist genau der, der `QuotaExceededError` wirft und
 * dabei den halben Offline-Bestand mitnimmt.
 *
 * **Ohne Bilder.** `image_url` ist eine kurzlebig signierte URL auf einen
 * privaten Bucket: sie ist beim nächsten Laden eine andere, der SW-`api-cache`
 * trifft nie, und die Bilddaten zu spiegeln hiesse, den ganzen Bucket aufs Handy
 * zu holen. Offline zeigt der Picker deshalb Platzhalter-Kacheln mit Name,
 * Artikelnummer und Kategorie; gesucht wird unverändert über alle Artikel
 * (`filterGallery` ist eine reine Funktion). Für den Monteur, der weiss, was er
 * verbaut hat, reicht das — das Bild hilft beim Suchen, nicht beim Wiedererkennen
 * der eigenen Wahl. Es sind auch die Bilder, die den Spiegel überhaupt erst teuer
 * machen würden: ein Katalog mit 500 Kacheln à 100 KB wären 50 MB, jede Woche neu
 * zu laden. Der Textspiegel kostet ein Fünfhundertstel davon.
 *
 * Gespiegelt wird **zweimal am Tag**, nicht alle 15 Minuten wie das Lesepaket —
 * Begründung bei `CATALOG_MIN_INTERVAL_MS` in [rapportSync.ts](./rapportSync.ts).
 */
import { FrequentMaterialOption, GalleryMaterialOption, fetchFrequentMaterials, fetchMaterialGallery } from './chat'
import { isNetworkError } from './client'
import { createIdbStore, ENV_SUFFIX } from './idb'

export const DB_NAME = `werkora-katalog${ENV_SUFFIX}`
export const STORE = 'catalog'

/** Deckel für den gespiegelten Katalog. Grosszügig über dem grössten bekannten
 *  Bestand (Stobag ~4500) und eng genug, dass ein Import-Unfall im Backend
 *  nicht 50 MB aufs Handy schreibt. */
export const MAX_GALLERY_ITEMS = 6000

export interface CachedCatalog {
  /** Primärschlüssel: pro Mitarbeiter ein Eintrag (geteiltes Werkhof-Tablet). */
  userId: string
  savedAt: string
  frequent: FrequentMaterialOption[]
  /** Ohne `image_url` — siehe Modul-Kommentar. */
  gallery: GalleryMaterialOption[]
}

const { withStore } = createIdbStore(DB_NAME, STORE, { keyPath: 'userId' })

/** Wirft die signierte Bild-URL weg. Sie wäre beim nächsten Öffnen abgelaufen,
 *  und ein toter `<img src>` ist schlechter als ein ehrlicher Platzhalter. */
function stripImages(items: GalleryMaterialOption[]): GalleryMaterialOption[] {
  return items.slice(0, MAX_GALLERY_ITEMS).map(({ image_url: _drop, ...rest }) => rest)
}

export async function loadCatalog(userId: string): Promise<CachedCatalog | null> {
  if (!userId) return null
  return withStore<CachedCatalog | null>('readonly', null, (store, done) => {
    const req = store.get(userId)
    req.onsuccess = () => {
      const row = req.result as CachedCatalog | undefined
      if (!row || !Array.isArray(row.gallery) || !Array.isArray(row.frequent)) { done(null); return }
      done(row)
    }
    req.onerror = () => done(null)
  })
}

export async function saveCatalog(
  userId: string,
  data: { frequent: FrequentMaterialOption[]; gallery: GalleryMaterialOption[] },
  now = new Date(),
): Promise<boolean> {
  if (!userId) return false
  return withStore<boolean>('readwrite', false, (store, done) => {
    const req = store.put({
      userId,
      savedAt: now.toISOString(),
      frequent: data.frequent,
      gallery: stripImages(data.gallery),
    } satisfies CachedCatalog)
    req.onsuccess = () => done(true)
    req.onerror = () => done(false)
  })
}

/**
 * Holt beide Listen und legt sie ab. Läuft im Prefetch (App-Start, Einstempeln)
 * und immer dann, wenn der Picker online geöffnet wurde — dann ist der Stand
 * ohnehin frisch geladen und muss nur noch aufgehoben werden.
 *
 * Wirft nie: ein misslungener Spiegel ist ein Nicht-Ereignis, der alte Stand
 * bleibt stehen.
 */
export async function refreshCatalog(userId: string): Promise<boolean> {
  if (!userId) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try {
    // `null` heisst «nicht geladen», `[]` heisst «leer geladen». Der Unterschied
    // entscheidet: ein Teil-Fehlschlag darf den bestehenden Spiegel nicht durch
    // eine leere Liste ersetzen. Genau das würde passieren, wenn der grosse
    // Katalog-Fetch auf schmaler Leitung abbricht, während die kleine kuratierte
    // Liste durchkommt — der Monteur stünde im Funkloch vor einem leeren Picker.
    const [frequent, gallery] = await Promise.all([
      fetchFrequentMaterials().catch(() => null),
      fetchMaterialGallery().catch(() => null),
    ])
    if (frequent === null && gallery === null) return false

    const existing = await loadCatalog(userId)
    return await saveCatalog(userId, {
      frequent: frequent ?? existing?.frequent ?? [],
      gallery: gallery ?? existing?.gallery ?? [],
    })
  } catch {
    return false
  }
}

/** Was der Picker anzeigt, und woher es kommt. `offline: true` schaltet den
 *  Stand-Badge ein — dieselbe Regel wie beim Lesepaket (Spec §3.4): der Monteur
 *  soll nie im Unklaren sein, wie alt das ist, worauf er tippt. */
export interface CatalogView<T> {
  items: T[]
  offline: boolean
  savedAt: string
}

/**
 * Erst das Netz, bei Netzfehler der lokale Stand.
 *
 * `isNetworkError` statt `isOfflineError` — wie beim Lesepaket: auch
 * «Empfangsbalken, aber kein Durchkommen» soll den Spiegel zeigen. Gefahrlos,
 * weil rein lesend; die Auswahl selbst prüft am Ende der Server beim Upload.
 */
export async function loadFrequentMaterials(userId: string): Promise<CatalogView<FrequentMaterialOption>> {
  try {
    const items = await fetchFrequentMaterials()
    return { items, offline: false, savedAt: '' }
  } catch (err) {
    if (!isNetworkError(err)) throw err
    const cached = await loadCatalog(userId)
    return { items: cached?.frequent ?? [], offline: true, savedAt: cached?.savedAt ?? '' }
  }
}

export async function loadMaterialGallery(userId: string): Promise<CatalogView<GalleryMaterialOption>> {
  try {
    const items = await fetchMaterialGallery()
    return { items, offline: false, savedAt: '' }
  } catch (err) {
    if (!isNetworkError(err)) throw err
    const cached = await loadCatalog(userId)
    return { items: cached?.gallery ?? [], offline: true, savedAt: cached?.savedAt ?? '' }
  }
}

/**
 * Zeigt der Katalog-Knopf sich? Online beantwortet das der billige
 * count-Endpoint; offline zählt der Spiegel. Ein Knopf, der offline ins Leere
 * führt, wäre genau die Falle, die die Spec für die Projektliste beschreibt.
 */
export async function galleryCountOffline(userId: string): Promise<number> {
  const cached = await loadCatalog(userId)
  return cached?.gallery.length ?? 0
}

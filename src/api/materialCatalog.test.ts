import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ApiError } from './client'
import {
  DB_NAME, MAX_GALLERY_ITEMS,
  galleryCountOffline, loadCatalog, loadFrequentMaterials, loadMaterialGallery,
  refreshCatalog, saveCatalog,
} from './materialCatalog'
import * as chatApi from './chat'
import type { FrequentMaterialOption, GalleryMaterialOption } from './chat'

// Materialkatalog auf dem Gerät, docs/specs/offline-modus.md §4.5.3.
//
// Der Katalog ist der einzige Teil des Offline-Rapports, der NICHT ins
// Lesepaket passt (bei Stobag ~4500 Artikel, rund 500 KB JSON) — deshalb
// IndexedDB. Und er wird ohne Bilder gespiegelt: die `image_url` ist eine
// kurzlebig signierte URL, beim nächsten Laden eine andere.

function resetDb(): Promise<void> {
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(resetDb)
afterEach(() => vi.restoreAllMocks())

const gallery = (over: Partial<GalleryMaterialOption> = {}): GalleryMaterialOption => ({
  art_nr: 'A-1', name: 'Motor', unit: 'Stk', calc_vk: 120,
  image_url: 'https://storage.example/signed?token=abc', ...over,
})

const frequent = (over: Partial<FrequentMaterialOption> = {}): FrequentMaterialOption => ({
  id: 'f-1', art_nr: 'A-1', name: 'Motor', unit: 'Stk', calc_vk: 120, ...over,
})

describe('Spiegel', () => {
  it('legt beide Listen ab', async () => {
    await saveCatalog('u-1', { frequent: [frequent()], gallery: [gallery()] })
    const cached = await loadCatalog('u-1')
    expect(cached?.frequent).toHaveLength(1)
    expect(cached?.gallery).toHaveLength(1)
    expect(cached?.savedAt).toBeTruthy()
  })

  it('wirft die signierte Bild-URL weg', async () => {
    // Sie wäre beim nächsten Öffnen abgelaufen, und ein toter <img src> ist
    // schlechter als ein ehrlicher Platzhalter. Name, Nummer und Kategorie
    // bleiben — damit funktioniert die Suche unverändert.
    await saveCatalog('u-1', { frequent: [], gallery: [gallery({ category: 'Antriebe' })] })
    const cached = await loadCatalog('u-1')
    expect(cached!.gallery[0].image_url).toBeUndefined()
    expect(cached!.gallery[0].name).toBe('Motor')
    expect(cached!.gallery[0].category).toBe('Antriebe')
  })

  it('deckelt den Katalog', async () => {
    const many = Array.from({ length: MAX_GALLERY_ITEMS + 50 }, (_, i) => gallery({ art_nr: `A-${i}` }))
    await saveCatalog('u-1', { frequent: [], gallery: many })
    expect((await loadCatalog('u-1'))!.gallery).toHaveLength(MAX_GALLERY_ITEMS)
  })

  it('trennt nach Mitarbeiter — geteiltes Werkhof-Tablet', async () => {
    await saveCatalog('u-1', { frequent: [frequent()], gallery: [] })
    expect(await loadCatalog('u-2')).toBeNull()
  })
})

describe('refreshCatalog', () => {
  it('holt beide Listen und legt sie ab', async () => {
    vi.spyOn(chatApi, 'fetchFrequentMaterials').mockResolvedValue([frequent()])
    vi.spyOn(chatApi, 'fetchMaterialGallery').mockResolvedValue([gallery()])

    expect(await refreshCatalog('u-1')).toBe(true)
    expect((await loadCatalog('u-1'))!.gallery).toHaveLength(1)
  })

  it('behält den Katalog, wenn nur SEIN Fetch scheitert', async () => {
    // Der teure Fall: die kleine kuratierte Liste kommt auf schmaler Leitung
    // durch, der grosse Katalog bricht ab. Würde der Spiegel dann mit einer
    // leeren Liste überschrieben, stünde der Monteur im nächsten Funkloch vor
    // einem leeren Picker — ohne dass je etwas gemeldet worden wäre.
    await saveCatalog('u-1', { frequent: [], gallery: [gallery({ art_nr: 'ALT' })] })
    vi.spyOn(chatApi, 'fetchFrequentMaterials').mockResolvedValue([frequent()])
    vi.spyOn(chatApi, 'fetchMaterialGallery').mockRejectedValue(new ApiError(0, 'offline'))

    expect(await refreshCatalog('u-1')).toBe(true)
    const cached = await loadCatalog('u-1')
    expect(cached!.gallery[0].art_nr).toBe('ALT')   // alter Stand gehalten
    expect(cached!.frequent).toHaveLength(1)        // frischer Teil übernommen
  })

  it('tut nichts, wenn BEIDE Fetches scheitern', async () => {
    await saveCatalog('u-1', { frequent: [frequent()], gallery: [gallery()] })
    vi.spyOn(chatApi, 'fetchFrequentMaterials').mockRejectedValue(new ApiError(0, 'offline'))
    vi.spyOn(chatApi, 'fetchMaterialGallery').mockRejectedValue(new ApiError(0, 'offline'))

    expect(await refreshCatalog('u-1')).toBe(false)
    expect((await loadCatalog('u-1'))!.gallery).toHaveLength(1)
  })

  it('leert den Spiegel, wenn der Mandant wirklich nichts (mehr) hat', async () => {
    // Zwei ERFOLGREICHE leere Antworten sind eine Aussage, kein Fehlschlag: alle
    // Artikel deaktiviert. Den alten Stand zu halten hiesse, dem Monteur Artikel
    // anzubieten, die es nicht mehr gibt — und die der Upload dann ablehnt.
    await saveCatalog('u-1', { frequent: [frequent()], gallery: [gallery()] })
    vi.spyOn(chatApi, 'fetchFrequentMaterials').mockResolvedValue([])
    vi.spyOn(chatApi, 'fetchMaterialGallery').mockResolvedValue([])

    expect(await refreshCatalog('u-1')).toBe(true)
    expect((await loadCatalog('u-1'))!.gallery).toHaveLength(0)
  })

  it('wirft nie', async () => {
    vi.spyOn(chatApi, 'fetchFrequentMaterials').mockRejectedValue(new ApiError(500, 'kaputt'))
    vi.spyOn(chatApi, 'fetchMaterialGallery').mockRejectedValue(new ApiError(500, 'kaputt'))
    await expect(refreshCatalog('u-1')).resolves.toBe(false)
  })
})

describe('Lesen: erst Netz, dann Spiegel', () => {
  it('nimmt die Netz-Antwort, wenn sie kommt', async () => {
    await saveCatalog('u-1', { frequent: [], gallery: [gallery({ art_nr: 'ALT' })] })
    vi.spyOn(chatApi, 'fetchMaterialGallery').mockResolvedValue([gallery({ art_nr: 'FRISCH' })])

    const view = await loadMaterialGallery('u-1')
    expect(view.items[0].art_nr).toBe('FRISCH')
    expect(view.offline).toBe(false)
  })

  it('fällt bei Netzfehler auf den Spiegel zurück, mit Stand', async () => {
    // `isNetworkError` statt `isOfflineError` — auch «Empfangsbalken, aber kein
    // Durchkommen» soll den Spiegel zeigen. Gefahrlos, weil rein lesend.
    await saveCatalog('u-1', { frequent: [frequent()], gallery: [gallery({ art_nr: 'ALT' })] })
    vi.spyOn(chatApi, 'fetchMaterialGallery').mockRejectedValue(new ApiError(0, 'offline'))
    vi.spyOn(chatApi, 'fetchFrequentMaterials').mockRejectedValue(new ApiError(0, 'offline'))

    const view = await loadMaterialGallery('u-1')
    expect(view.items[0].art_nr).toBe('ALT')
    expect(view.offline).toBe(true)
    expect(view.savedAt).toBeTruthy()

    const list = await loadFrequentMaterials('u-1')
    expect(list.items).toHaveLength(1)
    expect(list.offline).toBe(true)
  })

  it('reicht einen ECHTEN Fehler durch, statt ihn als «offline» zu tarnen', async () => {
    // Ein 500 ist ein Fehler und soll als solcher ankommen — sonst zeigt der
    // Picker stumm einen alten Stand, während der Server kaputt ist.
    vi.spyOn(chatApi, 'fetchMaterialGallery').mockRejectedValue(new ApiError(500, 'kaputt'))
    await expect(loadMaterialGallery('u-1')).rejects.toThrow()
  })

  it('zählt offline aus dem Spiegel', async () => {
    // Ein Katalog-Knopf, der offline ins Leere führt, wäre genau die Falle, die
    // diese Spec für die Projektliste beschreibt.
    expect(await galleryCountOffline('u-1')).toBe(0)
    await saveCatalog('u-1', { frequent: [], gallery: [gallery(), gallery({ art_nr: 'A-2' })] })
    expect(await galleryCountOffline('u-1')).toBe(2)
  })
})

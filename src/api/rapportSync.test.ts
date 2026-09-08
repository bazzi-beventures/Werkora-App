import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CATALOG_MIN_INTERVAL_MS, resetRapportSyncGuard, syncOfflineRapporte } from './rapportSync'
import * as queue from './rapportQueue'
import * as catalog from './materialCatalog'

// Die Netz-Momente des Offline-Rapports, docs/specs/offline-modus.md §4.5.5.

beforeEach(() => {
  resetRapportSyncGuard()
  vi.spyOn(queue, 'drainRapportQueue').mockResolvedValue({ uploaded: [], held: [], signatureLost: [], remaining: 0 })
  vi.spyOn(catalog, 'refreshCatalog').mockResolvedValue(true)
})
afterEach(() => vi.restoreAllMocks())

describe('syncOfflineRapporte', () => {
  it('lädt hoch und spiegelt den Katalog', async () => {
    const res = await syncOfflineRapporte('u-1', { enabled: true })
    expect(queue.drainRapportQueue).toHaveBeenCalledWith('u-1')
    expect(catalog.refreshCatalog).toHaveBeenCalledWith('u-1')
    expect(res.catalogRefreshed).toBe(true)
  })

  it('tut ohne Feature gar nichts', async () => {
    // Ohne das Feature liefe der Upload gegen einen Endpoint, der mit 403
    // antwortet — der wartende Rapport wäre dann ein Dauerfehler im
    // Netzwerk-Log statt ein Fall für den Support.
    await syncOfflineRapporte('u-1', { enabled: false })
    expect(queue.drainRapportQueue).not.toHaveBeenCalled()
    expect(catalog.refreshCatalog).not.toHaveBeenCalled()
  })

  it('tut ohne Nutzer gar nichts', async () => {
    await syncOfflineRapporte('', { enabled: true })
    expect(queue.drainRapportQueue).not.toHaveBeenCalled()
  })

  it('drosselt den Katalog, nicht den Upload', async () => {
    // Der Katalog ist der teuerste Einzel-Fetch der App; ihn bei jedem
    // `online`-Flackern zu holen wäre auf einer schlechten Leitung schädlicher
    // als ein etwas älterer Stand. Die wartende Arbeit des Monteurs wird
    // dagegen jedes Mal versucht.
    const t0 = Date.parse('2026-09-08T06:00:00Z')
    await syncOfflineRapporte('u-1', { enabled: true, now: t0 })
    await syncOfflineRapporte('u-1', { enabled: true, now: t0 + 60_000 })
    expect(queue.drainRapportQueue).toHaveBeenCalledTimes(2)
    expect(catalog.refreshCatalog).toHaveBeenCalledTimes(1)

    await syncOfflineRapporte('u-1', { enabled: true, now: t0 + CATALOG_MIN_INTERVAL_MS + 1 })
    expect(catalog.refreshCatalog).toHaveBeenCalledTimes(2)
  })

  it('spiegelt beim ERSTEN Lauf sofort', async () => {
    // Ein neues Gerät (oder der nächste Monteur am geteilten Tablet) hat noch
    // keinen Katalog. Ihn 12 Stunden auf ein Intervall warten zu lassen, das er
    // nie begonnen hat, hiesse: sein erstes Funkloch trifft ihn mit leerem Picker.
    await syncOfflineRapporte('u-neu', { enabled: true, now: 1000 })
    expect(catalog.refreshCatalog).toHaveBeenCalledWith('u-neu')
  })

  it('drosselt je Nutzer — geteiltes Werkhof-Tablet', async () => {
    const t0 = Date.parse('2026-09-08T08:00:00Z')
    await syncOfflineRapporte('u-1', { enabled: true, now: t0 })
    await syncOfflineRapporte('u-2', { enabled: true, now: t0 + 1000 })
    expect(catalog.refreshCatalog).toHaveBeenCalledTimes(2)
  })

  it('setzt die Drossel auch nach einem Fehlversuch', async () => {
    // Sonst läuft die App bei einem dauerhaft fehlschlagenden Katalog-Fetch in
    // eine Schleife.
    vi.mocked(catalog.refreshCatalog).mockResolvedValue(false)
    const t0 = Date.parse('2026-09-08T07:00:00Z')
    await syncOfflineRapporte('u-1', { enabled: true, now: t0 })
    await syncOfflineRapporte('u-1', { enabled: true, now: t0 + 1000 })
    expect(catalog.refreshCatalog).toHaveBeenCalledTimes(1)
  })

  it('lässt keine zwei Läufe parallel', async () => {
    // Flatterndes Netz: zwei parallele Drains verbrennen Versuche gegen den Deckel.
    let release: () => void = () => {}
    vi.mocked(queue.drainRapportQueue).mockImplementation(
      () => new Promise(resolve => { release = () => resolve({ uploaded: [], held: [], signatureLost: [], remaining: 0 }) }),
    )
    const first = syncOfflineRapporte('u-1', { enabled: true })
    const second = await syncOfflineRapporte('u-1', { enabled: true })
    expect(second.drain).toBeNull()
    release()
    await first
    expect(queue.drainRapportQueue).toHaveBeenCalledTimes(1)
  })

  it('wirft nie', async () => {
    vi.mocked(queue.drainRapportQueue).mockRejectedValue(new Error('kaputt'))
    await expect(syncOfflineRapporte('u-1', { enabled: true })).resolves.toEqual({
      drain: null, catalogRefreshed: false,
    })
  })
})

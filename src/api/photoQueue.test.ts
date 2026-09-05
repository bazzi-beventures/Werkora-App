import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiError } from './client'
import {
  DB_NAME, MAX_DRAIN_ATTEMPTS, MAX_PENDING_PHOTOS, MAX_PHOTO_BYTES,
  countPending, drainPhotoQueue, enqueuePhoto, pendingPhotos, recordedAtLabel, verdictFor,
} from './photoQueue'
import type { ChatResponse } from './chat'

// Offline-Foto-Puffer, docs/specs/offline-modus.md §6 (Ausbaustufe 2).
// Auf der Baustelle ist ein verlorenes Foto ein verlorener Beweis: die Fassade
// ist zu, das Gerüst weg. Die Regeln hier sind deshalb konservativ — im Zweifel
// bleibt ein Foto liegen, statt weggeworfen zu werden.

const ok: ChatResponse = { reply: 'Foto gespeichert (1 Foto).', action_taken: 'photo_added' }

const jpeg = (name = 'foto.jpg', size = 128) =>
  new File([new Uint8Array(size)], name, { type: 'image/jpeg' })

function resetDb(): Promise<void> {
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(resetDb)

describe('verdictFor', () => {
  it('lässt ein Foto bei fehlendem Netz liegen', () => {
    expect(verdictFor(new ApiError(0, 'offline'))).toBe('retry')
  })

  it('hält bei abgelaufener Session an, statt das Foto wegzuwerfen', () => {
    // Nicht das Foto ist kaputt, sondern die Anmeldung — es muss den
    // erneuten Login überleben.
    expect(verdictFor(new ApiError(401, 'unauthorized'))).toBe('abort')
    expect(verdictFor(new ApiError(403, 'csrf_invalid'))).toBe('abort')
  })

  it('hält bei Drosselung an', () => {
    expect(verdictFor(new ApiError(429, 'rate_limited'))).toBe('abort')
  })

  it('versucht es bei Serverfehlern erneut', () => {
    expect(verdictFor(new ApiError(500, 'boom'))).toBe('retry')
  })

  it('gibt ein dauerhaft abgewiesenes Foto auf', () => {
    // 400 «photo_too_large» käme auch beim hundertsten Versuch nicht durch.
    expect(verdictFor(new ApiError(400, 'photo_too_large'))).toBe('drop')
  })
})

describe('Puffern', () => {
  it('merkt ein Foto und zählt es', async () => {
    expect(await enqueuePhoto('u1', jpeg())).toBe('queued')
    expect(await countPending('u1')).toBe(1)
  })

  it('hält die Fotos zweier Nutzer auseinander', async () => {
    // Werkhof-Tablet: der nächste Monteur darf das Foto des Vorgängers weder
    // sehen noch in SEINEN Rapport hochladen.
    await enqueuePhoto('u1', jpeg('a.jpg'))
    await enqueuePhoto('u2', jpeg('b.jpg'))
    expect(await countPending('u1')).toBe(1)
    expect((await pendingPhotos('u1'))[0].filename).toBe('a.jpg')
  })

  it('gibt die Fotos in Aufnahmereihenfolge zurück', async () => {
    for (const n of ['1.jpg', '2.jpg', '3.jpg']) await enqueuePhoto('u1', jpeg(n))
    expect((await pendingPhotos('u1')).map(p => p.filename)).toEqual(['1.jpg', '2.jpg', '3.jpg'])
  })

  it('nimmt kein Foto über dem Serverlimit an', async () => {
    // Ein zu grosses Foto würde tagelang mitwandern und am Ende doch abgewiesen.
    expect(await enqueuePhoto('u1', jpeg('gross.jpg', MAX_PHOTO_BYTES + 1))).toBe('too_large')
    expect(await countPending('u1')).toBe(0)
  })

  it('deckelt den Puffer beim Serverlimit pro Rapport', async () => {
    for (let i = 0; i < MAX_PENDING_PHOTOS; i++) await enqueuePhoto('u1', jpeg(`${i}.jpg`))
    expect(await enqueuePhoto('u1', jpeg('zuviel.jpg'))).toBe('full')
    expect(await countPending('u1')).toBe(MAX_PENDING_PHOTOS)
  })
})

describe('Nachliefern', () => {
  it('lädt die wartenden Fotos hoch und leert den Puffer', async () => {
    await enqueuePhoto('u1', jpeg('a.jpg'))
    await enqueuePhoto('u1', jpeg('b.jpg'))
    const upload = vi.fn().mockResolvedValue(ok)

    const res = await drainPhotoQueue('u1', upload)

    expect(res.uploaded.map(p => p.filename)).toEqual(['a.jpg', 'b.jpg'])
    expect(res.remaining).toBe(0)
    expect(await countPending('u1')).toBe(0)
  })

  it('reicht die Bilddaten unverändert weiter', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    await enqueuePhoto('u1', new File([bytes], 'a.jpg', { type: 'image/jpeg' }))
    const upload = vi.fn().mockResolvedValue(ok)

    await drainPhotoQueue('u1', upload)

    const sent = upload.mock.calls[0][0] as File
    expect(sent.name).toBe('a.jpg')
    expect(sent.type).toBe('image/jpeg')
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(bytes)
  })

  it('rührt fremde Fotos nicht an', async () => {
    await enqueuePhoto('u1', jpeg('meins.jpg'))
    await enqueuePhoto('u2', jpeg('fremd.jpg'))
    const upload = vi.fn().mockResolvedValue(ok)

    await drainPhotoQueue('u1', upload)

    expect(upload).toHaveBeenCalledTimes(1)
    expect(await countPending('u2')).toBe(1)
  })

  it('behält das Foto, wenn das Netz mitten im Lauf wegbricht', async () => {
    await enqueuePhoto('u1', jpeg('a.jpg'))
    await enqueuePhoto('u1', jpeg('b.jpg'))
    const upload = vi.fn()
      .mockResolvedValueOnce(ok)
      .mockRejectedValueOnce(new ApiError(0, 'offline'))

    const res = await drainPhotoQueue('u1', upload)

    expect(res.uploaded.map(p => p.filename)).toEqual(['a.jpg'])
    expect(res.dropped).toEqual([])
    expect(res.remaining).toBe(1)
    // Nach dem Fehlschlag wird NICHT weiterprobiert: die Reihenfolge im Rapport
    // soll der Aufnahmereihenfolge folgen.
    expect(upload).toHaveBeenCalledTimes(2)
  })

  it('versucht es beim nächsten Lauf erneut', async () => {
    await enqueuePhoto('u1', jpeg('a.jpg'))
    await drainPhotoQueue('u1', vi.fn().mockRejectedValue(new ApiError(0, 'offline')))

    const res = await drainPhotoQueue('u1', vi.fn().mockResolvedValue(ok))

    expect(res.uploaded.map(p => p.filename)).toEqual(['a.jpg'])
    expect(await countPending('u1')).toBe(0)
  })

  it('gibt ein dauerhaft abgewiesenes Foto auf und meldet es', async () => {
    await enqueuePhoto('u1', jpeg('kaputt.jpg'))
    await enqueuePhoto('u1', jpeg('gut.jpg'))
    const upload = vi.fn()
      .mockRejectedValueOnce(new ApiError(400, 'not_an_image'))
      .mockResolvedValueOnce(ok)

    const res = await drainPhotoQueue('u1', upload)

    // Aufgeben ist erlaubt — stillschweigend verschwinden nicht.
    expect(res.dropped.map(p => p.filename)).toEqual(['kaputt.jpg'])
    expect(res.uploaded.map(p => p.filename)).toEqual(['gut.jpg'])
    expect(await countPending('u1')).toBe(0)
  })

  it('gibt nach dem Versuchs-Deckel auf, statt ewig zu wachsen', async () => {
    // Dauerfehler ohne Deckel = die Endlos-Queue aus dem Domain-Wechsel
    // (siehe zeitQueue.ts MAX_DRAIN_ATTEMPTS).
    await enqueuePhoto('u1', jpeg('a.jpg'))
    const dead = vi.fn().mockRejectedValue(new ApiError(0, 'offline'))
    for (let i = 0; i < MAX_DRAIN_ATTEMPTS; i++) await drainPhotoQueue('u1', dead)

    const res = await drainPhotoQueue('u1', dead)

    expect(res.dropped.map(p => p.filename)).toEqual(['a.jpg'])
    expect(await countPending('u1')).toBe(0)
  })

  it('kommt mit leerem Puffer klar', async () => {
    const upload = vi.fn()
    const res = await drainPhotoQueue('u1', upload)
    expect(res).toEqual({ uploaded: [], dropped: [], remaining: 0 })
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('recordedAtLabel', () => {
  it('nennt die Uhrzeit der Aufnahme', () => {
    expect(recordedAtLabel(new Date(2026, 8, 5, 16, 42).toISOString())).toBe('16:42')
  })

  it('bleibt bei kaputtem Zeitstempel stumm, statt «Invalid Date» zu zeigen', () => {
    expect(recordedAtLabel('quatsch')).toBe('')
  })
})

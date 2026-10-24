import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiError } from './client'
import {
  DB_NAME, MAX_ATTEMPTS, MAX_BYTES, MAX_PENDING,
  drainLieferscheinQueue, enqueueLieferschein, pendingLieferscheine,
} from './lieferscheinQueue'

// Offline-Puffer der Lieferscheine, docs/specs/lieferschein-erfassung.md §3.4.
// Ein Lieferschein, der im Funkloch fotografiert wurde, darf nicht verloren gehen —
// und beim Leeren nie doppelt im Eingang landen.

const foto = (name = 'ls.jpg', size = 64) =>
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

describe('enqueueLieferschein', () => {
  it('legt das Foto mit Name und Typ ab', async () => {
    expect(await enqueueLieferschein('u1', foto('a.jpg'))).toBe('queued')
    const [p] = await pendingLieferscheine('u1')
    expect(p.filename).toBe('a.jpg')
    expect(p.mimeType).toBe('image/jpeg')
    expect(p.bytes.byteLength).toBe(64)
    expect(p.attempts).toBe(0)
  })

  it('zeigt jedem nur seine eigenen', async () => {
    await enqueueLieferschein('u1', foto())
    await enqueueLieferschein('u2', foto())
    expect(await pendingLieferscheine('u1')).toHaveLength(1)
  })

  it('lehnt zu grosse Dateien ab', async () => {
    const gross = { size: MAX_BYTES + 1, name: 'x.jpg', type: 'image/jpeg' } as File
    expect(await enqueueLieferschein('u1', gross)).toBe('too_large')
  })

  it('sagt, wenn der Puffer voll ist', async () => {
    for (let i = 0; i < MAX_PENDING; i++) await enqueueLieferschein('u1', foto())
    expect(await enqueueLieferschein('u1', foto())).toBe('full')
  })
})

describe('drainLieferscheinQueue', () => {
  it('sendet der Reihe nach und leert den Puffer', async () => {
    await enqueueLieferschein('u1', foto('a.jpg'))
    await enqueueLieferschein('u1', foto('b.jpg'))
    const upload = vi.fn().mockResolvedValue({})
    const res = await drainLieferscheinQueue('u1', upload)
    expect(res).toEqual({ sent: 2, dropped: 0, remaining: 0 })
    expect(upload.mock.calls.map(c => (c[0] as File).name)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('hält beim Netzfehler an und zählt den Versuch', async () => {
    await enqueueLieferschein('u1', foto('a.jpg'))
    await enqueueLieferschein('u1', foto('b.jpg'))
    const upload = vi.fn().mockRejectedValue(new ApiError(0, 'offline'))
    const res = await drainLieferscheinQueue('u1', upload)
    expect(res).toEqual({ sent: 0, dropped: 0, remaining: 2 })
    expect(upload).toHaveBeenCalledTimes(1)
    expect((await pendingLieferscheine('u1'))[0].attempts).toBe(1)
  })

  it('wirft nichts weg, wenn die Anmeldung abgelaufen ist', async () => {
    await enqueueLieferschein('u1', foto())
    const res = await drainLieferscheinQueue('u1', vi.fn().mockRejectedValue(new ApiError(401, 'x')))
    expect(res.remaining).toBe(1)
    expect((await pendingLieferscheine('u1'))[0].attempts).toBe(0)
  })

  it('verwirft, was der Server nie annimmt, und macht weiter', async () => {
    await enqueueLieferschein('u1', foto('kaputt.jpg'))
    await enqueueLieferschein('u1', foto('gut.jpg'))
    const upload = vi.fn()
      .mockRejectedValueOnce(new ApiError(400, 'not_an_image'))
      .mockResolvedValueOnce({})
    expect(await drainLieferscheinQueue('u1', upload)).toEqual({ sent: 1, dropped: 1, remaining: 0 })
  })

  it('gibt nach zu vielen Anläufen auf', async () => {
    await enqueueLieferschein('u1', foto())
    const fail = vi.fn().mockRejectedValue(new ApiError(503, 'x'))
    for (let i = 0; i < MAX_ATTEMPTS; i++) await drainLieferscheinQueue('u1', fail)
    const upload = vi.fn()
    expect(await drainLieferscheinQueue('u1', upload)).toEqual({ sent: 0, dropped: 1, remaining: 0 })
    expect(upload).not.toHaveBeenCalled()
  })

  it('sendet bei gleichzeitigem Aufruf nicht doppelt', async () => {
    await enqueueLieferschein('u1', foto())
    let release: () => void = () => {}
    const upload = vi.fn(() => new Promise<void>(r => { release = r }))
    const first = drainLieferscheinQueue('u1', upload)
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    const second = await drainLieferscheinQueue('u1', upload)
    expect(second.sent).toBe(0)
    release()
    expect((await first).sent).toBe(1)
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('lässt fremde Einträge liegen', async () => {
    await enqueueLieferschein('u2', foto())
    expect(await drainLieferscheinQueue('u1', vi.fn())).toEqual({ sent: 0, dropped: 0, remaining: 0 })
    expect(await pendingLieferscheine('u2')).toHaveLength(1)
  })
})

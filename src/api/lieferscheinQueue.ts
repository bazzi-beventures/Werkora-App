/**
 * Offline-Puffer für Lieferscheine — docs/specs/lieferschein-erfassung.md §3.4.
 *
 * Der Lieferschein kommt im Lager oder auf der Baustelle an, oft ohne Netz.
 * Die Kachel funktioniert trotzdem: das Foto geht in diesen Puffer und wird
 * gesendet, sobald wieder Netz da ist. Beim Leeren steht kein Mensch mehr
 * daneben, der ein Projekt antippt — der Lieferschein landet deshalb im
 * **Eingang** des Büros (mit den OCR-Vorschlägen), und der Fotograf kann ihn
 * unter «Meine Lieferscheine» selbst zuordnen. Zugeordnet wird nie ohne Tippen.
 *
 * Eigene Datenbank neben dem Foto-Puffer des Rapports (`photoQueue.ts`): ein
 * Lieferschein gehört zu keinem Rapport, und die beiden Puffer sollen sich
 * weder das Limit noch die Reihenfolge teilen. Dieselbe IndexedDB-Mechanik
 * ([idb.ts](./idb.ts)) und dieselbe Fehler-Entscheidung (`verdictFor`).
 * **Kein localStorage:** ein Handyfoto sprengte dessen ~5 MB.
 */
import { createIdbStore, ENV_SUFFIX } from './idb'
import { uploadLieferschein } from './lieferscheine'
import { verdictFor } from './photoQueue'

export const DB_NAME = `werkora-lieferscheine${ENV_SUFFIX}`
export const STORE = 'pending'

/** Mehr wartet niemand ab — und ein vollgelaufener Puffer soll es sagen, statt
 *  das Handy mit Fotos zu füllen, die nie ankommen. */
export const MAX_PENDING = 20

/** Serverseitiges Limit (`services/delivery_notes.MAX_UPLOAD_BYTES`). */
export const MAX_BYTES = 20 * 1024 * 1024

/** Nach so vielen erfolglosen Anläufen gilt ein Eintrag als nicht zustellbar. */
export const MAX_ATTEMPTS = 5

export interface PendingLieferschein {
  id: number
  /** Wem er gehört — am geteilten Werkhof-Tablet sendet ihn nur sein Fotograf. */
  userId: string
  /** ArrayBuffer statt Blob — iOS gab Blobs aus IndexedDB gelegentlich leer zurück. */
  bytes: ArrayBuffer
  mimeType: string
  filename: string
  recordedAt: string
  attempts: number
}

export type EnqueueResult = 'queued' | 'full' | 'too_large' | 'unavailable'

const { withStore } = createIdbStore(DB_NAME, STORE, { keyPath: 'id', autoIncrement: true })

export async function pendingLieferscheine(userId: string): Promise<PendingLieferschein[]> {
  const all = await withStore<PendingLieferschein[]>('readonly', [], (store, done) => {
    const req = store.getAll()
    req.onsuccess = () => done((req.result as PendingLieferschein[]) ?? [])
    req.onerror = () => done([])
  })
  return all.filter(p => p.userId === userId).sort((a, b) => a.id - b.id)
}

export async function enqueueLieferschein(userId: string, file: File): Promise<EnqueueResult> {
  if (file.size > MAX_BYTES) return 'too_large'
  if ((await pendingLieferscheine(userId)).length >= MAX_PENDING) return 'full'
  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  } catch {
    return 'unavailable'
  }
  return withStore<EnqueueResult>('readwrite', 'unavailable', (store, done) => {
    const req = store.add({
      userId,
      bytes,
      mimeType: file.type || 'image/jpeg',
      filename: file.name || 'lieferschein.jpg',
      recordedAt: new Date().toISOString(),
      attempts: 0,
    })
    req.onsuccess = () => done('queued')
    req.onerror = () => done('unavailable')
  })
}

async function remove(id: number): Promise<void> {
  await withStore<boolean>('readwrite', false, (store, done) => {
    const req = store.delete(id)
    req.onsuccess = () => done(true)
    req.onerror = () => done(false)
  })
}

async function bumpAttempts(p: PendingLieferschein): Promise<void> {
  await withStore<boolean>('readwrite', false, (store, done) => {
    const req = store.put({ ...p, attempts: p.attempts + 1 })
    req.onsuccess = () => done(true)
    req.onerror = () => done(false)
  })
}

export interface LieferscheinDrainResult {
  sent: number
  dropped: number
  remaining: number
}

let draining = false

/**
 * Sendet, was im Puffer liegt — der Reihe nach, angehalten beim ersten
 * Netzfehler (das nächste scheitert dann ohnehin genauso). Ein zweiter Aufruf,
 * während einer läuft, tut nichts: `online` und Screen-Mount kommen gern
 * gleichzeitig, und doppelt gesendet hiesse ein Lieferschein zweimal im Eingang.
 */
export async function drainLieferscheinQueue(
  userId: string,
  upload: (file: File) => Promise<unknown>,
): Promise<LieferscheinDrainResult> {
  if (draining) return { sent: 0, dropped: 0, remaining: (await pendingLieferscheine(userId)).length }
  draining = true
  let sent = 0
  let dropped = 0
  try {
    for (const p of await pendingLieferscheine(userId)) {
      if (p.attempts >= MAX_ATTEMPTS) {
        await remove(p.id)
        dropped++
        continue
      }
      try {
        await upload(new File([p.bytes], p.filename, { type: p.mimeType }))
        await remove(p.id)
        sent++
      } catch (err) {
        const verdict = verdictFor(err)
        if (verdict === 'drop') {
          await remove(p.id)
          dropped++
          continue
        }
        if (verdict === 'retry') await bumpAttempts(p)
        break
      }
    }
  } finally {
    draining = false
  }
  return { sent, dropped, remaining: (await pendingLieferscheine(userId)).length }
}

/** Der Netz-Moment (App-Start, `online`, Screen offen): Wartendes in den Eingang. */
export function sendeWartendeLieferscheine(userId: string): Promise<LieferscheinDrainResult> {
  return drainLieferscheinQueue(userId, f => uploadLieferschein(f, f.name))
}

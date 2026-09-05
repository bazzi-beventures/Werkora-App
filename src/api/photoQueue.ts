/**
 * Offline-Puffer für Rapport-Fotos — Ausbaustufe 2 aus
 * [docs/specs/offline-modus.md](../../../docs/specs/offline-modus.md) §6.
 *
 * Vorher war der Foto-Knopf offline schlicht gesperrt (§4.1). Das verhinderte
 * den stillen Verlust, kostete den Monteur aber genau die Aufnahme, für die er
 * auf dem Dach steht: Wer im Funkloch arbeitet, fotografiert den Schaden JETZT
 * — eine Stunde später ist die Fassade zu, das Gerüst weg. Also puffern und
 * hochladen, sobald es wieder geht.
 *
 * **IndexedDB, nicht localStorage:** ein Handyfoto sind 2–5 MB, localStorage
 * fasst rund 5 MB für die GANZE App (und nur Strings — Base64 bläht nochmal um
 * ein Drittel auf). Der erste Puffer-Versuch dort hätte den Entwurf, das
 * Lesepaket und die Stempel-Queue mitgerissen.
 *
 * **Kein `caches`:** Cache Storage ist für wiederbeschaffbare HTTP-Antworten
 * gedacht und wird unter Speicherdruck früher geräumt. Ein noch nicht
 * hochgeladenes Foto ist unwiederbringlich.
 *
 * Jede Funktion hier ist best-effort: Private Mode, gesperrter Storage oder ein
 * Browser ohne IndexedDB dürfen die App nie zum Absturz bringen — sie liefern
 * dann `null`/`[]`, und der Aufrufer sagt dem Monteur ehrlich, dass es nicht
 * ging (statt ein Foto zu versprechen, das nirgends liegt).
 */
import { ApiError, isNetworkError } from './client'
import { ChatResponse } from './chat'

// Env-getrennt wie die localStorage-Keys (storageKeys.ts): Prod und Staging
// liegen auf derselben Origin und teilen sich sonst die Datenbank.
const s = import.meta.env.VITE_ENV_SUFFIX ?? ''

export const DB_NAME = `werkora-photos${s}`
export const STORE = 'pending'
const DB_VERSION = 1

/** Serverseitiges Limit pro Rapport (`_MAX_PHOTOS` in pwa_chat_service.py).
 *  Mehr zu puffern hiesse, dem Monteur Fotos zu versprechen, die der Server
 *  beim Hochladen abweist. */
export const MAX_PENDING_PHOTOS = 10

/** Nach so vielen erfolglosen Anläufen gilt ein Foto als nicht zustellbar.
 *  Gleiche Begründung wie bei der Zeit-Queue (zeitQueue.ts): ohne Deckel
 *  wächst die Warteschlange bei einem CORS-/Origin-Problem ewig, und niemand
 *  merkt es. */
export const MAX_DRAIN_ATTEMPTS = 5

/** Serverseitiges Grössenlimit (`/pwa/chat/photo`). Schon beim Puffern prüfen:
 *  ein zu grosses Foto würde sonst tagelang mitwandern und am Ende doch
 *  abgewiesen. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024

export interface PendingPhoto {
  /** Auto-Increment — zugleich die Reihenfolge, in der fotografiert wurde. */
  id: number
  /** Wem das Foto gehört. Auf dem geteilten Werkhof-Tablet darf der nächste
   *  Monteur weder das Foto sehen noch es in SEINEN Rapport hochladen. */
  userId: string
  /** Die Bilddaten als ArrayBuffer, NICHT als Blob: einen Blob in IndexedDB zu
   *  legen ist zwar erlaubt, war auf iOS aber lange fehlerhaft (Safari gab
   *  gelegentlich leere Blobs zurück) — und die Monteure arbeiten auf iPhones.
   *  Ein ArrayBuffer klont überall zuverlässig. */
  bytes: ArrayBuffer
  mimeType: string
  filename: string
  /** Zeitpunkt der Aufnahme (ISO). Steht später im Hinweis «Foto von 16:42». */
  recordedAt: string
  attempts: number
}

export type EnqueueResult = 'queued' | 'full' | 'too_large' | 'unavailable'

function openDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) { resolve(null); return }
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
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

/** Führt eine Transaktion aus und räumt die Verbindung wieder ab. Fehler werden
 *  zu `fallback` — der Aufrufer bekommt nie eine Exception. */
async function withStore<T>(
  mode: IDBTransactionMode,
  fallback: T,
  run: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await openDb()
  if (!db) return fallback
  return new Promise<T>(resolve => {
    let settled = false
    const finish = (value: T) => {
      if (settled) return
      settled = true
      resolve(value)
      try { db.close() } catch { /* schon zu */ }
    }
    try {
      const tx = db.transaction(STORE, mode)
      tx.onerror = () => finish(fallback)
      tx.onabort = () => finish(fallback)
      run(tx.objectStore(STORE), finish)
    } catch {
      finish(fallback)
    }
  })
}

/** Alle wartenden Fotos dieses Nutzers, älteste zuerst. */
export async function pendingPhotos(userId: string): Promise<PendingPhoto[]> {
  return withStore<PendingPhoto[]>('readonly', [], (store, done) => {
    const req = store.getAll()
    req.onsuccess = () => {
      const all = (req.result || []) as PendingPhoto[]
      done(all.filter(p => p.userId === userId).sort((a, b) => a.id - b.id))
    }
    req.onerror = () => done([])
  })
}

export async function countPending(userId: string): Promise<number> {
  return (await pendingPhotos(userId)).length
}

/**
 * Legt ein Foto in den Puffer. Der Rückgabewert ist das, was dem Monteur gesagt
 * werden muss — «gemerkt» darf nur stehen, wenn es wirklich liegt.
 */
export async function enqueuePhoto(userId: string, file: File): Promise<EnqueueResult> {
  if (file.size > MAX_PHOTO_BYTES) return 'too_large'
  if (await countPending(userId) >= MAX_PENDING_PHOTOS) return 'full'

  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  } catch {
    return 'unavailable'
  }

  return withStore<EnqueueResult>('readwrite', 'unavailable', (store, done) => {
    const entry = {
      userId,
      bytes,
      mimeType: file.type || 'image/jpeg',
      filename: file.name || 'photo.jpg',
      recordedAt: new Date().toISOString(),
      attempts: 0,
    }
    const req = store.add(entry)
    req.onsuccess = () => done('queued')
    req.onerror = () => done('unavailable')
  })
}

async function removePhoto(id: number): Promise<void> {
  await withStore<boolean>('readwrite', false, (store, done) => {
    const req = store.delete(id)
    req.onsuccess = () => done(true)
    req.onerror = () => done(false)
  })
}

async function bumpAttempts(photo: PendingPhoto): Promise<void> {
  await withStore<boolean>('readwrite', false, (store, done) => {
    const req = store.put({ ...photo, attempts: photo.attempts + 1 })
    req.onsuccess = () => done(true)
    req.onerror = () => done(false)
  })
}

/**
 * Wie auf einen fehlgeschlagenen Upload zu reagieren ist.
 *
 * Bewusst als reine Funktion: die Entscheidung «nochmal / wegwerfen / anhalten»
 * ist die Stelle, an der eine Foto-Queue entweder Daten verliert oder ewig
 * hängt — sie gehört einzeln getestet, nicht in einen IndexedDB-Test verwoben.
 */
export type DrainVerdict = 'retry' | 'drop' | 'abort'

export function verdictFor(err: unknown): DrainVerdict {
  // Kein Durchkommen (auch «Empfang, aber nichts geht»): liegen lassen und beim
  // nächsten Mal erneut. Der Versuchs-Deckel fängt den Dauerfehler ab.
  if (isNetworkError(err)) return 'retry'
  if (err instanceof ApiError) {
    // Abgelaufene Session: nicht das Foto ist kaputt, sondern die Anmeldung.
    // Anhalten, damit nichts verloren geht, während der Login erneuert wird.
    if (err.status === 401 || err.status === 403) return 'abort'
    // Zu viele Uploads in kurzer Folge — der Server drosselt bewusst.
    if (err.status === 429) return 'abort'
    // Serverfehler sind vorübergehend, 4xx sonst (zu gross, falscher Typ) nicht:
    // ein solches Foto käme auch beim hundertsten Versuch nicht durch.
    if (err.status >= 500) return 'retry'
    return 'drop'
  }
  return 'retry'
}

export interface DrainResult {
  /** Erfolgreich hochgeladen. */
  uploaded: PendingPhoto[]
  /** Dauerhaft nicht zustellbar und deshalb entfernt — davon MUSS der Monteur
   *  erfahren, sonst wartet er auf ein Foto, das nie ankommt. */
  dropped: PendingPhoto[]
  /** Was noch wartet. */
  remaining: number
}

/**
 * Arbeitet den Puffer der Reihe nach ab (älteste Aufnahme zuerst).
 *
 * Sequenziell, nicht parallel: der Server nimmt die Fotos in der Reihenfolge
 * des Eingangs in den Rapport-Puffer auf, und sein Rate-Limit (5 pro 30 s)
 * würde einen Parallel-Schwung ohnehin abweisen.
 */
export async function drainPhotoQueue(
  userId: string,
  upload: (file: File) => Promise<ChatResponse>,
): Promise<DrainResult> {
  const queue = await pendingPhotos(userId)
  const uploaded: PendingPhoto[] = []
  const dropped: PendingPhoto[] = []

  for (const photo of queue) {
    if (photo.attempts >= MAX_DRAIN_ATTEMPTS) {
      await removePhoto(photo.id)
      dropped.push(photo)
      continue
    }
    const file = new File([photo.bytes], photo.filename, { type: photo.mimeType })
    try {
      await upload(file)
      await removePhoto(photo.id)
      uploaded.push(photo)
    } catch (err) {
      const verdict = verdictFor(err)
      if (verdict === 'drop') {
        await removePhoto(photo.id)
        dropped.push(photo)
        continue
      }
      // Nur ein echter Fehlversuch zählt gegen den Deckel. Bei 'abort'
      // (abgelaufene Sitzung, Drosselung) liegt es nicht am Foto — würde das
      // mitzählen, verlöre ein Monteur seine Aufnahmen, weil er sich neu
      // anmelden musste.
      if (verdict === 'retry') await bumpAttempts(photo)
      // Anhalten statt weiterprobieren: die Reihenfolge im Rapport soll der
      // Aufnahmereihenfolge folgen, und bei fehlendem Netz scheitert das
      // nächste Foto ohnehin genauso.
      break
    }
  }

  return { uploaded, dropped, remaining: (await pendingPhotos(userId)).length }
}

/** Uhrzeit der Aufnahme für den Hinweis («Foto von 16:42»). */
export function recordedAtLabel(iso: string): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return ''
  return new Date(ts).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
}

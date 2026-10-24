import type { TenantInfo, UserInfo } from './auth'

/**
 * Schneller Start aus dem letzten Stand (docs/specs/pwa-neuladen.md §3.5).
 *
 * Beim Kaltstart wartete die App auf `/pwa/me` UND das Branding, bevor sie
 * irgendetwas zeigte — auf der Baustelle mit einem Balken Netz minutenlang
 * «Laden…». Jetzt merkt sie sich beides je Konto und rendert daraus, wenn die
 * Antwort nicht binnen `START_TIMEOUT_MS` da ist; die echte Antwort ersetzt den
 * Stand im Hintergrund.
 *
 * Der Snapshot steuert NUR, was gezeichnet wird. Berechtigungen prüft weiter
 * der Server bei jedem Aufruf; meldet `/pwa/me` dann 401, geht es zum Login
 * wie bisher.
 *
 * Ein Key je Konto: `start-snapshot:<authorizedUserId>` — am Werkhof-Tablet
 * sieht der nächste Monteur nie den Stand des vorherigen (geladen wird nur der
 * Snapshot des gespeicherten Kontos, und `logout` räumt alle weg).
 */

export const START_SNAPSHOT_PREFIX = 'start-snapshot:'
export const START_TIMEOUT_MS = 5000

export interface StartSnapshot {
  me: UserInfo | null
  branding: TenantInfo | null
  savedAt: string
}

const key = (userId: string) => `${START_SNAPSHOT_PREFIX}${userId}`

export function loadStartSnapshot(userId: string | null | undefined): StartSnapshot | null {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StartSnapshot>
    // Ein /pwa/me eines anderen Kontos unter diesem Key wäre ein Fehler im
    // Schreiben — dann lieber kein Snapshot als der falsche.
    const me = parsed.me && parsed.me.authorized_user_id === userId ? parsed.me : null
    return { me, branding: parsed.branding ?? null, savedAt: parsed.savedAt ?? '' }
  } catch {
    return null
  }
}

function write(userId: string, patch: Partial<StartSnapshot>): void {
  try {
    const current = loadStartSnapshot(userId) ?? { me: null, branding: null, savedAt: '' }
    const next: StartSnapshot = { ...current, ...patch, savedAt: new Date().toISOString() }
    localStorage.setItem(key(userId), JSON.stringify(next))
  } catch {
    // Speicher voll oder gesperrt: dann startet die App eben wie früher.
  }
}

export function saveMeSnapshot(me: UserInfo): void {
  if (me?.authorized_user_id) write(me.authorized_user_id, { me })
}

export function saveBrandingSnapshot(userId: string | null | undefined, branding: TenantInfo): void {
  if (userId) write(userId, { branding })
}

export function clearStartSnapshots(): void {
  try {
    const weg: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(START_SNAPSHOT_PREFIX)) weg.push(k)
    }
    for (const k of weg) localStorage.removeItem(k)
  } catch {
    // nichts zu tun
  }
}

/** Wartet höchstens `ms` auf `promise`. `{ timedOut: true }` heisst: die Antwort
 *  kommt vielleicht noch — `promise` läuft weiter und kann nachgereicht werden. */
export function withTimeout<T>(promise: Promise<T>, ms: number):
  Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), ms)
    promise.then(
      value => { clearTimeout(timer); resolve({ timedOut: false, value }) },
      err => { clearTimeout(timer); reject(err) },
    )
  })
}

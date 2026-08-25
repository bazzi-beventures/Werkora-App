import { apiFetch } from './client'

export type PushState = 'subscribed' | 'unsubscribed' | 'denied' | 'unsupported'

// VAPID-Public-Key (base64url) → ArrayBuffer, wie von pushManager.subscribe erwartet.
function urlBase64ToBytes(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buf = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return buf
}

// Byte-Vergleich zweier applicationServerKeys (aktueller vs. der, mit dem die
// bestehende Subscription erstellt wurde). null/undefined gilt als "passt nicht".
function sameKey(a: ArrayBuffer | null | undefined, b: ArrayBuffer): boolean {
  if (!a) return false
  const av = new Uint8Array(a)
  const bv = new Uint8Array(b)
  if (av.length !== bv.length) return false
  for (let i = 0; i < av.length; i++) {
    if (av[i] !== bv[i]) return false
  }
  return true
}

export function pushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'subscribed' : 'unsubscribed'
  } catch {
    return 'unsupported'
  }
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) {
    throw new Error('Push wird auf diesem Gerät nicht unterstützt.')
  }
  const { public_key, enabled } = (await apiFetch('/pwa/push/public-key')) as {
    public_key: string
    enabled: boolean
  }
  if (!enabled || !public_key) {
    throw new Error('Push ist serverseitig nicht konfiguriert.')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Benachrichtigungen wurden nicht erlaubt.')
  }
  const reg = await navigator.serviceWorker.ready
  const wantedKey = urlBase64ToBytes(public_key)
  let sub = await reg.pushManager.getSubscription()

  // Nach einem VAPID-Key-Wechsel ist eine bestehende Subscription noch an den
  // alten Key gebunden — der Push-Dienst lehnt den Versand dann dauerhaft mit 403
  // ab. In dem Fall die alte Subscription serverseitig + lokal verwerfen und mit
  // dem aktuellen Key frisch registrieren.
  if (sub && !sameKey(sub.options.applicationServerKey, wantedKey)) {
    await apiFetch('/pwa/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
    await sub.unsubscribe().catch(() => {})
    sub = null
  }

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: wantedKey,
    })
  }
  const json = sub.toJSON()
  await apiFetch('/pwa/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
  })
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await apiFetch('/pwa/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {})
  await sub.unsubscribe().catch(() => {})
}

export type TestPushResult = {
  /** Anzahl Geräte, die die Test-Push JETZT bekommen haben. */
  sent: number
  /**
   * true = zurückgehalten, weil der Nutzer nicht eingestempelt ist. Push geht
   * beim nächsten Einstempeln raus (Einstempel-Regel, services/web_push_service.py).
   * Wer das ignoriert und nur `sent` prüft, zeigt bei 0 fälschlich "geht nicht".
   */
  queued: boolean
}

export async function sendTestPush(): Promise<TestPushResult> {
  const res = (await apiFetch('/pwa/push/test', { method: 'POST' })) as TestPushResult
  return { sent: res.sent ?? 0, queued: Boolean(res.queued) }
}

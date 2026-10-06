import { useEffect, useState } from 'react'
import {
  disablePush,
  enablePush,
  getPushState,
  sendTestPush,
  type PushState,
} from '../api/push'

/**
 * Push-Empfang auf diesem Gerät — Betreiber-Seite (docs/specs/support-antwort.md §13).
 *
 * Bis 2026-10 kam die Push zu einer neuen Support-Meldung in der Werkora-App
 * an, nicht hier, wo der Eingang liegt. Jetzt meldet sich das Gerät hier mit
 * `app="admin"` an; der Server schickt dann hierher und lässt die Werkora-App
 * aus (sie bleibt nur Rückfallebene, solange hier kein Gerät angemeldet ist).
 *
 * Bewusst eine schmale Zeile im Support-Eingang und kein Einstellungs-Screen:
 * es gibt genau eine Sorte Push auf dieser Seite, und man sucht den Schalter
 * dort, wo die Meldungen stehen.
 */
export default function AdminPushToggle() {
  const [state, setState] = useState<PushState | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    let aktiv = true
    getPushState().then(s => { if (aktiv) setState(s) }).catch(() => {
      if (aktiv) setState('unsupported')
    })
    return () => { aktiv = false }
  }, [])

  async function aktivieren() {
    setBusy(true)
    setNote('')
    try {
      await enablePush('admin')
      setState('subscribed')
      setNote('Aktiv — neue Meldungen kommen auf dieses Gerät.')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Aktivieren fehlgeschlagen.')
      setState(await getPushState().catch(() => 'unsupported' as const))
    } finally {
      setBusy(false)
    }
  }

  async function testen() {
    setBusy(true)
    setNote('')
    try {
      const res = await sendTestPush('admin')
      setNote(res.sent > 0
        ? 'Test gesendet.'
        : 'Kein Gerät erreicht — bitte einmal aus- und wieder einschalten.')
    } catch {
      setNote('Test fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  async function ausschalten() {
    setBusy(true)
    setNote('')
    try {
      await disablePush()
      setState('unsubscribed')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return null

  return (
    <div className="support-push" role="group" aria-label="Push auf diesem Gerät">
      {state === 'unsupported' && (
        <span>Dieser Browser kann keine Push empfangen — es bleibt bei der Mail.</span>
      )}
      {state === 'denied' && (
        <span>Benachrichtigungen sind für diese Seite im Browser blockiert.</span>
      )}
      {state === 'unsubscribed' && (
        <>
          <span>Neue Meldungen als Push auf diesem Gerät?</span>
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                  disabled={busy} onClick={() => void aktivieren()}>
            Push aktivieren
          </button>
        </>
      )}
      {state === 'subscribed' && (
        <>
          <span>🔔 Push für neue Meldungen ist auf diesem Gerät aktiv.</span>
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                  disabled={busy} onClick={() => void testen()}>
            Test
          </button>
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                  disabled={busy} onClick={() => void ausschalten()}>
            Ausschalten
          </button>
        </>
      )}
      {note && <span role="status">{note}</span>}
    </div>
  )
}

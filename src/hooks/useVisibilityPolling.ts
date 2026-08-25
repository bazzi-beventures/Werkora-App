import { useEffect, useRef } from 'react'

/**
 * Ruft `onPoll` einmal sofort auf und danach alle `intervalMs` Millisekunden.
 *
 * Damit lassen sich Admin-Ansichten "live" halten, ohne dass der Nutzer F5
 * drücken muss (z. B. wer gerade eingestempelt ist). Das Muster entspricht dem
 * 30-Sekunden-Poll in HomeScreen, nur als wiederverwendbarer Hook.
 *
 * Ressourcenschonend:
 *  - Pausiert, solange der Tab im Hintergrund liegt (visibilitychange), und
 *    frischt sofort auf, sobald er wieder sichtbar wird.
 *  - Pollt nicht offline; legt sofort nach, sobald wieder online.
 *  - Überspringt einen Tick, falls der vorige Aufruf noch läuft (kein Stau).
 *
 * `onPoll` erhält `{ background }`:
 *  - `false` beim allerersten Aufruf und beim Auffrischen nach Sichtbar-Werden
 *    → ruhig den normalen Lade-Spinner zeigen.
 *  - `true` bei den getakteten Hintergrund-Aktualisierungen → KEINEN Voll-Spinner
 *    zeigen und bei Fehlern die alten Daten stehen lassen, sonst flackert die UI.
 *
 * `onPoll` darf bei jedem Render eine neue Funktion sein (z. B. Closure über
 * aktuelle Filter); es wird immer die neueste Version mit den aktuellen Werten
 * aufgerufen, ohne dass der Intervall neu startet.
 */
export function useVisibilityPolling(
  onPoll: (ctx: { background: boolean }) => void | Promise<void>,
  intervalMs: number,
) {
  const savedCallback = useRef(onPoll)
  // Die Zuweisung gehoert in einen Effekt, nicht in den Render-Rumpf: eine Ref
  // waehrend des Renderns zu beschreiben ist ein Seiteneffekt, den React unter
  // StrictMode/Concurrent doppelt ausfuehren darf (react-hooks/refs). Fuer einen
  // Intervall-Poller ist der Effekt-Zeitpunkt aequivalent — der Tick laeuft
  // ohnehin erst nach dem Commit, und bis dahin steht die neue Funktion.
  useEffect(() => {
    savedCallback.current = onPoll
  })

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function tick(background: boolean) {
      if (cancelled || inFlight) return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      if (document.visibilityState === 'hidden') return
      inFlight = true
      try {
        await savedCallback.current({ background })
      } finally {
        inFlight = false
      }
    }

    function start() {
      if (timer === null) timer = setInterval(() => { void tick(true) }, intervalMs)
    }
    function stop() {
      if (timer !== null) { clearInterval(timer); timer = null }
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        void tick(true)  // beim Zurückkehren sofort auffrischen
        start()
      } else {
        stop()
      }
    }
    function handleOnline() { void tick(true) }

    void tick(false)  // initialer Load (mit Spinner)
    start()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)

    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
    }
  }, [intervalMs])
}

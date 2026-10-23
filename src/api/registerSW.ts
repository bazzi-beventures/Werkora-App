import { registerSW } from 'virtual:pwa-register'

/** Mindestabstand zwischen zwei Update-Prüfungen beim Zurückkehren in die App
 *  (docs/specs/pwa-neuladen.md §3.2). Vorher prüfte JEDE Rückkehr — auch die aus
 *  Kamera oder Dateiauswahl mitten in einem Rapport —, und ein gefundenes
 *  Update lud die Seite sofort neu. */
export const UPDATE_PRUEF_ABSTAND_MS = 15 * 60 * 1000

/** Ist wieder eine Prüfung fällig? Rein, damit die Drossel ohne Service Worker
 *  testbar ist. `zuletzt` = Zeitpunkt der letzten Prüfung, `null` = noch nie. */
export function updatePruefungFaellig(jetzt: number, zuletzt: number | null,
                                      abstandMs = UPDATE_PRUEF_ABSTAND_MS): boolean {
  return zuletzt === null || jetzt - zuletzt >= abstandMs
}

/**
 * Registriert den Service Worker explizit und erzwingt bei der Rueckkehr in
 * die App eine Update-Pruefung (hoechstens alle 15 Minuten).
 *
 * Hintergrund (die "neue Deploys erst nach Cache-Reset sichtbar"-Falle):
 * Eine installierte PWA prueft von sich aus nur beim ~24h-Browser-Heartbeat auf
 * ein neues sw.js. Ausserdem liegt index.html im Workbox-Precache, wodurch der
 * Boot-Kill-Switch (liest app-build-id aus dem HTML) die alte, gecachte ID sieht
 * und nie feuert. `registration.update()` bei `visibilitychange` (und beim
 * Online-Gehen) laesst jede Rueckkehr in den Vordergrund aktiv nachpruefen.
 *
 * registerType ist 'autoUpdate' (siehe vite.config.ts): findet die Pruefung ein
 * neues sw.js, aktiviert Workbox es (skipWaiting) und vite-plugin-pwa laedt die
 * Seite selbst neu. Kein manuelles Reload noetig. Weil dieser Reload nicht
 * fragt, ist die Prüfung beim Zurückkehren gedrosselt (UPDATE_PRUEF_ABSTAND_MS); dass er
 * gar nicht mehr mitten in der Arbeit kommt, ist Schritt 4 der Spec
 * docs/specs/pwa-neuladen.md (`registerType: 'prompt'`).
 */
export function registerPwaUpdates() {
  if (!('serviceWorker' in navigator)) return

  registerSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, registration) {
      if (!registration) return

      // Die Registrierung selbst hat eben gerade geprüft.
      let zuletzt: number | null = Date.now()

      const checkForUpdate = (gedrosselt: boolean) => {
        // Nur pruefen, wenn die App im Vordergrund und online ist — sonst
        // laeuft update() ins Leere bzw. schlaegt offline fehl.
        if (document.visibilityState !== 'visible' || !navigator.onLine) return
        const jetzt = Date.now()
        if (gedrosselt && !updatePruefungFaellig(jetzt, zuletzt)) return
        zuletzt = jetzt
        void registration.update()
      }

      // Rückkehr in die App (App-Wechsel, Bildschirm-Entsperren) prüft —
      // höchstens alle 15 Minuten, siehe UPDATE_PRUEF_ABSTAND_MS.
      document.addEventListener('visibilitychange', () => checkForUpdate(true))
      // Wieder online: ungedrosselt, wer offline war, hat womöglich ein Update verpasst.
      window.addEventListener('online', () => checkForUpdate(false))

      // Backstop fuer lange im Vordergrund offene Tabs (z. B. Admin-Dashboard),
      // bei denen visibilitychange nie feuert.
      setInterval(() => checkForUpdate(false), 60 * 60 * 1000)
    },
  })
}

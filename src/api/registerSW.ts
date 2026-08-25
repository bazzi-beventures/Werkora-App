import { registerSW } from 'virtual:pwa-register'

/**
 * Registriert den Service Worker explizit und erzwingt bei jeder Rueckkehr in
 * die App eine Update-Pruefung.
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
 * Seite selbst neu. Kein manuelles Reload noetig.
 */
export function registerPwaUpdates() {
  if (!('serviceWorker' in navigator)) return

  registerSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, registration) {
      if (!registration) return

      const checkForUpdate = () => {
        // Nur pruefen, wenn die App im Vordergrund und online ist — sonst
        // laeuft update() ins Leere bzw. schlaegt offline fehl.
        if (document.visibilityState === 'visible' && navigator.onLine) {
          void registration.update()
        }
      }

      // Jede Rueckkehr in die App (App-Wechsel, Bildschirm-Entsperren) prueft.
      document.addEventListener('visibilitychange', checkForUpdate)
      window.addEventListener('online', checkForUpdate)

      // Backstop fuer lange im Vordergrund offene Tabs (z. B. Admin-Dashboard),
      // bei denen visibilitychange nie feuert.
      setInterval(checkForUpdate, 60 * 60 * 1000)
    },
  })
}

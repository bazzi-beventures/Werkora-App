// Web-Push-Handler für den Service Worker der Betreiber-Seite (admin.werkora.ch).
// Wird vom generierten Workbox-SW via importScripts geladen
// (siehe vite.config.ts → workbox.importScripts, IS_ADMIN).
//
// Eigener Handler statt Weiche in push-sw.js (docs/specs/support-antwort.md §13,
// P3): hier kommen nur die Support-Pushes an, und ein Klick soll die Meldung
// öffnen — nicht ein Banner zeigen wie in der Mandanten-App.
//
// Diese Datei MUSS im Repo liegen: fehlt sie, scheitert importScripts beim
// Installieren, der Service Worker der Seite wird nie aktiv,
// `navigator.serviceWorker.ready` löst nie auf — und der Push-Schalter im
// Support-Eingang erscheint gar nicht erst. So geschehen bis 2026-10-07, weil
// `*.js` in .gitignore die Datei verschluckt hatte; der Server schickte die
// Push dann mangels Admin-Gerät auf die Rückfallebene, die Werkora-App.

// Nur Pfade auf der eigenen Origin, und nur Hash-Routen: eine Adresse aus
// einer Nachricht darf die Seite nie verlassen.
function safePath(url) {
  return typeof url === 'string' && url.startsWith('/#/') ? url : '/'
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = {}
  }
  const url = safePath(data.url)
  event.waitUntil(
    self.registration.showNotification(data.title || 'Werkora Admin', {
      body: data.body || '',
      icon: '/icons/admin/icon-192.png',
      // Android zeichnet das Badge nur aus dem Alphakanal — ein deckendes
      // Symbol wird zum weissen Kästchen (scripts/make_badge_icon.py).
      badge: '/icons/badge-96.png',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = safePath(event.notification.data && event.notification.data.url)
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if ('focus' in w) {
          await w.focus()
          // adminSite/main.tsx übernimmt daraus nur den Hash.
          w.postMessage({ type: 'admin-push-open', url })
          return
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url)
      }
    })(),
  )
})

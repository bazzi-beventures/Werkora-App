// Web-Push-Handler für den Service Worker.
// Wird vom generierten Workbox-SW via importScripts geladen
// (siehe vite.config.ts → workbox.importScripts).

// Schickt eine Nachricht an alle offenen App-Fenster, damit die App ein
// In-App-Banner anzeigen kann (zusätzlich zur OS-Benachrichtigung).
async function notifyClients(payload) {
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const w of wins) {
    w.postMessage({ type: 'push', ...payload })
  }
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = {}
  }
  const payload = {
    title: data.title || 'Bau-App',
    body: data.body || '',
    url: data.url || '/',
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: payload.url },
      })
      // App offen? → Banner sofort anzeigen.
      await notifyClients(payload)
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const payload = {
    title: event.notification.title || 'Mitteilung',
    body: event.notification.body || '',
    url: (event.notification.data && event.notification.data.url) || '/',
  }
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if ('focus' in w) {
          await w.focus()
          w.postMessage({ type: 'push', ...payload })
          return
        }
      }
      // Kein offenes Fenster → neues öffnen, Nachricht via URL-Hash mitgeben,
      // damit die App sie beim Start als Banner zeigen kann.
      if (self.clients.openWindow) {
        const encoded = encodeURIComponent(JSON.stringify(payload))
        await self.clients.openWindow(`/#notif=${encoded}`)
      }
    })(),
  )
})

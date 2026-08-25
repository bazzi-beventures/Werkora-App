// Der Service-Worker cached GET-Antworten unter /pwa/ (Workbox runtimeCaching,
// cacheName 'api-cache', NetworkFirst — siehe vite.config.ts). Dieser Cache
// hängt am GERÄT, nicht an der Session: ohne Löschen beim Logout/Login würde
// auf einem geteilten Gerät (Werkhof-Tablet) der nächste Nutzer offline die
// gecachten Antworten des Vorgängers serviert bekommen — inklusive /pwa/me
// (Identität) und Lohn-/HR-Daten.
//
// Muss mit dem cacheName in vite.config.ts übereinstimmen.
const API_CACHE_NAME = 'api-cache'

/** Löscht den SW-API-Cache. Best-effort: darf Logout/Login nie blockieren. */
export async function clearApiCache(): Promise<void> {
  try {
    if ('caches' in window) await caches.delete(API_CACHE_NAME)
  } catch {
    // z.B. Private Mode ohne Cache-API — bewusst ignorieren
  }
}

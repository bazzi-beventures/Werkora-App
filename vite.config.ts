/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createHash } from 'node:crypto'

// Custom-Domain-Setup → App auf Root. Drei Ziele, jedes mit eigener Domain und
// eigenem VITE_API_URL, gebaut im jeweiligen Pages-Repo:
//   app.werkora.ch          (Repo Werkora-App)     — Prod, neu
//   app.beventures.ch       (Repo Bau-App)         — Prod, alt; laeuft bis zur
//                                                    Abschaltung der alten Origin
//   app-staging.beventures.ch (Repo Bau-App-Staging)
// Falls je wieder ein Build ohne Custom Domain gefahren wird, --base im CI-Workflow setzen.
const BASE_PATH = '/'

// Build-ID wird beim Build injiziert (index.html Platzhalter __BUILD_ID__).
// Dient als Nuclear-Kill-Switch: Wenn localStorage eine andere ID hält als
// das frisch geladene HTML, wird SW + Cache hart zurückgesetzt.
const BUILD_ID = new Date().toISOString()

// Inline Kill-Switch — wird inline in index.html gerendert. Pfad-unabhängig
// (kein /Bau-App/-Prefix-Problem) und mit SHA-256-Hash in CSP whitelisted.
// Bewusst KEINE Referenz auf das __BUILD_ID__-Token, damit /g-Substitution den
// Skript-Body nicht verändert und der CSP-Hash stabil bleibt.
const BOOT_KILL_SWITCH = `(function(){try{var m=document.querySelector('meta[name="app-build-id"]');var c=m&&m.getAttribute('content');if(!c||c.indexOf('_'+'_')===0)return;var K='app_build_id';var l=localStorage.getItem(K);if(l===c)return;localStorage.setItem(K,c);if(l!==null&&'caches'in window){caches.keys().then(function(n){n.forEach(function(x){caches.delete(x);});});}}catch(e){}})();`

// Zurück-Wächter. Muss INLINE laufen und nicht im Bundle: App.tsx setzt seinen
// Wächter-Eintrag erst in einem Effekt, also erst wenn ~2 MB JS geladen, geparst
// und gemountet sind. Auf dem Handy sind das Sekunden — und genau während des
// «Laden…»-Screens drückt ein ungeduldiger Monteur Zurück. Ohne Eintrag im
// Verlauf verlässt dieser Druck die App. Nachgemessen mit Playwright: vor dem
// Mount (history.length 3) rausgeflogen, nach dem Mount (5) gehalten.
//
// `location.href` inklusive Hash, nicht pathname+search: eine per
// Benachrichtigung geöffnete App liest ihre Nachricht aus `#notif=…`. Ein
// hash-loser Eintrag würde sie verschlucken.
//
// `werkoraBackGuard(false)` schaltet den Listener ab, sobald App.tsx seinen
// eigenen registriert hat — sonst pusht jeder Zurück-Druck zwei Einträge.
// Eigene IIFE, weil der Kill-Switch oben mehrere frühe `return`s hat.
const BOOT_BACK_GUARD = `(function(){try{history.pushState(null,'',location.href);var a=1;window.addEventListener('popstate',function(){if(a)history.pushState(null,'',location.href);});window.werkoraBackGuard=function(v){a=v?1:0;};}catch(e){}})();`

const BOOT_SCRIPT_BODY = BOOT_KILL_SWITCH + BOOT_BACK_GUARD
const BOOT_SCRIPT_HTML = `<script>${BOOT_SCRIPT_BODY}</script>`
const BOOT_SCRIPT_HASH = createHash('sha256').update(BOOT_SCRIPT_BODY).digest('base64')

// Strikte CSP nur im Production-Build — in Dev braucht Vite-HMR Inline-Scripts
// und 'unsafe-eval'. script-src whitelistet nur 'self' + den SHA-256-Hash des
// Inline-Boot-Skripts. Fonts sind selbst gehostet (src/fonts.css, Datenschutz-
// Spec M1) — die Google-Hosts stehen bewusst NICHT mehr in style-src/font-src,
// damit ein wieder eingeschleppter fonts.googleapis.com-Import im Prod-Build
// blockiert wird statt still IPs an Google zu senden.
// frame-ancestors wird via X-Frame-Options im Backend gesetzt — im <meta>-Tag
// wird die Direktive vom Browser ignoriert.
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-${BOOT_SCRIPT_HASH}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; base-uri 'self'; form-action 'self'; object-src 'none'" />`

export default defineConfig(({ command }) => ({
  base: BASE_PATH,
  plugins: [
    {
      name: 'inject-build-meta',
      transformIndexHtml(html) {
        return html
          .replace(/__BUILD_ID__/g, BUILD_ID)
          .replace(/__CSP_META__/g, command === 'build' ? CSP_META : '')
          .replace(/__BOOT_SCRIPT__/g, BOOT_SCRIPT_HTML)
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registrierung passiert explizit in src/api/registerSW.ts (nicht via
      // auto-injiziertem Script), damit wir bei jeder Rueckkehr in die App per
      // r.update() aktiv auf ein neues sw.js pruefen koennen. Sonst prueft eine
      // installierte PWA nur beim ~24h-Browser-Heartbeat → neue Deploys wurden
      // oft erst nach manuellem Cache-Reset sichtbar.
      injectRegister: false,
      // We manage manifest.json ourselves in public/
      manifest: false,
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Eigener Push-Handler (public/push-sw.js) — wird in den generierten
        // Workbox-SW eingebunden, ohne die Caching-Strategie unten zu ersetzen.
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache API responses with network-first strategy
            urlPattern: ({ url }) => url.pathname.startsWith('/pwa/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [200] },
              // Grenzen statt unbegrenztem Wachstum (docs/specs/offline-modus.md §5).
              // Der Cache ist seit dem Lesepaket nur noch das zweite Netz — für
              // alles ausserhalb des Snapshots. Ohne Expiration wuchs er endlos
              // und alterte nie: eine Antwort von vor drei Monaten wurde offline
              // ausgeliefert, als wäre sie von heute.
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Proxy API calls to Railway backend during local dev
    proxy: {
      '/pwa': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  // Vitest — jsdom für localStorage + React-Rendering, gemeinsame Setup-Datei.
  // Der test-Block wird vom Prod-Build (vite build) ignoriert.
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    env: {
      // Zeitzone festnageln, und zwar auf die des Produkts — nicht auf UTC.
      //
      // Grund: Die CI läuft auf ubuntu-latest, also unter UTC. Jeder Entwickler
      // hier sitzt in der Schweiz. Ein Datumsfehler, der nur bei positivem
      // UTC-Versatz auftritt, ist damit in der CI unsichtbar und lokal rot —
      // genau umgekehrt zu dem, was ein Testlauf leisten soll. Passiert am
      // 2026-08-25 mit Wochenplan.test.tsx: zwölf Tests grün in der CI, alle
      // zwölf rot in Europe/Zurich.
      //
      // Europe/Zurich statt UTC, weil die App nur dort läuft: Zeiterfassung,
      // Wochenplan und ArG-Prüfungen rechnen in Schweizer Zeit. Ein Test unter
      // UTC prüft eine Umgebung, die es nicht gibt — inklusive Sommerzeit, die
      // UTC gar nicht kennt.
      TZ: 'Europe/Zurich',
    },
  },
}))

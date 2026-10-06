/**
 * Einstieg des Admin-Builds (`VITE_APP_TARGET=admin`, admin.html).
 *
 * Bewusst schmaler als `src/main.tsx`:
 *
 * - **Keine `runStorageMigrations()`** — die migriert Keys der Mandanten-App,
 *   und `admin.werkora.ch` ist eine eigene Origin mit eigenem localStorage.
 *   Hier gibt es nichts zu migrieren (Spec §6.5); käme je ein Key dazu, bekäme
 *   er seine eigene Kette, nicht die des Monteurs.
 * - **Kein Zurück-Wächter im Bundle** — der Inline-Wächter aus vite.config.ts
 *   läuft auch hier, aber eine Admin-Seite hinter dem Schreibtisch braucht
 *   keine zweite Stufe.
 *
 * Der Service Worker bleibt: er macht die Seite installierbar, liefert den
 * App-Rahmen aus dem Precache und empfängt seit 2026-10 die Support-Pushes
 * (public/admin-push-sw.js, docs/specs/support-antwort.md §13). Was er NICHT
 * tut, steht in vite.config.ts — kein API-Cache.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import AdminSite from './AdminSite'
import '../index.css'
import { registerPwaUpdates } from '../api/registerSW'
import { trackViewportHeight } from '../shared/viewportHeight'
import { applyTheme, loadTheme } from '../theme'
import { applyWerkoraBranding } from './werkoraBranding'

// Sichtbare Fensterhöhe als --app-vh: die Shell misst sich daran, statt 100dvh
// gegen ein 100%-Dokument zu stellen (CLAUDE.md, «Volle Fensterhöhe»).
trackViewportHeight()

// Die Akzentfarbe ist hier fest die der Marke — es gibt keinen Mandanten, der
// eine mitbrächte (§6.2). VOR dem Rendern, damit der Anmeldeschirm nicht erst
// im Rückfallblau erscheint und dann umspringt.
applyWerkoraBranding()

// Hell/Dunkel gleich beim Start setzen und nicht erst in der Shell: `applyTheme`
// lief bisher in einem Effekt von `AdminSiteShell`, und die Shell gibt es erst
// NACH der Anmeldung. Ohne `data-theme` auf `<html>` greifen die
// attributlosen `:root`-Regeln von index.css — und die führen die dunklen
// Werte. Der Anmeldeschirm kam deshalb dunkel, während der Rest der Seite (und
// die Voreinstellung «hell») hell ist.
applyTheme(loadTheme())

registerPwaUpdates()

// Klick auf eine Support-Push bei offenem Fenster: der Service Worker
// fokussiert es und schickt den Pfad der Meldung. Nur der Hash wird übernommen —
// die Navigation der Seite hängt an `hashchange` (useAdminSiteNav), und eine
// fremde Adresse aus einer Nachricht darf hier nie die Seite verlassen.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; url?: string } | null
    if (data?.type !== 'admin-push-open' || typeof data.url !== 'string') return
    const hash = data.url.startsWith('/#') ? data.url.slice(1) : ''
    if (hash.startsWith('#/')) window.location.hash = hash
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminSite />
  </React.StrictMode>,
)

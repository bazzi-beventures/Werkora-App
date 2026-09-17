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
 * Der Service Worker bleibt: er macht die Seite installierbar und liefert den
 * App-Rahmen aus dem Precache. Was er NICHT tut, steht in vite.config.ts —
 * kein Push-Handler, kein API-Cache.
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminSite />
  </React.StrictMode>,
)

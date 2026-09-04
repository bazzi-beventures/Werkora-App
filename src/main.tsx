import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { runStorageMigrations } from './api/storageMigrations'
import { registerPwaUpdates } from './api/registerSW'
import { trackViewportHeight } from './shared/viewportHeight'

// Vor dem ersten Render: Client-State auf aktuelles Schema migrieren,
// damit User nach Breaking-Changes nicht manuell den Cache löschen müssen.
runStorageMigrations()

// Sichtbare Fensterhöhe als --app-vh bereitstellen, bevor das erste Layout
// steht: die Shells messen sich daran, statt 100dvh gegen ein 100%-Dokument
// zu stellen (siehe shared/viewportHeight.ts).
trackViewportHeight()

// Service Worker registrieren und bei jeder Rückkehr in die App aktiv auf ein
// neues sw.js prüfen (behebt die "Deploy erst nach Cache-Reset sichtbar"-Falle).
registerPwaUpdates()

// Fallback-Banner: Falls ein neuer SW die Kontrolle übernimmt, ohne dass
// vite-plugin-pwa (autoUpdate) die Seite bereits selbst neu geladen hat.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.dispatchEvent(new CustomEvent('sw-update-ready'))
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

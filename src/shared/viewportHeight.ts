/**
 * Die wirklich sichtbare Fensterhöhe als CSS-Variable `--app-vh`.
 *
 * Warum das nötig ist — der Kern des iPhone-Fehlerbilds:
 *
 * Beide Shells (`.app-screen` der Monteur-App, `.admin-shell-mobile` des
 * Admin) sind eine Spalte über die volle Höhe, mit der Leiste als letzter
 * Zeile. Die Höhe stand bisher als `100dvh` im CSS, `html/body/#root` daneben
 * auf `height: 100%`. Das sind ZWEI verschiedene Maße für dasselbe:
 *
 * - `100%` misst gegen den Initial Containing Block. Der ist auf iOS Safari
 *   der GROSSE Viewport — die Fläche hinter den Browserleisten mitgerechnet.
 *   Das Dokument war damit rund 50 px höher als das, was man sieht.
 * - `100dvh` misst den gerade sichtbaren Bereich.
 *
 * Daraus wurden genau die drei gemeldeten Symptome: Das Dokument liess sich
 * um die Differenz anschieben, die Tab-Leiste rutschte dabei nach oben und
 * darunter stand leere Fläche («die Leiste sitzt zu hoch»); der untere Rand
 * des Inhalts verschwand hinter der Browserleiste («man sieht nicht alles»);
 * und weil der innere Scroll-Container `overscroll-behavior: contain` trägt,
 * zog jede Wischgeste am Dokument statt an der Liste — die Seite fühlte sich
 * an, als hänge sie («eingefroren»).
 *
 * `100dvh` allein reicht als Reparatur nicht: iOS aktualisiert den Wert beim
 * Ein- und Ausfahren der Leisten verzögert, und im Standalone-Modus mit
 * `viewport-fit=cover` liefert er je nach iOS-Version die Höhe mit oder ohne
 * Home-Indicator. Gemessen ist deshalb besser als gerechnet — dieselbe
 * Haltung, mit der `HelpBubble` schon heute den Safe-Area-Inset per Sonde
 * bestimmt, statt ihn zu schätzen.
 *
 * Gemessen wird `window.innerHeight`, nicht `visualViewport.height`:
 * `innerHeight` folgt den Browserleisten und der Drehung, bleibt beim
 * Aufklappen der Bildschirmtastatur aber stehen. Genau das ist gewollt — mit
 * der Tastaturhöhe würde die ganze Shell samt Tab-Leiste bei jedem Tippen ins
 * Formular zusammenspringen.
 *
 * Im CSS steht der Wert immer als Rückfallkette:
 *   `height: 100dvh; height: var(--app-vh, 100dvh);`
 * So bleibt eine Seite auch dann brauchbar, wenn dieses Modul nicht lief
 * (Test-Umgebung, Fehler vor dem ersten Render).
 */

/** Zuletzt geschriebener Wert — spart das Setzen identischer Werte (jedes
 *  `setProperty` auf `<html>` stösst sonst ein Re-Layout an, und `resize`
 *  feuert auf iOS beim Scrollen in Serie). */
let lastPx = -1

function apply(): void {
  const h = window.innerHeight
  if (!Number.isFinite(h) || h <= 0) return
  const px = Math.round(h)
  if (px === lastPx) return
  lastPx = px
  document.documentElement.style.setProperty('--app-vh', `${px}px`)
}

/**
 * Misst einmal und hängt sich an die Ereignisse, bei denen sich die sichtbare
 * Höhe ändert. Idempotent: ein zweiter Aufruf richtet nichts an, weil `apply`
 * gleiche Werte verwirft — die Listener sind für die Lebensdauer der Seite
 * gedacht und werden nicht wieder gelöst.
 */
export function trackViewportHeight(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  apply()
  window.addEventListener('resize', apply)
  // Nach dem Drehen steht die neue Höhe erst im nächsten Frame; `resize`
  // allein feuert auf iOS zu früh und liefert noch die alte.
  window.addEventListener('orientationchange', () => {
    apply()
    requestAnimationFrame(apply)
  })
  // Rückkehr aus dem Back/Forward-Cache: iOS rendert die Seite dann aus dem
  // Speicher, ohne `resize` — mit stehengebliebenem Wert wäre die Shell nach
  // einer Drehung im Hintergrund falsch hoch.
  window.addEventListener('pageshow', apply)
}

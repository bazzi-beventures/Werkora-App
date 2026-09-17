/**
 * Die Farben der Betreiber-Seite: Werkora, fest.
 *
 * Spec: docs/specs/admin-werkora-ch.md §6.2 («Branding fest auf Werkora»).
 *
 * Die Mandanten-App hängt nach dem Login ein Stylesheet ein, das `--accent`
 * und `--primary*` aus der Firmenfarbe ableitet (`applyTenantBranding`,
 * App.tsx). Hier gibt es keinen Mandanten, also lief die Seite auf den
 * Rückfallwerten von `admin/tokens.css` — und die sind **kein** Werkora-Ton,
 * sondern `#3081AB`, der Default der Spalte `tenants.brand_color`
 * (brand/palette.ts, `FALLBACK`). Das Ergebnis war eine Seite, die «Werkora
 * Admin» heisst, das Amber-Zifferblatt im Kopf trägt — und daneben in einem
 * Mandantenblau navigierte, das keinem Mandanten gehört.
 *
 * Deshalb dieselbe Ableitung wie für einen Mandanten, nur mit dem
 * Werkora-Amber als Grundton: gerechnet in OKLCH, kontrastgeprüft je Theme.
 * Das ist wichtiger, als es klingt — `#E9A227` roh als `--primary` wäre auf
 * hellem Grund als Schrift 2,2:1 und damit unlesbar. `derivePalette` schiebt
 * ihn im hellen Theme ins dunklere Amber (die Regel von werkora.ch: der helle
 * Ton ist dort Fläche, nie Schrift) und im dunklen nach oben.
 *
 * Aufgerufen wird das **einmal beim Start** und nicht bei jedem Themewechsel:
 * das eingehängte Stylesheet führt beide Sätze als `[data-theme]`-Regeln, und
 * der Umschalter setzt nur das Attribut.
 */
import { WERKORA_AMBER } from '../brand/WerkoraMark'
import { derivePalette, paletteCss } from '../brand/palette'

const STYLE_ID = 'werkora-branding'

export function applyWerkoraBranding(): void {
  const el = document.getElementById(STYLE_ID) ?? document.createElement('style')
  el.id = STYLE_ID
  el.textContent = paletteCss(derivePalette(WERKORA_AMBER))
  // Ans Ende von <head>: die gebündelten Stylesheets stehen davor, und bei
  // gleicher Spezifität gewinnt die spätere Regel.
  document.head.appendChild(el)
}

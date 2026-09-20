/**
 * Wer sieht den Bereich «Rechnungen»? (docs/specs/admin-werkora-ch.md §8.3)
 *
 * Der Test pinnt eine Sperre, die vorher keine war. Bis zum 18.09.2026 hing der
 * Bereich an den Modulen `invoicing` + `payment_matching` — und die hat jeder
 * Kunde mit Fakturierung. Ein Superadmin, der (Übergangszeit, §8.6) noch in
 * einem Kundenmandanten sitzt, sah dort dessen Rechnungen unter der Überschrift
 * der Betreiber-Seite. Jetzt entscheidet der Server am Slug.
 */
import { describe, it, expect } from 'vitest'
import { hatRechnungsbereich } from './useAdminSiteNav'

describe('hatRechnungsbereich', () => {
  it('zeigt den Bereich im Betreiber-Mandanten', () => {
    expect(hatRechnungsbereich({ betreiber_mandant: true })).toBe(true)
  })

  it('verbirgt ihn in einem Kundenmandanten — auch mit beiden Modulen', () => {
    // Genau der Fall, der vorher durchrutschte: Gehlhaar hat Fakturierung.
    expect(hatRechnungsbereich({ betreiber_mandant: false })).toBe(false)
  })

  it('verbirgt ihn, wenn das Feld fehlt — ein alter Client rät nicht', () => {
    // `/pwa/me` eines älteren Backends kennt das Feld nicht. Im Zweifel nichts
    // zeigen: ein fehlender Bereich ist eine Unbequemlichkeit, ein
    // fälschlich gezeigter sind fremde Rechnungen.
    expect(hatRechnungsbereich({})).toBe(false)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { applyTenantBranding } from './App'
import { derivePalette } from './brand/palette'
import type { TenantInfo } from './api/auth'

// Der schwarze Balken über der App: die Titelleiste der installierten PWA nimmt
// `<meta name="theme-color">`, und dort steht in index.html das Werkora-Schwarz.
// Über der Mandantenleiste sah das aus wie ein Streifen, der zu nichts gehört.
// Seit dem Branding-Load trägt sie die Firmenfarbe — dieser Test hält fest, dass
// die Zuweisung wirklich passiert und dieselbe Fläche nimmt wie das «Mehr»-Blatt.

function tenant(brandColor: string): TenantInfo {
  return { name: 'Gehlhaar GmbH', brand_color: brandColor } as TenantInfo
}

const themeColor = () =>
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content

describe('theme-color der PWA-Titelleiste', () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#12161D">'
  })

  it('nimmt beim Branding-Load die dunkle Mandantenflaeche', () => {
    applyTenantBranding(tenant('#1F6FB2'))
    expect(themeColor()).toBe(derivePalette('#1F6FB2').nav.surface)
    expect(themeColor()).not.toBe('#12161D')
  })

  it('faellt bei unbrauchbarer Firmenfarbe auf denselben Wert wie die Palette', () => {
    // Kurzform gilt bewusst als unbrauchbar (brand/palette.ts) — die Leiste soll
    // dann denselben Rueckfall zeigen wie der Rest der App, nicht das alte Schwarz.
    applyTenantBranding(tenant('#abc'))
    expect(themeColor()).toBe(derivePalette('#abc').nav.surface)
  })

  it('kommt ohne das Meta-Tag aus', () => {
    document.head.innerHTML = ''
    expect(() => applyTenantBranding(tenant('#1F6FB2'))).not.toThrow()
  })
})

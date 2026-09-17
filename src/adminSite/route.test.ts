/**
 * Adressformat der Betreiber-Seite (docs/specs/admin-werkora-ch.md §4.2).
 *
 * Der Mandant steht im Hash, damit ein Link auf einen Mandanten zeigt. Geht
 * das Format kaputt, zeigt der Link auf den falschen — und das merkt man erst,
 * wenn jemand darin etwas umgestellt hat.
 */
import { describe, it, expect } from 'vitest'
import { buildHash, parseHash, DEFAULT_SCREEN } from './route'

describe('parseHash', () => {
  it('leere Adresse ergibt die Übersicht ohne Mandant', () => {
    expect(parseHash('')).toEqual({ screen: DEFAULT_SCREEN, tenantSlug: null, detail: null })
    expect(parseHash('#')).toEqual({ screen: DEFAULT_SCREEN, tenantSlug: null, detail: null })
    expect(parseHash('#/')).toEqual({ screen: DEFAULT_SCREEN, tenantSlug: null, detail: null })
  })

  it('Plattform-Screen ohne Mandant', () => {
    expect(parseHash('#/fehler')).toEqual({ screen: 'fehler', tenantSlug: null, detail: null })
  })

  it('Plattform-Screen mit Detail — der Link aus der Support-Mail', () => {
    expect(parseHash('#/support/tk-42')).toEqual({
      screen: 'support', tenantSlug: null, detail: 'tk-42',
    })
  })

  it('Mandanten-Screen trägt den Slug', () => {
    expect(parseHash('#/t/gehlhaar/konfiguration')).toEqual({
      screen: 'konfiguration', tenantSlug: 'gehlhaar', detail: null,
    })
  })

  it('Slug ohne Screen ist kein Fehler, sondern der Standard-Screen', () => {
    expect(parseHash('#/t/gehlhaar')).toEqual({
      screen: 'konfiguration', tenantSlug: 'gehlhaar', detail: null,
    })
  })

  it('kodierte Zeichen kommen entschlüsselt zurück', () => {
    expect(parseHash('#/support/a%2Fb').detail).toBe('a/b')
  })
})

describe('buildHash', () => {
  it('ohne Mandant', () => {
    expect(buildHash({ screen: 'fehler' })).toBe('#/fehler')
  })

  it('mit Mandant', () => {
    expect(buildHash({ screen: 'nutzung', tenantSlug: 'gehlhaar' })).toBe('#/t/gehlhaar/nutzung')
  })

  it('mit Detail', () => {
    expect(buildHash({ screen: 'support', detail: 'tk-42' })).toBe('#/support/tk-42')
  })

  it('ohne Screen fällt auf die Übersicht zurück', () => {
    expect(buildHash({})).toBe(`#/${DEFAULT_SCREEN}`)
  })
})

describe('parseHash ∘ buildHash', () => {
  it('ist für jede Form verlustfrei', () => {
    for (const route of [
      { screen: 'fehler', tenantSlug: null, detail: null },
      { screen: 'support', tenantSlug: null, detail: 'tk-42' },
      { screen: 'konfiguration', tenantSlug: 'gehlhaar', detail: null },
      { screen: 'nutzung', tenantSlug: 'staehli', detail: null },
    ]) {
      expect(parseHash(buildHash(route))).toEqual(route)
    }
  })
})

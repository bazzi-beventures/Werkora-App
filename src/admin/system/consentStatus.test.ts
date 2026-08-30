import { describe, it, expect } from 'vitest'
import { consentBadge } from './consentStatus'

// Der Fall, der den Fehler ausgelöst hat: Nach dem Sprung von v5 auf v6 zeigte die
// Benutzerverwaltung für alle weiter «Ja». Die Spalte beantwortete «gibt es
// überhaupt eine Fassung» statt «ist es die aktuelle» — und war damit genau in dem
// Moment nutzlos, für den es sie gibt.

describe('consentBadge', () => {
  it('meldet «Aktuell», wenn das Backend die Fassung als aktuell bestätigt', () => {
    const badge = consentBadge({ consent_version: 'v6', consent_current: true })
    expect(badge.state).toBe('aktuell')
    expect(badge.label).toBe('Aktuell')
    expect(badge.className).toBe('admin-badge-approved')
  })

  it('meldet «Veraltet» mit der alten Nummer, wenn eine neue Fassung existiert', () => {
    const badge = consentBadge({ consent_version: 'v5', consent_current: false })
    expect(badge.state).toBe('veraltet')
    expect(badge.label).toBe('Veraltet · v5')
    expect(badge.className).toBe('admin-badge-pending')
  })

  it('meldet «Ausstehend», wenn nie etwas bestätigt wurde', () => {
    const badge = consentBadge({ consent_version: null, consent_current: false })
    expect(badge.state).toBe('ausstehend')
    expect(badge.label).toBe('Ausstehend')
    expect(badge.className).toBe('admin-badge-draft')
  })

  it('gibt im Zweifel keine Entwarnung: fehlendes Flag zählt als veraltet', () => {
    // Kommt nur im kurzen Deploy-Fenster vor, in dem eine ältere Backend-Fassung
    // antwortet. Ein falsches «Aktuell» ist der Fehler, den diese Spalte hatte —
    // ein falsches «Veraltet» korrigiert sich beim nächsten Laden von selbst.
    const badge = consentBadge({ consent_version: 'v6' } as never)
    expect(badge.state).toBe('veraltet')
  })

  it('trägt die bestätigte Fassung im Tooltip, damit man sie ohne Klick sieht', () => {
    expect(consentBadge({ consent_version: 'v5', consent_current: false }).title).toContain('v5')
    expect(consentBadge({ consent_version: 'v6', consent_current: true }).title).toContain('v6')
  })
})

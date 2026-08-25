import { describe, it, expect } from 'vitest'
import { DEFAULT_WAIT_HOURS, isQuoteWithoutFeedback, quoteWaitHours } from './quoteFeedback'

const NOW = new Date('2026-08-14T10:00:00Z')

describe('quoteWaitHours', () => {
  it('nimmt den konfigurierten Wert', () => {
    expect(quoteWaitHours({ stunden: 24 })).toBe(24)
  })

  it('fällt bei fehlendem oder unbrauchbarem Wert auf 72 zurück', () => {
    expect(quoteWaitHours(null)).toBe(DEFAULT_WAIT_HOURS)
    expect(quoteWaitHours({})).toBe(DEFAULT_WAIT_HOURS)
    expect(quoteWaitHours({ stunden: 0 })).toBe(DEFAULT_WAIT_HOURS)
    expect(quoteWaitHours({ stunden: -5 })).toBe(DEFAULT_WAIT_HOURS)
    expect(quoteWaitHours({ stunden: 'bald' })).toBe(DEFAULT_WAIT_HOURS)
  })

  it('deckelt bei 90 Tagen', () => {
    expect(quoteWaitHours({ stunden: 99999 })).toBe(2160)
  })
})

describe('isQuoteWithoutFeedback', () => {
  const sent = (iso: string | null, status = 'gesendet') =>
    ({ status, sent_at: iso, created_at: null })

  it('greift ab der Frist', () => {
    // Exakt 72 h alt → zählt bereits
    expect(isQuoteWithoutFeedback(sent('2026-08-11T10:00:00Z'), 72, NOW)).toBe(true)
    expect(isQuoteWithoutFeedback(sent('2026-08-11T09:59:00Z'), 72, NOW)).toBe(true)
  })

  it('greift vor der Frist nicht', () => {
    expect(isQuoteWithoutFeedback(sent('2026-08-11T10:01:00Z'), 72, NOW)).toBe(false)
    expect(isQuoteWithoutFeedback(sent('2026-08-14T09:00:00Z'), 72, NOW)).toBe(false)
  })

  it('gilt nur für versendete Offerten — angenommen/abgelehnt ist eine Rückmeldung', () => {
    for (const status of ['entwurf', 'akzeptiert', 'abgelehnt', 'absage', 'archiviert']) {
      expect(isQuoteWithoutFeedback(sent('2026-01-01T10:00:00Z', status), 72, NOW)).toBe(false)
    }
  })

  it('nutzt created_at, wenn sent_at fehlt (Offerten vor der sent_at-Spalte)', () => {
    expect(isQuoteWithoutFeedback(
      { status: 'gesendet', sent_at: null, created_at: '2026-07-01T10:00:00Z' }, 72, NOW)).toBe(true)
  })

  it('bleibt ohne jedes Datum stumm statt zu raten', () => {
    expect(isQuoteWithoutFeedback({ status: 'gesendet' }, 72, NOW)).toBe(false)
    expect(isQuoteWithoutFeedback(sent('kein-datum'), 72, NOW)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { buildErrorLogQuery } from './errorLogs'

// Ansicht und CSV-Export teilen sich diesen Query-Bau. Weicht er auseinander,
// exportiert der Button still einen anderen Ausschnitt als die Liste zeigt.
describe('buildErrorLogQuery', () => {
  it('setzt Zeitraum und Mandant', () => {
    const q = buildErrorLogQuery({
      since: '2026-08-06T00:00:00',
      until: '2026-08-12T23:59:59',
      tenantId: 't-1',
    })
    const p = new URLSearchParams(q.slice(1))
    expect(p.get('since')).toBe('2026-08-06T00:00:00')
    expect(p.get('until')).toBe('2026-08-12T23:59:59')
    expect(p.get('tenant_id')).toBe('t-1')
  })

  it('sendet Level nur bei echter Einschränkung', () => {
    expect(buildErrorLogQuery({ levels: ['error', 'critical'] })).toBe('?level=error%2Ccritical')
    // alle drei = keine Einschränkung → kein Parameter
    expect(buildErrorLogQuery({ levels: ['warning', 'error', 'critical'] })).toBe('')
    expect(buildErrorLogQuery({ levels: [] })).toBe('')
  })

  it('trimmt die Suche und lässt Leerzeichen-Eingaben weg', () => {
    expect(buildErrorLogQuery({ q: '  Timeout ' })).toBe('?q=Timeout')
    expect(buildErrorLogQuery({ q: '   ' })).toBe('')
  })

  it('ist ohne Parameter leer (kein nacktes ?)', () => {
    expect(buildErrorLogQuery()).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { hasWerkzeug, inMinuten, terminIstHeute } from './serviceBegleitung'
import type { UserInfo } from './auth'

describe('serviceBegleitung', () => {
  it('rundet «in X Min.» auf die nächste 5-Minuten-Marke auf', () => {
    const jetzt = new Date(2026, 10, 16, 8, 11, 30)
    expect(inMinuten(10, jetzt)).toBe('08:25')
    expect(inMinuten(14, jetzt)).toBe('08:25')
    expect(inMinuten(60, new Date(2026, 10, 16, 23, 30))).toBe('00:30')
  })

  it('kennt heutige Termine, auch mehrtägige', () => {
    expect(terminIstHeute('2026-11-16', null, '2026-11-16')).toBe(true)
    expect(terminIstHeute('2026-11-14', '2026-11-18', '2026-11-16')).toBe(true)
    expect(terminIstHeute('2026-11-17', null, '2026-11-16')).toBe(false)
    expect(terminIstHeute(null, null, '2026-11-16')).toBe(false)
  })

  it('fragt die vom Server verrechnete Liste der Werkzeuge', () => {
    const user = { service_werkzeuge: ['unterwegs_meldung'] } as unknown as UserInfo
    expect(hasWerkzeug(user, 'unterwegs_meldung')).toBe(true)
    expect(hasWerkzeug({} as UserInfo, 'unterwegs_meldung')).toBe(false)
    expect(hasWerkzeug(null, 'unterwegs_meldung')).toBe(false)
  })
})

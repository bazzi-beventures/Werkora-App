import { describe, expect, it } from 'vitest'
import { absenzDauer, halberTagFuer } from './halberTag'

describe('halber Absenztag (WW-93)', () => {
  it('geht nur bei eintägiger Absenz mit', () => {
    expect(halberTagFuer('2026-11-20', '2026-11-20', 'am')).toBe('am')
    expect(halberTagFuer('2026-11-20', '2026-11-21', 'am')).toBeUndefined()
    expect(halberTagFuer('2026-11-20', '2026-11-20', undefined)).toBeUndefined()
    expect(halberTagFuer('2026-11-20', '2026-11-20', 'mittag')).toBeUndefined()
  })

  it('zeigt die Dauer als halben Tag mit Hälfte', () => {
    expect(absenzDauer(1, 'pm')).toBe('½ Tag (Nachmittag)')
    expect(absenzDauer(1, null)).toBe('1 Tag')
    expect(absenzDauer(3)).toBe('3 Tage')
  })
})

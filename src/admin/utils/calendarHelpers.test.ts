import { describe, it, expect } from 'vitest'
import { hhmmToMin, minToHHMM } from './calendarHelpers'

describe('hhmmToMin', () => {
  it('rechnet HH:MM in Minuten ab Mitternacht um', () => {
    expect(hhmmToMin('00:00')).toBe(0)
    expect(hhmmToMin('06:00')).toBe(360)
    expect(hhmmToMin('08:30')).toBe(510)
    expect(hhmmToMin('23:59')).toBe(1439)
  })

  it('ignoriert einen Sekundenanteil (DB liefert teils HH:MM:SS)', () => {
    expect(hhmmToMin('08:30:00')).toBe(510)
  })
})

describe('minToHHMM', () => {
  it('formatiert Minuten als nullgepolstertes HH:MM', () => {
    expect(minToHHMM(0)).toBe('00:00')
    expect(minToHHMM(360)).toBe('06:00')
    expect(minToHHMM(510)).toBe('08:30')
  })

  it('rundet auf ganze Minuten', () => {
    expect(minToHHMM(510.4)).toBe('08:30')
    expect(minToHHMM(509.6)).toBe('08:30')
  })

  it('läuft über Mitternacht stabil (Modulo 24h)', () => {
    expect(minToHHMM(1440)).toBe('00:00')
    expect(minToHHMM(-15)).toBe('23:45')
  })

  it('ist invers zu hhmmToMin', () => {
    for (const t of ['00:00', '06:15', '08:30', '12:45', '20:00', '23:59']) {
      expect(minToHHMM(hhmmToMin(t))).toBe(t)
    }
  })

  it('zieht eine Dauer korrekt mit (Start verschoben, Länge erhalten)', () => {
    // 08:00–11:30 (210 min) wird auf Start 09:15 gezogen → 09:15–12:45
    const dur = hhmmToMin('11:30') - hhmmToMin('08:00')
    expect(minToHHMM(hhmmToMin('09:15') + dur)).toBe('12:45')
  })
})

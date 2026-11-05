import { describe, it, expect } from 'vitest'
import { hhmmToMin, isoWeek, kwLabel, minToHHMM } from './calendarHelpers'

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

// WW-65: Kalenderwoche über der Einsatzplanung. ISO 8601 — Montag beginnt die
// Woche, KW 1 enthält den ersten Donnerstag; Grenzfälle am Jahreswechsel.
describe('isoWeek', () => {
  it('zählt wie der Schweizer Kalender', () => {
    expect(isoWeek(new Date(2026, 10, 2))).toBe(45)  // Mo 02.11.2026
    expect(isoWeek(new Date(2026, 10, 8))).toBe(45)  // So 08.11.2026 — gleiche Woche
    expect(isoWeek(new Date(2026, 10, 9))).toBe(46)  // Mo 09.11.2026
  })

  it('ordnet den Jahreswechsel nach dem Donnerstag zu', () => {
    expect(isoWeek(new Date(2026, 11, 31))).toBe(53) // Do 31.12.2026
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53)   // Fr 01.01.2027 gehört noch zu KW 53
    expect(isoWeek(new Date(2027, 0, 4))).toBe(1)    // Mo 04.01.2027
    expect(isoWeek(new Date(2024, 11, 30))).toBe(1)  // Mo 30.12.2024 ist schon KW 1/2025
  })

  it('stolpert nicht über die Sommerzeit-Umstellung', () => {
    expect(isoWeek(new Date(2026, 2, 29))).toBe(13)  // So 29.03.2026, Umstellung
    expect(isoWeek(new Date(2026, 2, 30))).toBe(14)
    expect(isoWeek(new Date(2026, 9, 25))).toBe(43)  // So 25.10.2026, Rückstellung
  })
})

describe('kwLabel', () => {
  it('nennt eine Woche einmal und eine Wochengrenze als Spanne', () => {
    expect(kwLabel(new Date(2026, 10, 4))).toBe('KW 45')
    expect(kwLabel(new Date(2026, 10, 2), new Date(2026, 10, 6))).toBe('KW 45')
    expect(kwLabel(new Date(2026, 10, 6), new Date(2026, 10, 10))).toBe('KW 45–46')
  })
})

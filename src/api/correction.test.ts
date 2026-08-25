import { describe, it, expect } from 'vitest'
import {
  breakInputValue,
  correctionError,
  correctionIncomplete,
  parseBreakMinutes,
  toMinutes,
} from './correction'

const form = (over: Partial<Parameters<typeof correctionError>[0]> = {}) => ({
  clock_in: '07:00', clock_out: '17:00', break_minutes: 30, reason: 'Vergessen', ...over,
})

describe('toMinutes', () => {
  it('rechnet HH:MM in Minuten seit Mitternacht', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes('07:30')).toBe(450)
    expect(toMinutes('23:59')).toBe(1439)
  })

  it('gibt null für leere oder unlesbare Werte', () => {
    expect(toMinutes('')).toBeNull()
    expect(toMinutes('24:00')).toBeNull()
    expect(toMinutes('7:5')).toBeNull()
    expect(toMinutes('abc')).toBeNull()
  })
})

describe('parseBreakMinutes', () => {
  it('liest normale Eingaben', () => {
    expect(parseBreakMinutes('45')).toBe(45)
  })

  it('behandelt führende Nullen wie die Zahl selbst', () => {
    // Genau der Fall aus dem Feld: der Vorbelegungs-"0" im Feld blieb stehen
    // und der Monteur tippte "695" dahinter.
    expect(parseBreakMinutes('0695')).toBe(695)
  })

  it('macht aus leer/unlesbar/negativ eine 0 statt NaN', () => {
    expect(parseBreakMinutes('')).toBe(0)
    expect(parseBreakMinutes('   ')).toBe(0)
    expect(parseBreakMinutes('abc')).toBe(0)
    expect(parseBreakMinutes('-30')).toBe(0)
  })

  it('schneidet Nachkommastellen ab', () => {
    expect(parseBreakMinutes('30.7')).toBe(30)
  })
})

describe('breakInputValue', () => {
  it('zeigt 0 als leeres Feld — sonst entsteht beim Tippen "0695"', () => {
    expect(breakInputValue(0)).toBe('')
    expect(breakInputValue(30)).toBe('30')
  })
})

describe('correctionIncomplete', () => {
  it('meldet fehlende Pflichtfelder', () => {
    expect(correctionIncomplete(form())).toBe(false)
    expect(correctionIncomplete(form({ clock_in: '' }))).toBe(true)
    expect(correctionIncomplete(form({ clock_out: '' }))).toBe(true)
    expect(correctionIncomplete(form({ reason: '   ' }))).toBe(true)
  })
})

describe('correctionError', () => {
  it('lässt einen plausiblen Antrag durch', () => {
    expect(correctionError(form())).toBeNull()
    expect(correctionError(form({ break_minutes: 0 }))).toBeNull()
  })

  it('schweigt, solange die Zeiten noch nicht beide gesetzt sind', () => {
    expect(correctionError(form({ clock_in: '', break_minutes: 695 }))).toBeNull()
  })

  it('blockiert Ausstempel vor oder gleich Einstempel', () => {
    expect(correctionError(form({ clock_in: '17:00', clock_out: '07:00' }))).toMatch(/nach dem Einstempel/)
    expect(correctionError(form({ clock_in: '07:00', clock_out: '07:00' }))).toMatch(/nach dem Einstempel/)
  })

  it('blockiert eine Pause, die die Anwesenheit auffrisst', () => {
    // 07:00–18:02 = 662 Min Anwesenheit; 695 Min Pause ergäbe im Backend
    // still 0 Arbeitsminuten.
    expect(correctionError(form({ clock_out: '18:02', break_minutes: 695 }))).toMatch(/kürzer/)
    expect(correctionError(form({ clock_out: '18:02', break_minutes: 662 }))).toMatch(/kürzer/)
    expect(correctionError(form({ clock_out: '18:02', break_minutes: 661 }))).toBeNull()
  })
})

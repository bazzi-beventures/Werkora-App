import { describe, expect, it } from 'vitest'
import {
  MAX_GERUESTFAECHER, addGeruestfaecher, formatGeruestfaecher,
  normalizeGeruestfach, parseGeruestfaecherInput,
} from './geruestfaecher'

describe('normalizeGeruestfach', () => {
  it.each([
    ['2C', '2C'], ['2c', '2C'], [' 2 c ', '2C'], ['14', '14'], ['A', 'A'], ['12AB', '12AB'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeGeruestfach(raw)).toBe(expected)
  })

  it.each(['', '2-C', '2/C', 'Ä1', '123456789'])('lehnt «%s» ab', raw => {
    expect(normalizeGeruestfach(raw)).toBeNull()
  })
})

describe('parseGeruestfaecherInput', () => {
  it('zerlegt an Komma, Semikolon und Leerzeichen', () => {
    expect(parseGeruestfaecherInput('2c, 14;3a  7')).toEqual({ valid: ['2C', '14', '3A', '7'], invalid: [] })
  })

  it('meldet Ungültiges, statt es zu verschlucken', () => {
    expect(parseGeruestfaecherInput('2C, 2-D')).toEqual({ valid: ['2C'], invalid: ['2-D'] })
  })

  it('entfernt Duplikate', () => {
    expect(parseGeruestfaecherInput('2c 2C').valid).toEqual(['2C'])
  })
})

describe('addGeruestfaecher', () => {
  it('hängt an, ohne Duplikate', () => {
    expect(addGeruestfaecher(['2C'], ['14', '2C'])).toEqual(['2C', '14'])
  })

  it('hält die Obergrenze', () => {
    const voll = Array.from({ length: MAX_GERUESTFAECHER }, (_, i) => String(i))
    expect(addGeruestfaecher(voll, ['99'])).toHaveLength(MAX_GERUESTFAECHER)
  })
})

describe('formatGeruestfaecher', () => {
  it('verbindet mit Mittelpunkt', () => {
    expect(formatGeruestfaecher(['2C', '14'])).toBe('2C · 14')
  })

  it('verträgt fehlende Werte (Alt-Snapshot offline)', () => {
    expect(formatGeruestfaecher(undefined)).toBe('')
    expect(formatGeruestfaecher(null)).toBe('')
  })
})

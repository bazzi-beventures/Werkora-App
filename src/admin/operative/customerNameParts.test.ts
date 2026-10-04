import { describe, expect, it } from 'vitest'
import {
  composeCustomerName, initialNameParts, isUnsplitCustomer, suggestNameSplits,
} from './customerNameParts'

describe('composeCustomerName', () => {
  it('setzt Vorname vor Nachname', () => {
    expect(composeCustomerName('Peter', 'Muster')).toBe('Peter Muster')
  })
  it('lässt einen leeren Vornamen weg', () => {
    expect(composeCustomerName('', 'Verwaltung AG')).toBe('Verwaltung AG')
  })
  it('zieht Leerzeichen zusammen wie der Server', () => {
    expect(composeCustomerName('  Hans  Peter ', ' von  Allmen ')).toBe('Hans Peter von Allmen')
  })
})

describe('isUnsplitCustomer / initialNameParts', () => {
  it('Altbestand: ganzer Name im Nachnamen, Speichern ändert nichts', () => {
    const c = { name: 'Muster Peter', first_name: null, last_name: null }
    expect(isUnsplitCustomer(c)).toBe(true)
    expect(initialNameParts(c)).toEqual({ first: '', last: 'Muster Peter' })
  })
  it('aufgeteilter Kunde: Teile so, wie sie gespeichert sind', () => {
    const c = { name: 'Peter Muster', first_name: 'Peter', last_name: 'Muster' }
    expect(isUnsplitCustomer(c)).toBe(false)
    expect(initialNameParts(c)).toEqual({ first: 'Peter', last: 'Muster' })
  })
  it('Antwort ohne die Felder (älteres Backend) gilt als unaufgeteilt', () => {
    expect(isUnsplitCustomer({ name: 'Muster' })).toBe(true)
  })
  it('neuer Kunde: leer', () => {
    expect(initialNameParts(null)).toEqual({ first: '', last: '' })
  })
})

describe('suggestNameSplits', () => {
  it('zwei Wörter: beide Lesarten', () => {
    expect(suggestNameSplits('Muster Peter')).toEqual([
      { first: 'Peter', last: 'Muster' },
      { first: 'Muster', last: 'Peter' },
    ])
  })
  it('ein Wort: kein Vorschlag', () => {
    expect(suggestNameSplits('Muster')).toEqual([])
  })
  it('drei Wörter: zu viele Lesarten, kein Vorschlag', () => {
    expect(suggestNameSplits('Hans Peter Muster')).toEqual([])
  })
  it('Firmen bekommen keinen Vorschlag', () => {
    expect(suggestNameSplits('Huber GmbH')).toEqual([])
    expect(suggestNameSplits('Meier & Söhne')).toEqual([])
    expect(suggestNameSplits('Verwaltung Seefeld')).toEqual([])
  })
})

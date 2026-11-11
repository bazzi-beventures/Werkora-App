import { describe, it, expect } from 'vitest'
import { cleanCcList, recipientSummary } from './CcEmailRows'

describe('cleanCcList', () => {
  it('trimmt und lässt die leeren Zeilen des Dialogs weg', () => {
    expect(cleanCcList([' a@x.ch ', '', '   ', 'b@y.ch'])).toEqual(['a@x.ch', 'b@y.ch'])
  })
})

describe('recipientSummary', () => {
  it('nennt ohne CC nur den Empfänger', () => {
    expect(recipientSummary('kunde@x.ch', [])).toBe('kunde@x.ch')
    expect(recipientSummary('kunde@x.ch', ['', ' '])).toBe('kunde@x.ch')
  })

  it('hängt die CC-Adressen an', () => {
    expect(recipientSummary('kunde@x.ch', ['a@x.ch', ' b@y.ch']))
      .toBe('kunde@x.ch (CC: a@x.ch, b@y.ch)')
  })
})

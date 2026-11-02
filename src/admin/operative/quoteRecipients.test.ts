import { describe, expect, it } from 'vitest'
import { quoteRecipientSuggestions, showRecipientSuggestions } from './quoteRecipients'

// WW-55: Vorschläge für «An» im Offerten-Versand aus dem, was am Projekt hinterlegt ist.

const k = (name: string, email: string, kommentar = '') => ({ name, email, kommentar, telefon: '' })

describe('quoteRecipientSuggestions', () => {
  it('Kunde zuerst, dann Kontakte mit Rolle, dann Eigentümer', () => {
    expect(quoteRecipientSuggestions(
      'kunde@x.ch',
      [k('Peter Muster', 'muster@verwaltung.ch', 'Bewirtschafter')],
      { name: 'Erbengemeinschaft Huber', adresse: '', telefon: '', email: 'huber@x.ch' },
    )).toEqual([
      { label: 'Kunde', email: 'kunde@x.ch' },
      { label: 'Peter Muster (Bewirtschafter)', email: 'muster@verwaltung.ch' },
      { label: 'Erbengemeinschaft Huber (Eigentümer)', email: 'huber@x.ch' },
    ])
  })

  it('ohne E-Mail, ungültig oder doppelt (gross/klein) fällt weg', () => {
    expect(quoteRecipientSuggestions(
      'Kunde@X.ch',
      [k('Ohne Mail', ''), k('Kaputt', 'nicht-gueltig'), k('Doppelt', 'kunde@x.ch'), k('', 'nur@mail.ch')],
      null,
    )).toEqual([
      { label: 'Kunde', email: 'Kunde@X.ch' },
      { label: 'nur@mail.ch', email: 'nur@mail.ch' },
    ])
  })

  it('ohne Kunden-Adresse beginnt die Liste beim ersten Kontakt', () => {
    expect(quoteRecipientSuggestions('', [k('Anna', 'anna@x.ch')], null))
      .toEqual([{ label: 'Anna', email: 'anna@x.ch' }])
  })
})

describe('showRecipientSuggestions', () => {
  it('nur, wenn eine andere Adresse als die im Feld zur Wahl steht', () => {
    const one = [{ label: 'Kunde', email: 'kunde@x.ch' }]
    expect(showRecipientSuggestions(one, 'KUNDE@x.ch ')).toBe(false)
    expect(showRecipientSuggestions(one, '')).toBe(true)
    expect(showRecipientSuggestions([], 'a@b.ch')).toBe(false)
  })
})

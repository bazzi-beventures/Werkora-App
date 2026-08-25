import { describe, it, expect } from 'vitest'
import { MAX_SUPPORT_MESSAGE_CHARS, appendTranscript } from './support'

// Spec docs/specs/support-ticket.md §5.5 — Diktat ins Meldeformular.

describe('appendTranscript', () => {
  it('übernimmt den Text ins leere Feld', () => {
    expect(appendTranscript('', 'Rapport speichert nicht')).toBe('Rapport speichert nicht')
  })

  it('hängt an statt zu ersetzen', () => {
    // Wer erst tippt und dann diktiert, darf das Getippte nicht verlieren.
    expect(appendTranscript('Seit heute Morgen:', 'Rapport speichert nicht'))
      .toBe('Seit heute Morgen: Rapport speichert nicht')
  })

  it('hängt ein zweites Diktat an das erste', () => {
    const erst = appendTranscript('', 'Rapport speichert nicht.')
    expect(appendTranscript(erst, 'Der Knopf reagiert nicht.'))
      .toBe('Rapport speichert nicht. Der Knopf reagiert nicht.')
  })

  it('setzt genau ein Leerzeichen dazwischen', () => {
    expect(appendTranscript('Fehler   ', '  im Rapport ')).toBe('Fehler im Rapport')
  })

  it('lässt das Feld bei leerer Transkription unverändert', () => {
    // Voxtral liefert bei Stille einen leeren String — der darf kein Leerzeichen
    // anhängen und schon gar nicht den bestehenden Text antasten.
    expect(appendTranscript('Getippt', '   ')).toBe('Getippt')
  })

  it('deckelt auf die Länge, die der Server annimmt', () => {
    // `maxLength` am Textfeld bremst nur die Tastatur — ein langes Diktat käme
    // sonst über 2000 Zeichen ins Feld und würde serverseitig stumm gekürzt.
    const lang = 'a'.repeat(MAX_SUPPORT_MESSAGE_CHARS + 500)
    expect(appendTranscript('', lang).length).toBe(MAX_SUPPORT_MESSAGE_CHARS)
  })
})

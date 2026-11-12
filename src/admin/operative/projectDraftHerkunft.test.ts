import { describe, it, expect } from 'vitest'
import { draftHerkunft, eingangText } from './projectDraftHerkunft'

// Herkunft eines Projekt-Entwurfs — docs/specs/mail-eingang-triage.md §10
// (dritte Herkunft `mail` neben `staff` und `public`).

describe('draftHerkunft', () => {
  it('behandelt einen Entwurf ohne `source` als Mitarbeiter-Entwurf', () => {
    for (const source of [undefined, null, 'staff'] as const) {
      const h = draftHerkunft({ source })
      expect(h.vonAussen).toBe(false)
      expect(h.marke).toBeNull()
      expect(h.kundeLabel).toBe('Kunde (vom Mitarbeiter erfasst)')
    }
  })

  it('markiert die öffentliche Anfrage wie bisher', () => {
    const h = draftHerkunft({ source: 'public' })
    expect(h.vonAussen).toBe(true)
    expect(h.marke).toBe('Öffentliche Anfrage')
    expect(h.warnTitel).toBe('Ungeprüfte Angaben von aussen.')
  })

  it('markiert einen Entwurf aus dem Mail-Eingang als ungeprüft', () => {
    const h = draftHerkunft({ source: 'mail' })
    expect(h.vonAussen).toBe(true)
    expect(h.marke).toBe('Aus E-Mail')
    expect(h.warnText).toMatch(/stammen aus einer weitergeleiteten E-Mail und sind ungeprüft/)
    expect(h.kundeLabel).toBe('Kunde (Angaben aus der E-Mail)')
  })

  it('nennt beim Mail-Entwurf, wer ihn übernommen hat — bei der öffentlichen Anfrage niemanden', () => {
    expect(eingangText({ source: 'mail', created_by_name: 'Petra Büro' }, 'liste'))
      .toBe('Aus einer weitergeleiteten E-Mail übernommen von Petra Büro')
    expect(eingangText({ source: 'mail', created_by_name: null }, 'detail'))
      .toBe('Aus einer weitergeleiteten E-Mail übernommen')
    expect(eingangText({ source: 'public', created_by_name: 'Öffentliche Anfrage' }, 'liste'))
      .toBe('Über das Anfrageformular eingegangen')
    expect(eingangText({ source: 'public', created_by_name: null }, 'detail'))
      .toBe('Über das öffentliche Anfrageformular eingegangen')
  })
})

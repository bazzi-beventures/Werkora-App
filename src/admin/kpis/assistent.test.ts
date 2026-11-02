import { describe, expect, it } from 'vitest'
import {
  erstellAngebot, isoWoche, parseAssistentLink, vergleichZeile, verlaufFuer, vorschlaege, wochenLabel,
  type ChatNachricht,
} from './assistent'
import type { KpiBriefingKurz } from '../../api/admin/kpiAssistent'

function briefing(iso_year: number, iso_week: number, status: KpiBriefingKurz['status']): KpiBriefingKurz {
  return { id: `${iso_year}-${iso_week}`, iso_year, iso_week, status, created_at: '', finished_at: null }
}

describe('isoWoche', () => {
  it('rechnet ISO-8601, auch über die Jahresgrenze', () => {
    expect(isoWoche(new Date(2026, 10, 2))).toEqual({ jahr: 2026, woche: 45 })
    expect(isoWoche(new Date(2026, 0, 1))).toEqual({ jahr: 2026, woche: 1 })
    expect(isoWoche(new Date(2025, 11, 29))).toEqual({ jahr: 2026, woche: 1 })
    expect(isoWoche(new Date(2027, 0, 3))).toEqual({ jahr: 2026, woche: 53 })
  })
})

describe('erstellAngebot', () => {
  const heute = new Date(2026, 10, 4) // KW 45
  it('bietet Erstellen an, wenn die Woche fehlt', () => {
    expect(erstellAngebot([briefing(2026, 44, 'fertig')], heute)).toBe('erstellen')
    expect(erstellAngebot([], heute)).toBe('erstellen')
  })
  it('bietet Wiederholen an, wenn die KI gescheitert ist', () => {
    expect(erstellAngebot([briefing(2026, 45, 'ki_fehlgeschlagen')], heute)).toBe('wiederholen')
  })
  it('bietet nichts an, wenn sie fertig ist oder läuft', () => {
    expect(erstellAngebot([briefing(2026, 45, 'fertig')], heute)).toBeNull()
    expect(erstellAngebot([briefing(2026, 45, 'laeuft')], heute)).toBeNull()
  })
})

describe('verlaufFuer', () => {
  it('nimmt nur vollständige Wortwechsel mit, gescheiterte fallen samt Frage weg', () => {
    const n: ChatNachricht[] = [
      { id: 1, role: 'user', text: 'A?' },
      { id: 2, role: 'assistant', text: 'A!' },
      { id: 3, role: 'user', text: 'B?' },
      { id: 4, role: 'assistant', text: '', error: 'weg' },
      { id: 5, role: 'user', text: 'C?' },
    ]
    expect(verlaufFuer(n)).toEqual([{ role: 'user', text: 'A?' }, { role: 'assistant', text: 'A!' }])
  })
  it('kappt auf zehn Nachrichten', () => {
    const n: ChatNachricht[] = []
    for (let i = 0; i < 20; i++) {
      n.push({ id: i * 2, role: 'user', text: `F${i}` }, { id: i * 2 + 1, role: 'assistant', text: `A${i}` })
    }
    const v = verlaufFuer(n)
    expect(v).toHaveLength(10)
    expect(v[0].text).toBe('F15')
  })
})

describe('vorschlaege', () => {
  it('zuerst zum Handlungsbedarf, dann Standardfragen, höchstens drei', () => {
    const v = vorschlaege({
      gesamtbild: 'x', veraenderungen: [],
      handlungsbedarf: [{ titel: 'Überfällige Rechnungen', text: '', reiter: null }],
    })
    expect(v).toEqual(['Mehr dazu: Überfällige Rechnungen', 'Wie steht die Pipeline?', 'Welche Rechnungen sind überfällig?'])
    expect(vorschlaege(null)).toHaveLength(3)
  })
})

describe('vergleichZeile und wochenLabel', () => {
  it('formatiert CHF und Anzahlen mit Vorzeichen', () => {
    expect(vergleichZeile({ kennzahl: 'x', label: 'Offene Rechnungen', einheit: 'Anzahl',
      vorwoche: 5, jetzt: 7, differenz: 2, veraendert: true })).toBe('Offene Rechnungen: 5 → 7 (+2)')
    expect(vergleichZeile({ kennzahl: 'y', label: 'Offene Offerten', einheit: 'CHF',
      vorwoche: 12000, jetzt: 9500, differenz: -2500, veraendert: true }))
      .toMatch(/^Offene Offerten: CHF 12.000 → CHF 9.500 \(−CHF 2.500\)$/)
    expect(wochenLabel({ iso_year: 2026, iso_week: 45 })).toBe('KW 45 2026')
  })
})

describe('parseAssistentLink', () => {
  it('liest den detailId aus der Montags-Push', () => {
    expect(parseAssistentLink('assistent:b-1')).toEqual({ briefingId: 'b-1' })
    expect(parseAssistentLink('assistent:')).toEqual({ briefingId: null })
    expect(parseAssistentLink('assistent')).toEqual({ briefingId: null })
    expect(parseAssistentLink('assistentin')).toBeNull()
    expect(parseAssistentLink(null)).toBeNull()
    expect(parseAssistentLink('projekte')).toBeNull()
  })
})

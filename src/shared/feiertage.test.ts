import { describe, expect, it } from 'vitest'
import referenz from '../api/generated/feiertage_referenz.json'
import { feiertageKanton } from './feiertage'

// Die Referenz rechnet das Backend (`python -m scripts.feiertage_export`) — stimmt
// sie hier, zählen Ferienantrag und Saldo dieselben Tage.
describe('feiertageKanton', () => {
  const jahre = referenz as Record<string, Record<string, string[][]>>

  for (const [jahr, kantone] of Object.entries(jahre)) {
    it(`ergibt ${jahr} für alle Kantone dieselben Tage wie das Backend`, () => {
      for (const [kanton, tage] of Object.entries(kantone)) {
        expect([...feiertageKanton(Number(jahr), kanton).entries()], `${kanton} ${jahr}`).toEqual(tage)
      }
    })
  }

  it('gibt einem unbekannten Kanton nur die allgemeinen Feiertage', () => {
    expect([...feiertageKanton(2027, 'XX').values()]).toEqual([
      'Neujahr', 'Karfreitag', 'Ostermontag', 'Auffahrt', 'Pfingstmontag', 'Nationalfeiertag', 'Weihnachten',
    ])
  })
})

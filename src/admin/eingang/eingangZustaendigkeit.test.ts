import { describe, it, expect } from 'vitest'
import {
  VERANTWORTLICH_ALLE, filterNachVerantwortlich, gueltigerVerantwortlichFilter, hatOrganigramm, istMeine, leerTeile,
  personenImFilter, verantwortlichFilter, verantwortlichText, zustaendigText,
} from './eingangZustaendigkeit'

// docs/specs/mail-eingang-zustaendigkeiten.md §6, §7 (Charge B).
const B = (verantwortlich: string[], vertretung = false) => ({
  zustaendig: vertretung ? [] : verantwortlich, stellvertretung: vertretung ? verantwortlich : [], verantwortlich, vertretung,
})
const Z = {
  aufgaben: { reparatur: B(['tina']), projekt_neu: B(['marco'], true), kunde: B([]) },
  personen: { tina: 'Tina Caduff', marco: 'Marco Bianchi' },
}
const items = [{ aufgabe: 'reparatur' }, { aufgabe: 'projekt_neu' }, { aufgabe: 'kunde' }, { aufgabe: null }, {}]

describe('Zuständigkeit im Eingang', () => {
  it('«Meine» = meine Aufgaben plus alles nicht Zugeteilte', () => {
    expect(filterNachVerantwortlich(items, 'meine', Z, 'tina')).toEqual([
      { aufgabe: 'reparatur' }, { aufgabe: 'kunde' }, { aufgabe: null }, {},
    ])
    expect(istMeine({ aufgabe: 'projekt_neu' }, Z, 'tina')).toBe(false)
    expect(istMeine({ aufgabe: 'unbekannt' }, Z, 'tina')).toBe(true)
  })

  it('nach Person, nicht zugeteilt, alle', () => {
    expect(filterNachVerantwortlich(items, 'marco', Z, 'tina')).toEqual([{ aufgabe: 'projekt_neu' }])
    expect(filterNachVerantwortlich(items, 'nicht_zugeteilt', Z, 'tina')).toHaveLength(3)
    expect(filterNachVerantwortlich(items, VERANTWORTLICH_ALLE, Z, 'tina')).toHaveLength(5)
  })

  it('Personen im Filter: nur Verantwortliche, nach Namen, ohne Zahl', () => {
    expect(personenImFilter(Z)).toEqual([{ id: 'marco', name: 'Marco Bianchi' }, { id: 'tina', name: 'Tina Caduff' }])
  })

  it('Startansicht gilt, bis jemand wählt; ein veralteter Wert fällt auf sie zurück', () => {
    expect(verantwortlichFilter(null, 'meine', Z)).toBe('meine')
    expect(verantwortlichFilter(null, 'alle', Z)).toBe('alle')
    expect(verantwortlichFilter('alle', 'meine', Z)).toBe('alle')
    expect(verantwortlichFilter('weg', 'meine', Z)).toBe('meine')
    expect(gueltigerVerantwortlichFilter('marco', Z)).toBe('marco')
  })

  it('Texte', () => {
    expect(zustaendigText({ aufgabe: 'reparatur' }, Z)).toBe('Zuständig: Tina Caduff')
    expect(zustaendigText({ aufgabe: 'projekt_neu' }, Z)).toBe('Zuständig: Marco Bianchi (Vertretung)')
    expect(zustaendigText({ aufgabe: 'kunde' }, Z)).toBe('Nicht zugeteilt')
    expect(verantwortlichText('meine', Z)).toBe('bei dir')
    expect(verantwortlichText('marco', Z)).toBe('bei Marco Bianchi')
    expect(leerTeile('meine', null, Z)).toBe('in deinen Aufgaben')
    expect(leerTeile('meine', 'Neues Projekt', Z)).toBe('bei dir in «Neues Projekt»')
  })

  it('ein Organigramm ohne Einträge zählt nicht', () => {
    expect(hatOrganigramm(Z)).toBe(true)
    expect(hatOrganigramm({ aufgaben: { kunde: B([]) }, personen: {} })).toBe(false)
  })
})

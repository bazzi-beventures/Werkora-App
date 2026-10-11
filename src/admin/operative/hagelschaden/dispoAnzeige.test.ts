// Hagelschaden-Disposition — reine Helfer. Spec docs/specs/hagelschaden-disposition.md §15.
import { describe, expect, it } from 'vitest'
import type { HagelDispo, HagelZeile } from '../../../api/admin/hagelschaden'
import { dauerText, offeneArbeit, stundenText } from './dispoAnzeige'

function dispo(over: Partial<HagelDispo> = {}): HagelDispo {
  return {
    einsatzart: 'aufnahme', einsatzart_regel: 'aufnahme', kategorie: 'storen_markise',
    kategorie_regel: 'storen_markise', dauer_min: 23, dauer_regel_min: 23, dauer_ueberschrieben: false,
    rest_min: 113, stufen_min: { aufnahme: 23, reparatur: 90 }, elemente: 2, umfang_geschaetzt: false,
    personen: 1, personen_regel: 1, nicht_vor: null, zeitfenster: null, ueberschrieben: [],
    ...over,
  }
}

const z = (over: Partial<HagelZeile>) => ({ status_key: 0, einsatz_geplant: false, ...over }) as HagelZeile

describe('offeneArbeit', () => {
  it('zählt nur pendente Fälle ohne Einsatz', () => {
    const o = offeneArbeit([
      z({ dispo: dispo() }),
      z({ dispo: dispo({ umfang_geschaetzt: true, stufen_min: { reparatur: 90 } }) }),
      z({ dispo: dispo(), status_key: 1 }),          // erledigt gemeldet
      z({ dispo: dispo(), einsatz_geplant: true }),  // schon eingeplant
      z({ dispo: null }),                            // ohne Antwort
    ], 480)
    expect(o.faelle).toBe(2)
    expect(o.je).toEqual({ sicherung: 0, aufnahme: 23, reparatur: 180 })
    expect(o.minuten).toBe(203)
    expect(o.equipentage).toBe(0.4)
    expect(o.geschaetzt).toBe(1)
  })
})

describe('Anzeige', () => {
  it('Dauer kurz', () => {
    expect(dauerText(45)).toBe('45 min')
    expect(dauerText(120)).toBe('2 h')
    expect(dauerText(135)).toBe('2 h 15')
    expect(dauerText(0)).toBe('—')
  })
  it('Stunden gerundet', () => {
    expect(stundenText(17160)).toMatch(/^286 h$/)
    expect(stundenText(35)).toBe('35 min')
    expect(stundenText(135)).toBe('2 h 15')
  })
})

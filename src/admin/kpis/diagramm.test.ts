import { describe, it, expect } from 'vitest'
import type { KpiDiagramm } from '../../api/admin/kpiAssistent'
import {
  diagrammZeilen, formatWert, hatNegative, kompakt, kuerze, reihenFarben, reihenSchluessel, umbrechen,
} from './diagramm'

// Reine Helfer der Diagramme im Assistent-Chat (Spec §8 Phase 5): anordnen und
// beschriften, nie rechnen — eine Lücke bleibt eine Lücke.

const VORJAHR: KpiDiagramm = {
  art: 'vorjahresvergleich', form: 'saeulen',
  titel: 'Umsatz gestellt: Vorjahresvergleich', untertitel: '',
  einheit: 'CHF',
  kategorien: ['Okt', 'Nov'],
  reihen: [
    { name: 'Okt 24 – Nov 25', rolle: 'kontext', werte: [null, 800] },
    { name: 'Okt 25 – Nov 26', rolle: 'haupt', werte: [1200, -50] },
  ],
  zusatz: null, hinweise: [], reiter: { id: 'finanzen', label: 'Finanzen' },
}

describe('diagrammZeilen', () => {
  it('eine Zeile je Kategorie, Lücken bleiben null', () => {
    expect(diagrammZeilen(VORJAHR)).toEqual([
      { kategorie: 'Okt', r0: null, r1: 1200 },
      { kategorie: 'Nov', r0: 800, r1: -50 },
    ])
    expect(reihenSchluessel(1)).toBe('r1')
  })

  it('trägt den Zusatz je Kategorie mit', () => {
    const d: KpiDiagramm = {
      ...VORJAHR, form: 'balken', kategorien: ['A'], zusatz: ['3 Projekte'],
      reihen: [{ name: 'Umsatz', rolle: 'haupt', werte: [10] }],
    }
    expect(diagrammZeilen(d)).toEqual([{ kategorie: 'A', r0: 10, zusatz: '3 Projekte' }])
  })
})

describe('reihenFarben', () => {
  it('Hauptreihen in fester Palettenfolge, Kontext grau', () => {
    expect(reihenFarben(VORJAHR.reihen, ['#a', '#b'], '#grau')).toEqual(['#grau', '#a'])
    expect(reihenFarben(
      [{ name: 'U', rolle: 'haupt', werte: [] }, { name: 'G', rolle: 'haupt', werte: [] }],
      ['#a', '#b'], '#grau',
    )).toEqual(['#a', '#b'])
  })
})

describe('Beschriftung', () => {
  it('voller Wert für Tooltip und Tabelle, Lücke als Strich', () => {
    expect(formatWert(12345.6, 'CHF')).toMatch(/^CHF 12.346$/)
    expect(formatWert(12.25, 'Stunden')).toBe('12.3 h')
    expect(formatWert(null, 'CHF')).toBe('–')
    expect(formatWert(Number.NaN, 'CHF')).toBe('–')
  })

  it('kompakt für Achse und Balken', () => {
    expect(kompakt(61723.9, 'CHF')).toBe('61.7K')
    expect(kompakt(-1500, 'CHF')).toBe('-1.5K')
    expect(kompakt(250000, 'CHF')).toBe('250K')
    expect(kompakt(800, 'CHF')).toBe('800')
    expect(kompakt(60, 'Stunden')).toBe('60 h')
  })

  it('kürzt lange Namen mit Auslassungszeichen', () => {
    expect(kuerze('Muster AG')).toBe('Muster AG')
    expect(kuerze('Stockwerkeigentümergemeinschaft Seeblick')).toBe('Stockwerkeigentüm…')
  })

  it('bricht Beschriftungen auf zwei Zeilen um und kürzt, was nicht passt', () => {
    expect(umbrechen('Auftrag, nicht fakturiert', 16)).toEqual(['Auftrag, nicht', 'fakturiert'])
    expect(umbrechen('Immobilien Huber & Partner', 17)).toEqual(['Immobilien Huber', '& Partner'])
    // Ein langes Wort läuft nicht aus der Fläche
    expect(umbrechen('Stockwerkeigentümergemeinschaft Seeblick', 17)).toEqual(['Stockwerkeigentü…', 'Seeblick'])
    // Zu viel für zwei Zeilen: die zweite trägt das «…», auch wenn sie kurz ist
    expect(umbrechen('Bau und Holz AG Zweigstelle Ost', 9)).toEqual(['Bau und', 'Holz AG…'])
    expect(umbrechen('1–30 Tage', 7)).toEqual(['1–30', 'Tage'])
    expect(umbrechen('Meier', 17)).toEqual(['Meier'])
  })

  it('erkennt negative Werte für die Nulllinie', () => {
    expect(hatNegative(VORJAHR)).toBe(true)
    expect(hatNegative({ ...VORJAHR, reihen: [{ name: 'x', rolle: 'haupt', werte: [null, 1] }] })).toBe(false)
  })
})

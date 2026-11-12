import { describe, it, expect } from 'vitest'
import { GRUND_LABELS, abgewiesenTeile, abgewiesenZeile, grundLabel } from './mailEingangGruende'

// docs/specs/mail-eingang-triage.md §6.4 — Zähler «nicht ausgewertet».

describe('mailEingangGruende', () => {
  it('beschriftet jeden Grund, den der Server kennt', () => {
    for (const grund of ['absender_fehlt', 'fremde_domain', 'echtheit_unbestaetigt', 'adresse_unbekannt',
      'automatisch', 'ausgeschlossen', 'irrelevant', 'tageslimit']) {
      expect(GRUND_LABELS[grund], grund).toBeTruthy()
      expect(grundLabel(grund)).not.toBe(grund)
    }
  })

  it('lässt einen unbekannten Grund sichtbar, statt ihn zu verschlucken', () => {
    expect(grundLabel('neuer_grund')).toBe('neuer_grund')
    expect(abgewiesenTeile([{ grund: 'neuer_grund', anzahl: 2 }])).toEqual(['2 × neuer_grund'])
  })

  it('baut die Zeile über der Liste — Häufigstes zuerst, Nullen weg', () => {
    expect(abgewiesenZeile([
      { grund: 'automatisch', anzahl: 1 },
      { grund: 'fremde_domain', anzahl: 3 },
      { grund: 'tageslimit', anzahl: 0 },
    ], 7)).toBe(
      'In den letzten 7 Tagen nicht ausgewertet: 3 × nicht aus den Domains des Betriebs, '
      + '1 × automatische Antwort oder Massenmail',
    )
  })

  it('schweigt, wenn nichts abgewiesen wurde', () => {
    expect(abgewiesenZeile([], 7)).toBeNull()
    expect(abgewiesenZeile(null, 7)).toBeNull()
    expect(abgewiesenZeile([{ grund: 'irrelevant', anzahl: 0 }], 7)).toBeNull()
  })

  it('kommt mit einem Tag und mit fehlendem Zeitraum zurecht', () => {
    expect(abgewiesenZeile([{ grund: 'irrelevant', anzahl: 1 }], 1)).toBe('Am letzten Tag nicht ausgewertet: 1 × nichts für Werkora')
    expect(abgewiesenZeile([{ grund: 'irrelevant', anzahl: 1 }], 0)).toBe('Zuletzt nicht ausgewertet: 1 × nichts für Werkora')
  })
})

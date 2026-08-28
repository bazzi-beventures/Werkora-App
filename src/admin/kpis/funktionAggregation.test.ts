import { describe, it, expect } from 'vitest'
import { aggregiereFunktionen, verfuegbareMonate } from './funktionAggregation'
import type { KpiFunktionMonatRow } from './types'

function zeile(over: Partial<KpiFunktionMonatRow> = {}): KpiFunktionMonatRow {
  return {
    tenant_id: 't',
    funktion: 'Monteur',
    jahr_monat: '2026-08',
    jahr: 2026,
    monat: 8,
    stunden: 100,
    anzahl_mitarbeiter: 3,
    anzahl_projekte: 5,
    verrechnet_chf: 12000,
    stunden_ohne_satz: 0,
    lohnkosten_intern: 4000,
    stunden_ohne_lohn: 0,
    deckungsbeitrag: 8000,
    ...over,
  }
}

describe('aggregiereFunktionen', () => {
  it('summiert die Monate einer Funktion', () => {
    const rows = [
      zeile({ jahr_monat: '2026-07', stunden: 50, verrechnet_chf: 6000, lohnkosten_intern: 2000 }),
      zeile({ jahr_monat: '2026-08', stunden: 100, verrechnet_chf: 12000, lohnkosten_intern: 4000 }),
    ]
    const [monteur] = aggregiereFunktionen(rows)
    expect(monteur.stunden).toBe(150)
    expect(monteur.verrechnet_chf).toBe(18000)
    expect(monteur.lohnkosten_intern).toBe(6000)
    expect(monteur.deckungsbeitrag).toBe(12000)
    expect(monteur.db_pro_stunde).toBe(80)
    expect(monteur.marge_pct).toBeCloseTo(66.67, 1)
    expect(monteur.monate).toBe(2)
  })

  it('trennt die Funktionen und sortiert nach Stunden', () => {
    const rows = [
      zeile({ funktion: 'Lernender', stunden: 20 }),
      zeile({ funktion: 'Monteur', stunden: 200 }),
    ]
    expect(aggregiereFunktionen(rows).map((f) => f.funktion)).toEqual(['Monteur', 'Lernender'])
  })

  it('macht die Zeitraumsumme null, sobald ein Monat unbekannt ist', () => {
    // Ehrlichkeits-Regel: die Summe der übrigen Monate wäre zu tief, und niemand
    // sähe es der Zahl an. Ein zu tiefer Lohnwert macht jede Funktion rentabel.
    const rows = [
      zeile({ jahr_monat: '2026-07' }),
      zeile({ jahr_monat: '2026-08', lohnkosten_intern: null, stunden_ohne_lohn: 4 }),
    ]
    const [monteur] = aggregiereFunktionen(rows)
    expect(monteur.lohnkosten_intern).toBeNull()
    expect(monteur.deckungsbeitrag).toBeNull()
    expect(monteur.db_pro_stunde).toBeNull()
    expect(monteur.marge_pct).toBeNull()
    // Die Stunden bleiben bekannt — nur die Geldseite ist offen.
    expect(monteur.stunden).toBe(200)
    expect(monteur.stunden_ohne_lohn).toBe(4)
  })

  it('grenzt auf den Monatsbereich ein, Grenzen eingeschlossen', () => {
    const rows = [
      zeile({ jahr_monat: '2026-06', stunden: 10 }),
      zeile({ jahr_monat: '2026-07', stunden: 20 }),
      zeile({ jahr_monat: '2026-08', stunden: 40 }),
    ]
    expect(aggregiereFunktionen(rows, '2026-07', '2026-08')[0].stunden).toBe(60)
    expect(aggregiereFunktionen(rows, '', '2026-06')[0].stunden).toBe(10)
    expect(aggregiereFunktionen(rows, '2026-08', '')[0].stunden).toBe(40)
  })

  it('nimmt für die Personenzahl die grösste Monatsbesetzung', () => {
    // Addieren wäre falsch: dieselbe Person steht in jedem Monat.
    const rows = [
      zeile({ jahr_monat: '2026-07', anzahl_mitarbeiter: 2 }),
      zeile({ jahr_monat: '2026-08', anzahl_mitarbeiter: 3 }),
    ]
    expect(aggregiereFunktionen(rows)[0].anzahl_mitarbeiter).toBe(3)
  })

  it('gibt bei null Stunden keinen Stundenwert aus statt durch 0 zu teilen', () => {
    const rows = [zeile({ stunden: 0, verrechnet_chf: 0, lohnkosten_intern: 0 })]
    const [f] = aggregiereFunktionen(rows)
    expect(f.deckungsbeitrag).toBe(0)
    expect(f.db_pro_stunde).toBeNull()
    expect(f.marge_pct).toBeNull()
  })

  it('bleibt bei leerer Eingabe leer', () => {
    expect(aggregiereFunktionen([])).toEqual([])
  })
})

describe('verfuegbareMonate', () => {
  it('liefert die Monate eindeutig und absteigend', () => {
    const rows = [
      zeile({ jahr_monat: '2026-07' }),
      zeile({ jahr_monat: '2026-08', funktion: 'Lernender' }),
      zeile({ jahr_monat: '2026-08' }),
    ]
    expect(verfuegbareMonate(rows)).toEqual(['2026-08', '2026-07'])
  })
})

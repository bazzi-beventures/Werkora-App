import { describe, expect, it } from 'vitest'
import type { KpiGarantieRow } from './types'
import { garantieKennzahlen, gruppiere, kosten, nachLieferant, nachUrsache } from './garantieAggregation'

function fall(over: Partial<KpiGarantieRow> = {}): KpiGarantieRow {
  return {
    tenant_id: 't', fall_id: 'f', case_no: 1, reported_at: '2026-03-01', jahr: 2026,
    status: 'abgeschlossen', decision: 'anerkannt', cause: 'material',
    supplier_id: null, supplier_name: null, source_project_id: 'p',
    ursprung_nummer: 'P-1', ursprung_name: 'Storen', kunde_name: 'Meier',
    repair_project_id: 'r', reparatur_nummer: 'P-2', reparatur_name: 'Garantie: Storen',
    deadline_at: '2027-01-01', in_frist: true, stunden: 3, lohn_kosten: 240,
    material_kosten: 60, kosten: 300, umsatz: 0,
    ...over,
  }
}

describe('kosten', () => {
  it('summiert nur Fälle mit Reparatur-Projekt und zählt unbewertete getrennt', () => {
    expect(kosten([
      fall({ kosten: 300 }),
      fall({ kosten: '120.50' as unknown as number }),
      fall({ kosten: null }),
      fall({ repair_project_id: null, kosten: null }),
    ])).toEqual({ summe: 420.5, unvollstaendig: 1 })
  })
})

describe('garantieKennzahlen', () => {
  const rows = [
    fall({ status: 'gemeldet', decision: null, jahr: 2026, repair_project_id: null, kosten: null }),
    fall({ status: 'in_arbeit', decision: 'kulanz', jahr: 2026, kosten: 100 }),
    fall({ status: 'abgeschlossen', decision: 'anerkannt', jahr: 2026, kosten: 300 }),
    fall({ status: 'abgeschlossen', decision: 'abgelehnt', jahr: 2025, kosten: 50 }),
  ]

  it('zählt offene Fälle über alle Jahre, den Rest im gewählten Jahr', () => {
    const k = garantieKennzahlen(rows, 2026)
    expect(k.offen).toBe(2)
    expect(k.faelleJahr).toBe(3)
    expect(k.kostenJahr).toEqual({ summe: 400, unvollstaendig: 0 })
    // 1 anerkannt von 2 entschiedenen; der offene zählt nicht mit.
    expect(k.anteilAnerkannt).toBe(0.5)
    expect(k.kulanzJahr).toBe(1)
  })

  it('ohne Entscheide kein Anteil statt 0 %', () => {
    expect(garantieKennzahlen([fall({ decision: null })], 2026).anteilAnerkannt).toBeNull()
  })
})

describe('gruppiere', () => {
  it('nach Ursache, grösste Gruppe zuerst, fehlende Ursache benannt', () => {
    const g = gruppiere([
      fall({ cause: 'material', kosten: 100 }),
      fall({ cause: 'material', kosten: 50 }),
      fall({ cause: null, kosten: 10 }),
    ], nachUrsache)
    expect(g.map(z => [z.label, z.faelle, z.kosten])).toEqual([
      ['Material', 2, 150], ['Nicht erfasst', 1, 10],
    ])
  })

  it('nach Lieferant nur Fälle mit Lieferant', () => {
    const g = gruppiere([
      fall({ supplier_id: 's1', supplier_name: 'Griesser' }),
      fall({ supplier_id: null }),
    ], nachLieferant)
    expect(g).toHaveLength(1)
    expect(g[0].label).toBe('Griesser')
  })
})

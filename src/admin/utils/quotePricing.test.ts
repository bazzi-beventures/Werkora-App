import { describe, it, expect } from 'vitest'
import { parseNum, vkFromEk, factorToPct, pctToFactor, round2, lineTotal, computeTravelCost } from './quotePricing'
import type { TravelCostTable } from './quotePricing'

describe('parseNum', () => {
  it('akzeptiert Punkt und Schweizer Dezimalkomma', () => {
    expect(parseNum('12.50')).toBe(12.5)
    expect(parseNum('12,50')).toBe(12.5)
  })

  it('liefert 0 statt NaN bei leerer oder unlesbarer Eingabe', () => {
    expect(parseNum('')).toBe(0)
    expect(parseNum('abc')).toBe(0)
  })

  it('behält das Vorzeichen von Rabatt-Positionen', () => {
    expect(parseNum('-80,25')).toBe(-80.25)
  })
})

describe('vkFromEk', () => {
  it('rechnet VK = EK × (1 + Aufschlag), aufgerundet auf 0.05', () => {
    // Griesser-Beispiel aus dem Review: 513.18 × 1.75 = 898.065 → 898.10
    expect(vkFromEk(513.18, 75)).toBe(898.1)
  })

  it('rundet immer auf, nie ab', () => {
    expect(vkFromEk(100, 0)).toBe(100)        // 100.00 bleibt
    expect(vkFromEk(100.01, 0)).toBe(100.05)  // 100.01 → 100.05
    expect(vkFromEk(100.05, 0)).toBe(100.05)  // exakt auf Schritt
    expect(vkFromEk(100.06, 0)).toBe(100.1)   // → 100.10
  })

  it('liefert dieselben Preise wie compute_material_vk im Backend', () => {
    // Positionen aus Offerte OFF-2026-284 (EK × 1.5). Backend und Frontend haben
    // vorher unterschiedlich gerundet (0.01 vs 0.50) — jetzt identisch.
    expect(vkFromEk(299.29, 50)).toBe(448.95)
    expect(vkFromEk(349.64, 50)).toBe(524.5)
  })

  it('lässt einen bereits glatten Preis stehen (kein Float-Sprung)', () => {
    // 448.95 × 20 ist in Float 8979.000000000001 — naives Math.ceil ergäbe 449.00.
    for (const ek of [448.95, 100.1, 12.35, 0.05]) {
      expect(vkFromEk(ek, 0)).toBe(ek)
    }
  })

  it('behandelt Aufschlag 0 als reine Weitergabe des EK', () => {
    expect(vkFromEk(42.5, 0)).toBe(42.5)
  })

  it('liefert 0 bei EK 0', () => {
    expect(vkFromEk(0, 75)).toBe(0)
  })
})

describe('factorToPct / pctToFactor', () => {
  it('ist zueinander invers für typische Aufschläge', () => {
    for (const pct of [0, 20, 50, 75, 33.33]) {
      expect(factorToPct(pctToFactor(pct))).toBeCloseTo(pct, 2)
    }
  })

  it('factorToPct: 1.75 → 75', () => {
    expect(factorToPct(1.75)).toBe(75)
  })

  it('pctToFactor: 75 → 1.75', () => {
    expect(pctToFactor(75)).toBe(1.75)
  })

  it('vermeidet Float-Rauschen (1.2 statt 1.2000000000000002)', () => {
    expect(pctToFactor(20)).toBe(1.2)
    expect(factorToPct(1.2)).toBe(20)
  })
})

// ─────────────────────────────────────────────────────────────
// round2 / lineTotal — Spec §2.6
//
// Die Erwartungswerte sind IDENTISCH mit tests/unit/test_positions_rounding.py
// (services.positions.line_total). Genau das ist der Punkt: total_price wird im
// Formular gerechnet und vom Backend uebernommen — laufen die zwei Rundungen
// auseinander, steht auf der Offerte ein anderer Betrag als auf der Rechnung.
// ─────────────────────────────────────────────────────────────

describe('round2', () => {
  it('rundet die Haelfte kaufmaennisch auf (half-up), nicht wie Math.round auf dem Float', () => {
    // Math.round(2.675 * 100) ist 267 -> 2.67. Das Backend (Decimal) liefert 2.68.
    expect(round2(2.675)).toBe(2.68)
    expect(round2(10.395)).toBe(10.4)
    expect(round2(0.005)).toBe(0.01)
    expect(round2(0.015)).toBe(0.02)
    expect(round2(0.025)).toBe(0.03)
  })

  it('laesst unauffaellige Betraege unveraendert', () => {
    expect(round2(25)).toBe(25)
    expect(round2(150.5)).toBe(150.5)
    expect(round2(0)).toBe(0)
  })

  it('rundet negative Betraege von der Null weg (wie ROUND_HALF_UP)', () => {
    expect(round2(-2.675)).toBe(-2.68)
    expect(round2(-0.005)).toBe(-0.01)
  })

  it('liefert 0 statt NaN', () => {
    expect(round2(NaN)).toBe(0)
    expect(round2(Infinity)).toBe(0)
  })
})

describe('lineTotal', () => {
  it('stimmt Zeile fuer Zeile mit services.positions.line_total ueberein', () => {
    expect(lineTotal(1, 2.675)).toBe(2.68)
    expect(lineTotal(1, 10.395)).toBe(10.4)
    expect(lineTotal(3, 0.025)).toBe(0.08)
    expect(lineTotal(2.5, 1.002)).toBe(2.51)
    expect(lineTotal(2, 12.5)).toBe(25)
    expect(lineTotal(1.5, 100)).toBe(150)
    expect(lineTotal(0, 99.99)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// computeTravelCost — Spec §2.2
// ─────────────────────────────────────────────────────────────

describe('computeTravelCost', () => {
  // System-Default, wie ihn das Backend liefert (letzte Schwelle null = "und darueber").
  const DEFAULT_TABLE: TravelCostTable = [
    [1, 10], [5, 20], [8, 30], [11, 35], [14, 40],
    [17, 45], [22, 50], [24, 55], [29, 60], [43, 70],
    [null, 75],
  ]

  it('rundet die Distanz auf den naechsten ganzen km auf (wie compute_travel_cost_for_km)', () => {
    expect(computeTravelCost(1.0, DEFAULT_TABLE)).toBe(10)
    expect(computeTravelCost(1.2, DEFAULT_TABLE)).toBe(20)
    expect(computeTravelCost(5.0, DEFAULT_TABLE)).toBe(20)
    expect(computeTravelCost(5.1, DEFAULT_TABLE)).toBe(30)
  })

  it('nimmt fuer alles oberhalb der letzten Schwelle den letzten Preis', () => {
    expect(computeTravelCost(43, DEFAULT_TABLE)).toBe(70)
    expect(computeTravelCost(44, DEFAULT_TABLE)).toBe(75)
    expect(computeTravelCost(500, DEFAULT_TABLE)).toBe(75)
  })

  it('nutzt die Mandanten-Tabelle statt des System-Defaults', () => {
    // Genau der Fall aus der Spec: Vorschau zeigte CHF 40, offeriert wurden CHF 55.
    const tenantTable: TravelCostTable = [[10, 25], [20, 55], [50, 90]]
    expect(computeTravelCost(14, tenantTable)).toBe(55)
    expect(computeTravelCost(14, DEFAULT_TABLE)).toBe(40)
  })

  it('gilt ohne inf-Zeile bis unendlich (Mandanten-Tabellen haben keine)', () => {
    const tenantTable: TravelCostTable = [[10, 25], [20, 55]]
    expect(computeTravelCost(999, tenantTable)).toBe(55)
  })

  it('liefert 0 bei leerer Tabelle statt einer erfundenen Pauschale', () => {
    expect(computeTravelCost(12, [])).toBe(0)
  })
})

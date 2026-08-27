import { describe, it, expect } from 'vitest'
import { averageOrNull, finite, maxOrZero, percentOrNull, sumFieldsOrNull, sumOrNull } from './aggregate'

describe('finite', () => {
  it('lässt echte Zahlen durch', () => {
    expect(finite(0)).toBe(0)
    expect(finite(-12.5)).toBe(-12.5)
  })

  it('weist NaN ab — der Fehler, der als „CHF NaN" sichtbar wurde', () => {
    // typeof NaN === 'number': der alte Guard liess das durch und
    // NaN.toLocaleString() ergibt den String "NaN".
    expect(finite(NaN)).toBeNull()
  })

  it('weist Infinity, undefined, null und Strings ab', () => {
    expect(finite(Infinity)).toBeNull()
    expect(finite(undefined)).toBeNull()
    expect(finite(null)).toBeNull()
    expect(finite('42')).toBeNull()
  })
})

describe('sumOrNull', () => {
  it('summiert vollständige Zeilen', () => {
    expect(sumOrNull([{ v: 1 }, { v: 2.5 }], (r) => r.v)).toBe(3.5)
  })

  it('gibt für eine leere Liste 0 zurück — bekannte Null, keine Lücke', () => {
    expect(sumOrNull([], (r: { v: number }) => r.v)).toBe(0)
  })

  it('gibt null zurück, sobald ein Wert fehlt', () => {
    const rows = [{ v: 100 as number | null }, { v: null }, { v: 50 }]
    expect(sumOrNull(rows, (r) => r.v)).toBeNull()
  })

  it('gibt null statt NaN zurück, wenn die Spalte in der View fehlt', () => {
    // Regressionstest auf den Screenshot vom 2026-08-27: total_kosten_intern
    // existierte in vw_kpi_finanzen_monat nicht mehr, kam als undefined an,
    // und `0 + undefined` ergab NaN → „CHF NaN" auf der Kachel.
    const rows = [{ jahr: 2026 }, { jahr: 2026 }] as { jahr: number; fehlt?: number }[]
    const summe = sumOrNull(rows, (r) => r.fehlt)
    expect(summe).toBeNull()
    expect(Number.isNaN(summe as unknown as number)).toBe(false)
  })

  it('behandelt 0 als gültigen Wert, nicht als fehlend', () => {
    expect(sumOrNull([{ v: 0 }, { v: 0 }], (r) => r.v)).toBe(0)
  })
})

describe('sumFieldsOrNull', () => {
  it('summiert mehrere Spalten je Zeile', () => {
    const rows = [{ a: 10, b: 5 }, { a: 1, b: 2 }]
    expect(sumFieldsOrNull(rows, [(r) => r.a, (r) => r.b])).toBe(18)
  })

  it('gibt null zurück, wenn in einer Zeile ein Summand fehlt', () => {
    const rows = [{ a: 10, b: 5 as number | null }, { a: 1, b: null }]
    expect(sumFieldsOrNull(rows, [(r) => r.a, (r) => r.b])).toBeNull()
  })
})

describe('maxOrZero', () => {
  it('findet den grössten Marker', () => {
    expect(maxOrZero([{ n: 1 }, { n: 7 }, { n: 3 }], (r) => r.n)).toBe(7)
  })

  it('ignoriert fehlende Werte statt NaN zu erzeugen', () => {
    // Math.max(0, undefined) === NaN, und NaN > 0 ist false: so konnte das
    // Datenqualitäts-Banner nie erscheinen.
    const rows = [{}, { n: 2 }] as { n?: number }[]
    expect(maxOrZero(rows, (r) => r.n)).toBe(2)
  })

  it('gibt 0 zurück, wenn nichts vorhanden ist', () => {
    expect(maxOrZero([], (r: { n: number }) => r.n)).toBe(0)
  })
})

describe('averageOrNull', () => {
  it('mittelt nur über Zeilen mit Wert > 0', () => {
    expect(averageOrNull([{ t: 4 }, { t: 0 }, { t: 8 }], (r) => r.t)).toBe(6)
  })

  it('gibt null zurück, wenn keine Zeile beiträgt', () => {
    // „Keine bezahlte Rechnung" ist keine Laufzeit von null Tagen.
    expect(averageOrNull([{ t: 0 }], (r) => r.t)).toBeNull()
  })
})

describe('percentOrNull', () => {
  it('rechnet den Anteil', () => {
    expect(percentOrNull(25, 200)).toBe(12.5)
  })

  it('gibt null zurück bei fehlender Seite oder Basis 0', () => {
    expect(percentOrNull(null, 100)).toBeNull()
    expect(percentOrNull(10, null)).toBeNull()
    expect(percentOrNull(10, 0)).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import {
  averageOrNull,
  finite,
  imMonatsbereich,
  istFakturiert,
  matchesSuche,
  maxOrZero,
  percentOrNull,
  sumFieldsOrNull,
  sumOrNull,
} from './aggregate'

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

describe('istFakturiert', () => {
  it('erkennt Projekte mit gestelltem Umsatz', () => {
    expect(istFakturiert(1500)).toBe(true)
  })

  it('behandelt 0 und null als nicht fakturiert', () => {
    // Genau diese Projekte laufen zwangsläufig ins Minus: der Aufwand ist
    // gebucht, der Umsatz noch nicht. Sie fluteten die „Schwächste 5"-Liste.
    expect(istFakturiert(0)).toBe(false)
    expect(istFakturiert(null)).toBe(false)
    expect(istFakturiert(undefined)).toBe(false)
  })

  it('lässt sich von NaN nicht täuschen', () => {
    expect(istFakturiert(NaN)).toBe(false)
  })
})

describe('matchesSuche', () => {
  it('trifft über mehrere Felder, case-insensitiv', () => {
    const felder = ['260768', 'Birchler Seuzach', 'Meier AG']
    expect(matchesSuche('birchler', felder)).toBe(true)
    expect(matchesSuche('MEIER', felder)).toBe(true)
  })

  it('findet über die Projektnummer', () => {
    // Der eigentliche Zweck: Projektnamen sind seit Migration 20260807b nicht
    // mehr eindeutig — die Nummer unterscheidet zwei gleichnamige Projekte.
    expect(matchesSuche('260768', ['260768', 'Birchler Seuzach', null])).toBe(true)
    expect(matchesSuche('260768', ['260999', 'Birchler Seuzach', null])).toBe(false)
  })

  it('trifft alles bei leerem oder blossem Leerzeichen-Begriff', () => {
    expect(matchesSuche('', ['irgendwas'])).toBe(true)
    expect(matchesSuche('   ', ['irgendwas'])).toBe(true)
  })

  it('ignoriert leere Felder statt über „null" zu stolpern', () => {
    expect(matchesSuche('null', [null, undefined, 'Projekt'])).toBe(false)
  })
})

describe('imMonatsbereich', () => {
  it('lässt bei offenen Grenzen alles durch', () => {
    expect(imMonatsbereich('2026-05', '', '')).toBe(true)
  })

  it('grenzt nach unten und oben ab, Grenzen eingeschlossen', () => {
    expect(imMonatsbereich('2026-05', '2026-05', '2026-07')).toBe(true)
    expect(imMonatsbereich('2026-07', '2026-05', '2026-07')).toBe(true)
    expect(imMonatsbereich('2026-04', '2026-05', '2026-07')).toBe(false)
    expect(imMonatsbereich('2026-08', '2026-05', '2026-07')).toBe(false)
  })

  it('funktioniert mit nur einer Grenze', () => {
    expect(imMonatsbereich('2026-09', '2026-05', '')).toBe(true)
    expect(imMonatsbereich('2026-01', '2026-05', '')).toBe(false)
    expect(imMonatsbereich('2026-01', '', '2026-05')).toBe(true)
  })

  it('vergleicht über den Jahreswechsel korrekt', () => {
    // Der Grund für das feste 'YYYY-MM'-Format: als String verglichen stimmt
    // die Reihenfolge, ein zweistelliger Monat wird nicht als Zahl gelesen.
    expect(imMonatsbereich('2026-02', '2025-10', '2026-03')).toBe(true)
    expect(imMonatsbereich('2025-09', '2025-10', '2026-03')).toBe(false)
  })
})

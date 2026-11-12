import { describe, expect, it } from 'vitest'
import {
  anzahlungPayload, generateOptionsPayload, hasActiveInvoice, invoiceModeOptions,
  defaultCheckedReports, invoiceModePayload, parseAnzahlungPct, reportSelectionPayload,
  ANZAHLUNG_VORGABE, parseAnzahlung, parseAnzahlungBetrag,
} from './invoiceMode'

describe('hasActiveInvoice', () => {
  it('ohne Rechnung stellt sich die Frage nicht', () => {
    expect(hasActiveInvoice([])).toBe(false)
  })

  it('archivierte Rechnungen zählen nicht', () => {
    expect(hasActiveInvoice([{ status: 'archiviert' }])).toBe(false)
  })

  it('eine Anzahlung allein ist keine Rechnung, die man ersetzen könnte', () => {
    expect(hasActiveInvoice([{ status: 'gesendet', invoice_kind: 'anzahlung' }])).toBe(false)
  })

  it.each(['ausstehend', 'offen', 'gesendet', 'bezahlt'])('%s zählt', status => {
    expect(hasActiveInvoice([{ status: 'archiviert' }, { status }])).toBe(true)
  })
})

describe('invoiceModeOptions', () => {
  it('ohne gültige Rechnung: Rechnung oder Anzahlung', () => {
    expect(invoiceModeOptions(false)).toEqual(['replace', 'anzahlung'])
  })
  it('mit Rechnung zusätzlich «weitere Rechnung»', () => {
    expect(invoiceModeOptions(true)).toEqual(['replace', 'additional', 'anzahlung'])
  })
})

describe('invoiceModePayload', () => {
  it('Neufassung schickt nichts mit (Alt-Verhalten)', () => {
    expect(invoiceModePayload('replace')).toEqual({})
  })
  it('weitere Rechnung setzt additional', () => {
    expect(invoiceModePayload('additional')).toEqual({ additional: true })
  })
  it('Anzahlung setzt kind', () => {
    expect(invoiceModePayload('anzahlung')).toEqual({ kind: 'anzahlung' })
  })
})

describe('reportSelectionPayload', () => {
  it('alle angehakt → Automatik', () => {
    expect(reportSelectionPayload([1, 2], [2, 1])).toBeUndefined()
  })
  it('nicht geladen → Automatik', () => {
    expect(reportSelectionPayload(null, [])).toBeUndefined()
  })
  it('Teilauswahl → genau diese', () => {
    expect(reportSelectionPayload([1, 2, 3], [3, 1])).toEqual([1, 3])
  })
})

describe('anzahlungPayload', () => {
  it('nicht geladen → weglassen, der Server zieht alle offenen ab', () => {
    expect(anzahlungPayload(null, [])).toBeUndefined()
  })
  it('abgewählt → leere Liste', () => {
    expect(anzahlungPayload([{ id: 10 }], [])).toEqual([])
  })
  it('angehakt → diese', () => {
    expect(anzahlungPayload([{ id: 10 }, { id: 11 }], [11])).toEqual([11])
  })
})

describe('parseAnzahlungPct', () => {
  it.each([['50', 50], ['33,5', 33.5], [' 10 ', 10]])('%s → %s', (raw, n) => {
    expect(parseAnzahlungPct(raw)).toBe(n)
  })
  it.each(['0', '100', '', 'x', '-5'])('%s ist ungültig', raw => {
    expect(parseAnzahlungPct(raw)).toBeNull()
  })
})

describe('parseAnzahlungBetrag (WS-41)', () => {
  it.each([
    ['9953.30', 9953.3], ["9'953.30", 9953.3], ['9953,30', 9953.3], ['9 953.30', 9953.3],
    ['500', 500], ['0.05', 0.05], ["1’253.35", 1253.35],
  ])('%s → %s', (raw, n) => {
    expect(parseAnzahlungBetrag(raw)).toBe(n)
  })
  it.each(['', '0', '-5', 'x', '100.02', '1.234', '12.3.4'])('%s ist ungültig', raw => {
    expect(parseAnzahlungBetrag(raw)).toBeNull()
  })
})

describe('parseAnzahlung', () => {
  it('nimmt nur das gewählte Feld', () => {
    expect(parseAnzahlung(ANZAHLUNG_VORGABE)).toEqual({ anzahlungPct: 50 })
    expect(parseAnzahlung({ art: 'betrag', pct: '50', betrag: "9'953.30" })).toEqual({ anzahlungBetrag: 9953.3 })
    expect(parseAnzahlung({ art: 'betrag', pct: '50', betrag: '' })).toBeNull()
    expect(parseAnzahlung({ art: 'pct', pct: '150', betrag: '500' })).toBeNull()
  })
})

describe('generateOptionsPayload', () => {
  it('Anzahlung als Betrag schickt nur den Betrag', () => {
    const body = JSON.parse(JSON.stringify(generateOptionsPayload({
      mode: 'anzahlung', anzahlungBetrag: 9953.3, quoteIds: [3],
    })))
    expect(body).toEqual({ quote_ids: [3], kind: 'anzahlung', anzahlung_betrag: 9953.3 })
  })
  it('Anzahlung trägt nur Offerten-Auswahl und Satz', () => {
    expect(generateOptionsPayload({
      mode: 'anzahlung', anzahlungPct: 50, quoteIds: [3], workDescription: 'x', reportIds: [1],
    })).toEqual({ quote_ids: [3], kind: 'anzahlung', anzahlung_pct: 50, anzahlung_betrag: undefined })
  })
  it('abgewählte Fahrzeitkosten gehen mit, angehakte nicht', () => {
    expect(generateOptionsPayload({ mode: 'replace', includeTravel: false })).toMatchObject({ include_travel: false })
    expect(generateOptionsPayload({ mode: 'replace', includeTravel: true })).not.toHaveProperty('include_travel')
  })
  it('weitere Rechnung mit Rapport-Auswahl und ohne Abzug', () => {
    expect(generateOptionsPayload({
      mode: 'additional', reportIds: [1], anzahlungIds: [], workDescription: '',
    })).toEqual({
      quote_ids: undefined, work_description: '', report_ids: [1], anzahlung_ids: [],
      additional: true,
    })
  })
})

describe('defaultCheckedReports — Garantie-Rapporte nicht vorgewählt (WW-33)', () => {
  const r = (id: number, is_warranty = false) => ({ id, is_warranty })

  it('hakt alle ausser den Garantie-Rapporten an', () => {
    expect(defaultCheckedReports([r(1), r(2, true), r(3)])).toEqual([1, 3])
  })

  it('ein einzelner Rapport bleibt angehakt — die Auswahl ist dann gar nicht zu sehen', () => {
    expect(defaultCheckedReports([r(7, true)])).toEqual([7])
  })

  it('nur Garantie-Rapporte: alle angehakt, sonst stünde der Dialog ohne Auswahl da', () => {
    expect(defaultCheckedReports([r(1, true), r(2, true)])).toEqual([1, 2])
  })

  it('älterer Server ohne das Feld und Ladefehler: wie bisher', () => {
    expect(defaultCheckedReports([{ id: 1 }, { id: 2 }])).toEqual([1, 2])
    expect(defaultCheckedReports(null)).toEqual([])
  })

  it('die abgewählten Garantie-Rapporte gehen als echte Auswahl an den Server', () => {
    const list = [r(1), r(2, true)]
    expect(reportSelectionPayload(list.map(x => x.id), defaultCheckedReports(list))).toEqual([1])
  })
})

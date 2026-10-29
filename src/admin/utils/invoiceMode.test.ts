import { describe, expect, it } from 'vitest'
import {
  anzahlungPayload, generateOptionsPayload, hasActiveInvoice, invoiceModeOptions,
  invoiceModePayload, parseAnzahlungPct, reportSelectionPayload,
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

describe('generateOptionsPayload', () => {
  it('Anzahlung trägt nur Offerten-Auswahl und Satz', () => {
    expect(generateOptionsPayload({
      mode: 'anzahlung', anzahlungPct: 50, quoteIds: [3], workDescription: 'x', reportIds: [1],
    })).toEqual({ quote_ids: [3], kind: 'anzahlung', anzahlung_pct: 50 })
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

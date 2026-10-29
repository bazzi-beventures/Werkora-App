import { describe, expect, it } from 'vitest'
import { hasActiveInvoice, invoiceModePayload } from './invoiceMode'

describe('hasActiveInvoice', () => {
  it('ohne Rechnung stellt sich die Frage nicht', () => {
    expect(hasActiveInvoice([])).toBe(false)
  })

  it('archivierte Rechnungen zählen nicht', () => {
    expect(hasActiveInvoice([{ status: 'archiviert' }])).toBe(false)
  })

  it.each(['ausstehend', 'offen', 'gesendet', 'bezahlt'])('%s zählt', status => {
    expect(hasActiveInvoice([{ status: 'archiviert' }, { status }])).toBe(true)
  })
})

describe('invoiceModePayload', () => {
  it('Neufassung schickt nichts mit (Alt-Verhalten)', () => {
    expect(invoiceModePayload('replace')).toEqual({})
  })

  it('weitere Rechnung setzt additional', () => {
    expect(invoiceModePayload('additional')).toEqual({ additional: true })
  })
})

import { describe, it, expect } from 'vitest'
import { countOpenInvoices, isInvoiceOpen, openInvoicesHint } from './openInvoices'

describe('isInvoiceOpen', () => {
  it('zählt ausstehend, offen und gesendet als offen', () => {
    expect(['ausstehend', 'offen', 'gesendet'].every(isInvoiceOpen)).toBe(true)
  })

  it('zählt bezahlt, archiviert und inaktiv nicht mit', () => {
    expect(['bezahlt', 'archiviert', 'inaktiv'].some(isInvoiceOpen)).toBe(false)
  })

  it('verträgt fehlenden Status', () => {
    expect(isInvoiceOpen(null)).toBe(false)
    expect(isInvoiceOpen(undefined)).toBe(false)
  })
})

describe('countOpenInvoices', () => {
  it('zählt nur die offenen Rechnungen', () => {
    expect(countOpenInvoices([
      { status: 'bezahlt' }, { status: 'gesendet' }, { status: 'archiviert' }, { status: 'offen' },
    ])).toBe(2)
  })
})

describe('openInvoicesHint', () => {
  it('bleibt leer, wenn nichts offen ist', () => {
    expect(openInvoicesHint(0)).toBe('')
    expect(openInvoicesHint(-1)).toBe('')
  })

  it('formuliert Einzahl und Mehrzahl', () => {
    expect(openInvoicesHint(1)).toBe('Achtung: Für dieses Projekt ist noch 1 Rechnung offen.')
    expect(openInvoicesHint(3)).toBe('Achtung: Für dieses Projekt sind noch 3 Rechnungen offen.')
  })
})

import { describe, expect, it } from 'vitest'
import { checkPaidAmount, paidAmountDefault, paidDeduction, paidNote } from './paidAmount'

describe('checkPaidAmount (WW-19: Kunde zieht Skonto ab)', () => {
  it('voller Betrag und leeres Feld heissen «voll bezahlt» (null)', () => {
    const voll = { ok: true, amount: null, deduction: 0, pct: 0, overpayment: 0 }
    expect(checkPaidAmount(paidAmountDefault(1000), 1000)).toEqual(voll)
    expect(checkPaidAmount('  ', 1000)).toEqual(voll)
  })

  it('Skontoabzug: Betrag, Abzug und Prozent', () => {
    const r = checkPaidAmount("1'960,00", 2000)
    expect(r).toMatchObject({ ok: true, amount: 1960, deduction: 40 })
    expect(r.ok && r.pct).toBeCloseTo(2)
  })

  it('Überzahlung (WS-49): Betrag geht ans Backend, Mehrbetrag für die Anzeige', () => {
    expect(checkPaidAmount("2'050", 2000)).toEqual({ ok: true, amount: 2050, deduction: 0, pct: 0, overpayment: 50 })
    expect(checkPaidAmount('2000.01', 2000)).toMatchObject({ ok: true, overpayment: 0.01 })
  })

  it('lehnt Null und Unsinn ab', () => {
    expect(checkPaidAmount('0', 2000).ok).toBe(false)
    expect(checkPaidAmount('abc', 2000).ok).toBe(false)
  })
})

describe('paidDeduction', () => {
  it('nur bei weniger Eingang als verrechnet', () => {
    expect(paidDeduction({ total_amount: 1000, paid_amount: 980 })).toBe(20)
    expect(paidDeduction({ total_amount: 1000, paid_amount: null })).toBeNull()
    expect(paidDeduction({ total_amount: 1000, paid_amount: 1000 })).toBeNull()
  })
})

describe('paidNote', () => {
  it('Überzahlung vor Skonto, sonst nichts', () => {
    expect(paidNote({ total_amount: 1000, paid_amount: null, ueberzahlung: 50 })?.text).toMatch(/^Überzahlung CHF/)
    expect(paidNote({ total_amount: 1000, paid_amount: 980 })?.text).toMatch(/^erhalten CHF/)
    expect(paidNote({ total_amount: 1000, paid_amount: null, ueberzahlung: null })).toBeNull()
  })
})

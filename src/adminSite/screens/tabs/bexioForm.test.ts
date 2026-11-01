import { describe, it, expect } from 'vitest'
import {
  expiryText, jobActions, paymentDirection, revenueAccounts, setWorkTypeAccount, withPaymentDirection,
} from './bexioForm'
import type { BexioCatalog, BexioJob } from '../../tenantScopedApi'

// docs/specs/bexio-anbindung.md §6.8, §8.1

const catalog = {
  accounts: [
    { id: 310, account_no: '3100', name: 'Ertrag aus Reparaturen', is_active: true },
    { id: 300, account_no: '3000', name: 'Ertrag aus Neumontagen', is_active: true },
    { id: 391, account_no: '3901', name: 'Veränderung Garantieleistungen', is_active: true },
    { id: 340, account_no: '3400', name: 'Dienstleistungsertrag', is_active: false },
  ],
} as unknown as BexioCatalog

const job = (over: Partial<BexioJob>): BexioJob => ({
  id: 1, kind: 'invoice_issue', local_id: '812', status: 'needs_attention', attempts: 1,
  last_error: null, created_at: '', finished_at: null, ...over,
})

describe('bexioForm', () => {
  it('bietet nur aktive Ertragskonten ohne Abschlusskonten an, sortiert', () => {
    expect(revenueAccounts(catalog).map(a => a.account_no)).toEqual(['3000', '3100'])
  })

  it('«Standardkonto» entfernt die Zuordnung statt null zu speichern', () => {
    const m = setWorkTypeAccount({ Neumontage: 300, Reparatur: 310 }, 'Reparatur', null)
    expect(m).toEqual({ Neumontage: 300 })
    expect(setWorkTypeAccount(m, 'Umbau', 300)).toEqual({ Neumontage: 300, Umbau: 300 })
  })

  it('bietet je Auftrag die passenden Knöpfe an', () => {
    expect(jobActions(job({ last_error: 'Kunde «Muster AG» steht 2× in bexio (#1, #2)' })))
      .toEqual({ retry: true, linkContact: true, cancelInBexio: false })
    expect(jobActions(job({ last_error: 'bexio lehnt ab' })).linkContact).toBe(false)
    expect(jobActions(job({ kind: 'invoice_cancelled' })))
      .toEqual({ retry: false, linkContact: false, cancelInBexio: true })
    expect(jobActions(job({ status: 'done' }))).toEqual({ retry: false, linkContact: false, cancelInBexio: false })
  })

  it('Zahlungen melden und holen schliessen sich aus', () => {
    expect(paymentDirection({ payments_push: true, payments_pull: false })).toBe('push')
    expect(paymentDirection({ payments_push: true, payments_pull: true })).toBe('pull')
    expect(paymentDirection({ payments_push: false, payments_pull: false })).toBe('none')
    const d = withPaymentDirection({ payments_push: true, payments_pull: false } as never, 'pull')
    expect(d).toMatchObject({ payments_push: false, payments_pull: true })
  })

  it('warnt 14 Tage vor dem Ablauf des Tokens', () => {
    const now = new Date('2026-10-31T12:00:00Z')
    expect(expiryText('2027-01-01T00:00:00Z', now)).toMatchObject({ warn: false })
    expect(expiryText('2026-11-10T00:00:00Z', now)).toMatchObject({ warn: true })
    expect(expiryText('2026-10-01T00:00:00Z', now)?.text).toMatch(/abgelaufen/)
    expect(expiryText(null)).toBeNull()
  })
})

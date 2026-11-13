// Offertenliste: Sortieren per Spaltenkopf.
//
// Die Liste kommt seitenweise vom Server — sortiert wird deshalb dort, nicht im
// Browser (sonst stünde die teuerste Offerte womöglich auf Seite 9). Getestet
// wird, dass der Klick den richtigen Schlüssel schickt, die Richtung dreht und
// auf Seite 1 springt; die Reihenfolge selbst macht Postgres
// (tests/unit/test_admin_list_paging.py).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Quote } from '../../api/admin/quotes'
import type { ListPageQuery } from '../../api/admin/listPage'

vi.mock('../useIsMobile', () => ({ useIsMobile: () => false }))

const listQuotesPage = vi.fn()
vi.mock('../../api/admin/quotes', () => ({
  listQuotesPage: (q: ListPageQuery) => listQuotesPage(q),
  getQuoteDetail: vi.fn(),
  setQuoteStatus: vi.fn(),
  sendQuoteRejection: vi.fn(),
  markQuoteSentByPost: vi.fn(),
}))
vi.mock('../../api/admin/staff', () => ({ getAdminStaff: () => Promise.resolve([]) }))
vi.mock('../../api/auth', () => ({ getMe: () => Promise.resolve({}) }))
vi.mock('../../api/modules', () => ({ getFeature: () => null, isFeatureEnabled: () => false }))
vi.mock('./quotes/QuoteEditForm', () => ({ QuoteEditForm: () => <div /> }))
vi.mock('./quotes/QuoteCreateForm', () => ({ QuoteCreateForm: () => <div /> }))

import QuotesScreen from './QuotesScreen'

function quote(id: number): Quote {
  return {
    id, quote_number: `OFF-2026-${id}`, project_name: `Projekt ${id}`,
    total_amount: 1000, status: 'gesendet', created_at: '2026-11-07T08:00:00Z',
    reminder_sent_at: null, projektleiter_id: null,
  }
}

function lastQuery(): ListPageQuery {
  const calls = listQuotesPage.mock.calls
  return calls[calls.length - 1][0] as ListPageQuery
}

beforeEach(() => {
  listQuotesPage.mockReset().mockImplementation(async (q: ListPageQuery) => ({
    rows: [quote(q.page * 100 + 1)], total: 1071, page: q.page, page_size: 50,
  }))
})

describe('QuotesScreen — Sortierung', () => {
  it('startet wie bisher mit den neuesten zuerst', async () => {
    render(<QuotesScreen />)
    await screen.findByText('Projekt 101')
    expect(lastQuery()).toMatchObject({ sort: 'created_at', dir: 'desc' })
    expect(screen.getByRole('columnheader', { name: /Erstellt/ }).getAttribute('aria-sort')).toBe('descending')
  })

  it.each([
    ['Nr.', 'quote_number'],
    ['Projekt', 'project_name'],
    ['Kunde', 'customer_name'],
    ['Projektleiter', 'projektleiter'],
    ['Betrag', 'total_amount'],
    ['Status', 'status'],
  ])('Klick auf «%s» sortiert nach %s, aufsteigend', async (label, key) => {
    const user = userEvent.setup()
    render(<QuotesScreen />)
    await screen.findByText('Projekt 101')
    // Exakt: der Pfeil ist aria-hidden, «Projekt» darf «Projektleiter» nicht treffen.
    const kopf = screen.getByRole('columnheader', { name: label })
    await user.click(kopf.querySelector('button')!)
    await waitFor(() => expect(lastQuery()).toMatchObject({ sort: key, dir: 'asc' }))
  })

  it('dreht beim zweiten Klick die Richtung und springt auf Seite 1', async () => {
    const user = userEvent.setup()
    render(<QuotesScreen />)
    await screen.findByText('Projekt 101')
    await user.click(screen.getByRole('button', { name: 'Weiter →' }))
    await screen.findByText('Projekt 201')

    const before = listQuotesPage.mock.calls.length
    await user.click(screen.getByRole('button', { name: /^Betrag/ }))
    await waitFor(() => expect(lastQuery()).toMatchObject({ sort: 'total_amount', dir: 'asc', page: 1 }))
    // Eine Abfrage, nicht erst Seite 2 in der neuen Reihenfolge und dann Seite 1.
    expect(listQuotesPage.mock.calls.length).toBe(before + 1)
    expect(screen.getByRole('columnheader', { name: /^Betrag/ }).getAttribute('aria-sort')).toBe('ascending')

    await user.click(screen.getByRole('button', { name: /^Betrag/ }))
    await waitFor(() => expect(lastQuery()).toMatchObject({ sort: 'total_amount', dir: 'desc' }))
    expect(screen.getByRole('columnheader', { name: /^Betrag/ }).getAttribute('aria-sort')).toBe('descending')
  })
})

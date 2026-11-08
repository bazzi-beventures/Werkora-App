// Offertenliste seitenweise (Server filtert, 50 Zeilen je Seite).
//
// Bis 2026-11 lud die Liste den ganzen Bestand und filterte im Browser — bei über
// tausend Offerten spürbar langsam. Der Regressionswert hier: Blättern, Filter
// und Suche kommen beim Server an, ein Filterwechsel springt auf Seite 1, und ein
// Ladefehler sieht nicht aus wie «keine Offerten».

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
vi.mock('../../api/admin/staff', () => ({
  getAdminStaff: () => Promise.resolve([{ id: 's-marc', name: 'Marc Caduff', projektleiter: true }]),
}))
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

describe('QuotesScreen — seitenweise', () => {
  it('lädt Seite 1 mit den vorgewählten Status und zeigt die Gesamtzahl', async () => {
    render(<QuotesScreen />)
    expect(await screen.findByText('1071 Einträge')).toBeTruthy()
    expect(screen.getByText('1–50 von 1071')).toBeTruthy()
    expect(screen.getByText('Seite 1 / 22')).toBeTruthy()

    const q = lastQuery()
    expect(q.page).toBe(1)
    expect(q.pageSize).toBe(50)
    // Archivierte sind wie bisher ausgeblendet.
    expect([...q.statuses].sort()).toEqual(['abgelehnt', 'absage', 'akzeptiert', 'entwurf', 'gesendet'])
  })

  it('blättert auf die nächste Seite', async () => {
    const user = userEvent.setup()
    render(<QuotesScreen />)
    await screen.findByText('Projekt 101')

    await user.click(screen.getByRole('button', { name: 'Weiter →' }))
    expect(await screen.findByText('Projekt 201')).toBeTruthy()
    expect(lastQuery().page).toBe(2)
    expect(screen.getByText('51–100 von 1071')).toBeTruthy()
  })

  it('springt bei einem Filterwechsel auf Seite 1 — mit einer einzigen Abfrage', async () => {
    const user = userEvent.setup()
    render(<QuotesScreen />)
    await screen.findByText('Projekt 101')
    await user.click(screen.getByRole('button', { name: 'Weiter →' }))
    await screen.findByText('Projekt 201')

    const before = listQuotesPage.mock.calls.length
    await user.selectOptions(screen.getByTitle('Nach Projektleiter filtern'), 's-marc')
    await waitFor(() => expect(lastQuery().projektleiterId).toBe('s-marc'))
    expect(lastQuery().page).toBe(1)
    // Nicht erst Seite 2 mit dem neuen Filter und dann Seite 1.
    expect(listQuotesPage.mock.calls.length).toBe(before + 1)
  })

  it('sucht entprellt auf dem Server und beginnt wieder bei Seite 1', async () => {
    const user = userEvent.setup()
    render(<QuotesScreen />)
    await screen.findByText('Projekt 101')
    await user.click(screen.getByRole('button', { name: 'Weiter →' }))
    await screen.findByText('Projekt 201')

    const before = listQuotesPage.mock.calls.length
    await user.type(screen.getByPlaceholderText(/such/i), 'lufingen')
    await waitFor(() => expect(lastQuery().search).toBe('lufingen'))
    expect(lastQuery().page).toBe(1)
    // Ein Roundtrip für das ganze Wort, nicht einer je Buchstabe.
    expect(listQuotesPage.mock.calls.length).toBe(before + 1)
  })

  it('sagt es, wenn die Liste nicht geladen werden konnte', async () => {
    listQuotesPage.mockRejectedValue(new Error('503'))
    render(<QuotesScreen />)
    expect(await screen.findByText('Offerten konnten nicht geladen werden.')).toBeTruthy()
    expect(screen.queryByText('Keine Offerten gefunden.')).toBeNull()
  })

  it('ohne Treffer keine Blätterleiste', async () => {
    listQuotesPage.mockResolvedValue({ rows: [], total: 0, page: 1, page_size: 50 })
    render(<QuotesScreen />)
    expect(await screen.findByText('Keine Offerten gefunden.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Weiter →' })).toBeNull()
  })
})

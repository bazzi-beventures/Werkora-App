// Spalte «Projektleiter» in der Offertenliste.
//
// Gezeigt wird, wer die Offerte erstellt hat — der Snapshot `projektleiter_name`,
// der auch auf dem PDF steht. Nur alte Offerten ohne Snapshot fallen auf den
// heutigen Projektleiter des Projekts zurück. Den Unterschied hält dieser Test
// fest: ein Wechsel des Projektleiters darf die Spalte alter Offerten nicht
// umschreiben.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Quote } from '../../api/admin/quotes'

vi.mock('../useIsMobile', () => ({ useIsMobile: () => false }))

const listQuotes = vi.fn()
vi.mock('../../api/admin/quotes', () => ({
  // Die Liste kommt seitenweise (listQuotesPage); die Tests reichen weiter ein
  // Array und bekommen es als eine Seite zurück.
  listQuotesPage: async (q: unknown) => {
    const rows = await listQuotes(q)
    return { rows, total: rows.length, page: 1, page_size: 50 }
  },
  getQuoteDetail: vi.fn(),
  setQuoteStatus: vi.fn(),
  sendQuoteRejection: vi.fn(),
  markQuoteSentByPost: vi.fn(),
}))
vi.mock('../../api/admin/staff', () => ({
  getAdminStaff: () => Promise.resolve([
    { id: 's-marvin', name: 'Marvin Walser', projektleiter: true },
    { id: 's-luca', name: 'Luca Bazzi', projektleiter: false },
  ]),
}))
vi.mock('../../api/auth', () => ({ getMe: () => Promise.resolve({}) }))
vi.mock('../../api/modules', () => ({ getFeature: () => null, isFeatureEnabled: () => false }))
vi.mock('./quotes/QuoteEditForm', () => ({ QuoteEditForm: () => <div /> }))
vi.mock('./quotes/QuoteCreateForm', () => ({ QuoteCreateForm: () => <div /> }))

import QuotesScreen from './QuotesScreen'

function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: 1, quote_number: 'OFF-2026-825', project_name: '241556 Gsell Seuzach',
    total_amount: 1615.1, status: 'akzeptiert', created_at: '2026-09-28T08:00:00Z',
    reminder_sent_at: null, projektleiter_id: 's-luca', projektleiter_name: 'Marvin Walser',
    customer_name: 'Gsell Herbert',
    ...over,
  }
}

function zeile(projekt: string): HTMLElement {
  return screen.getByText(projekt).closest('tr') as HTMLElement
}

beforeEach(() => {
  listQuotes.mockReset()
})

describe('QuotesScreen — Spalte Projektleiter', () => {
  it('zeigt den Projektleiter, der die Offerte erstellt hat', async () => {
    listQuotes.mockResolvedValue([quote()])
    render(<QuotesScreen />)
    await screen.findByText('241556 Gsell Seuzach')

    expect(screen.getByRole('columnheader', { name: 'Projektleiter' })).toBeTruthy()
    // Snapshot gewinnt gegen den heutigen PL des Projekts (s-luca).
    expect(within(zeile('241556 Gsell Seuzach')).getByText('Marvin Walser')).toBeTruthy()
    expect(within(zeile('241556 Gsell Seuzach')).queryByText('Luca Bazzi')).toBeNull()
  })

  it('fällt bei alten Offerten ohne Snapshot auf den heutigen Projektleiter zurück', async () => {
    listQuotes.mockResolvedValue([quote({ projektleiter_name: null })])
    render(<QuotesScreen />)
    await screen.findByText('241556 Gsell Seuzach')
    // Luca trägt kein PL-Häkchen mehr — aufgelöst wird trotzdem.
    expect(await within(zeile('241556 Gsell Seuzach')).findByText('Luca Bazzi')).toBeTruthy()
  })

  // Gesucht wird seit der Paginierung auf dem Server (db.quotes, Spalte
  // projektleiter_name) — hier zählt, dass der Begriff dort ankommt und die
  // Antwort angezeigt wird.
  it('sucht Offerten über den Namen des Projektleiters auf dem Server', async () => {
    const user = userEvent.setup()
    listQuotes.mockResolvedValue([
      quote(),
      quote({ id: 2, quote_number: 'OFF-2026-826', project_name: 'Anderes Projekt', projektleiter_name: 'Luca Bazzi' }),
    ])
    render(<QuotesScreen />)
    await screen.findByText('Anderes Projekt')

    listQuotes.mockResolvedValue([quote()])
    await user.type(screen.getByPlaceholderText(/such/i), 'walser')
    await waitFor(() => expect(listQuotes).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'walser', page: 1 }),
    ))
    await waitFor(() => expect(screen.queryByText('Anderes Projekt')).toBeNull())
    expect(screen.getByText('241556 Gsell Seuzach')).toBeTruthy()
  })
})

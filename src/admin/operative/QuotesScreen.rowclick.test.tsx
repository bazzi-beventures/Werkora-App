// Klick auf die Offerte öffnet sie (Tabelle am Desktop, Karte am Handy).
//
// Der Regressionswert liegt nicht im «Klick öffnet», sondern in den zwei Fällen
// drumherum: die Aktionsknöpfe der Zeile dürfen die Maske NICHT öffnen (sonst
// landet man nach jedem «Akzeptieren» im Bearbeiten-Formular), und Status, die
// keinen «Bearbeiten»-Knopf haben, dürfen sich auch nicht per Zeilenklick öffnen
// lassen — sonst ist die Zeile ein Weg an der Statusprüfung vorbei.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Quote } from '../../api/admin/quotes'

let mobile = false
vi.mock('../useIsMobile', () => ({ useIsMobile: () => mobile }))

const listQuotes = vi.fn()
const getQuoteDetail = vi.fn()
const setQuoteStatus = vi.fn()
vi.mock('../../api/admin/quotes', () => ({
  listQuotes: () => listQuotes(),
  getQuoteDetail: (id: number) => getQuoteDetail(id),
  setQuoteStatus: (id: number, status: string) => setQuoteStatus(id, status),
  sendQuoteRejection: vi.fn(),
}))
vi.mock('../../api/admin/staff', () => ({ getAdminStaff: () => Promise.resolve([]) }))
vi.mock('../../api/auth', () => ({ getMe: () => Promise.resolve({}) }))
vi.mock('../../api/modules', () => ({
  getFeature: () => null,
  isFeatureEnabled: () => false,
}))
// Die Bearbeiten-Maske selbst ist hier uninteressant und zöge ihre eigenen
// Stammdaten-Fetches nach — dass sie erscheint, genügt.
vi.mock('./quotes/QuoteEditForm', () => ({
  QuoteEditForm: () => <div>Bearbeiten-Maske</div>,
}))
vi.mock('./quotes/QuoteCreateForm', () => ({ QuoteCreateForm: () => <div /> }))

import QuotesScreen from './QuotesScreen'

function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: 1,
    quote_number: 'OFF-2026-584',
    project_name: 'Bollmann Seuzach HS',
    total_amount: 11085,
    status: 'gesendet',
    created_at: '2026-09-06T08:00:00Z',
    reminder_sent_at: null,
    projektleiter_id: null,
    customer_name: 'Rolf und Anita Bollmann',
    ...over,
  }
}

beforeEach(() => {
  mobile = false
  listQuotes.mockReset().mockResolvedValue([quote()])
  getQuoteDetail.mockReset().mockResolvedValue({ id: 1 })
  setQuoteStatus.mockReset().mockResolvedValue({})
})

describe('QuotesScreen — Offerte per Klick öffnen', () => {
  it('öffnet die Offerte beim Klick auf die Tabellenzeile', async () => {
    const user = userEvent.setup()
    render(<QuotesScreen />)
    await screen.findByText('Bollmann Seuzach HS')

    await user.click(screen.getByText('Bollmann Seuzach HS'))

    await waitFor(() => expect(getQuoteDetail).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Bearbeiten-Maske')).toBeTruthy()
  })

  it('öffnet die Offerte NICHT, wenn ein Knopf der Zeile geklickt wird', async () => {
    const user = userEvent.setup()
    render(<QuotesScreen />)
    await screen.findByText('Bollmann Seuzach HS')

    await user.click(screen.getByRole('button', { name: 'Akzeptieren' }))

    await waitFor(() => expect(setQuoteStatus).toHaveBeenCalledWith(1, 'akzeptiert'))
    expect(getQuoteDetail).not.toHaveBeenCalled()
  })

  it('lässt eine akzeptierte Offerte nicht per Zeilenklick öffnen', async () => {
    listQuotes.mockResolvedValue([quote({ status: 'akzeptiert' })])
    const user = userEvent.setup()
    render(<QuotesScreen />)
    await screen.findByText('Bollmann Seuzach HS')

    await user.click(screen.getByText('Bollmann Seuzach HS'))

    expect(getQuoteDetail).not.toHaveBeenCalled()
  })

  it('öffnet die Offerte am Handy beim Klick auf die Karte', async () => {
    mobile = true
    const user = userEvent.setup()
    const { container } = render(<QuotesScreen />)
    await screen.findByText('Bollmann Seuzach HS')

    await user.click(container.querySelector('.admin-card') as HTMLElement)

    await waitFor(() => expect(getQuoteDetail).toHaveBeenCalledWith(1))
  })

  it('öffnet die Karte nicht, wenn ein Knopf auf ihr geklickt wird', async () => {
    mobile = true
    const user = userEvent.setup()
    render(<QuotesScreen />)
    await screen.findByText('Bollmann Seuzach HS')

    await user.click(screen.getByRole('button', { name: 'Akzeptieren' }))

    await waitFor(() => expect(setQuoteStatus).toHaveBeenCalledWith(1, 'akzeptiert'))
    expect(getQuoteDetail).not.toHaveBeenCalled()
  })
})

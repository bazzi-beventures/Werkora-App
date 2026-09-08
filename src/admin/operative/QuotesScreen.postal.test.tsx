// Postversand einer Offerte: «Per Post versendet» erfasst den Versand, ohne zu mailen
// — das Gegenstück zum gleichnamigen Knopf bei der Rechnung.
//
// Der Regressionswert liegt in der Sichtbarkeit: der Knopf gehört an einen Entwurf
// mit Dokument und an sonst nichts. Bei einer bereits gesendeten Offerte würde er das
// Versanddatum überschreiben (und damit Erinnerungsfrist und «Kein Feedback»
// zurückdrehen); ohne Dokument gibt es nichts, was in der Post gewesen sein könnte.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Quote } from '../../api/admin/quotes'

vi.mock('../useIsMobile', () => ({ useIsMobile: () => false }))

const listQuotes = vi.fn()
const markQuoteSentByPost = vi.fn()
vi.mock('../../api/admin/quotes', () => ({
  listQuotes: () => listQuotes(),
  getQuoteDetail: vi.fn(),
  setQuoteStatus: vi.fn(),
  sendQuoteRejection: vi.fn(),
  markQuoteSentByPost: (id: number, date: string) => markQuoteSentByPost(id, date),
}))
vi.mock('../../api/admin/staff', () => ({ getAdminStaff: () => Promise.resolve([]) }))
vi.mock('../../api/auth', () => ({ getMe: () => Promise.resolve({}) }))
vi.mock('../../api/modules', () => ({
  getFeature: () => null,
  isFeatureEnabled: () => false,
}))
vi.mock('./quotes/QuoteEditForm', () => ({ QuoteEditForm: () => <div /> }))
vi.mock('./quotes/QuoteCreateForm', () => ({ QuoteCreateForm: () => <div /> }))

import QuotesScreen from './QuotesScreen'

function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: 1,
    quote_number: 'OFF-2026-584',
    project_name: 'Bollmann Seuzach HS',
    total_amount: 11085,
    status: 'entwurf',
    created_at: '2026-09-06T08:00:00Z',
    storage_path: 't1/quotes/OFF-2026-584.pdf',
    reminder_sent_at: null,
    projektleiter_id: null,
    customer_name: 'Rolf und Anita Bollmann',
    ...over,
  }
}

const POSTAL = 'Per Post versendet'

beforeEach(() => {
  listQuotes.mockReset().mockResolvedValue([quote()])
  markQuoteSentByPost.mockReset().mockResolvedValue(undefined)
})

describe('QuotesScreen — Offerte als per Post versendet markieren', () => {
  it('zeigt den Knopf am Entwurf mit Dokument', async () => {
    render(<QuotesScreen />)
    expect(await screen.findByRole('button', { name: POSTAL })).toBeTruthy()
  })

  it('zeigt ihn nicht ohne Dokument', async () => {
    listQuotes.mockResolvedValue([
      quote({ storage_path: null, xlsx_storage_path: null }),
    ])
    render(<QuotesScreen />)
    await screen.findByText('Bollmann Seuzach HS')
    expect(screen.queryByRole('button', { name: POSTAL })).toBeNull()
  })

  it('zeigt ihn bei einer XLSX-Offerte ohne PDF', async () => {
    listQuotes.mockResolvedValue([
      quote({ storage_path: null, xlsx_storage_path: 't1/quotes/OFF-2026-584.xlsx' }),
    ])
    render(<QuotesScreen />)
    expect(await screen.findByRole('button', { name: POSTAL })).toBeTruthy()
  })

  it('zeigt ihn nicht bei einer bereits gesendeten Offerte', async () => {
    listQuotes.mockResolvedValue([quote({ status: 'gesendet' })])
    render(<QuotesScreen />)
    await screen.findByText('Bollmann Seuzach HS')
    expect(screen.queryByRole('button', { name: POSTAL })).toBeNull()
  })

  it('markiert nach Bestätigung mit dem gewählten Versanddatum', async () => {
    const user = userEvent.setup()
    render(<QuotesScreen />)
    await user.click(await screen.findByRole('button', { name: POSTAL }))

    const date = screen.getByLabelText('Versanddatum') as HTMLInputElement
    expect(date.value).toBeTruthy()  // vorbelegt mit heute
    await user.clear(date)
    await user.type(date, '2026-09-04')
    await user.click(screen.getByRole('button', { name: 'Als versendet markieren' }))

    await waitFor(() => expect(markQuoteSentByPost).toHaveBeenCalledWith(1, '2026-09-04'))
    // Nach dem Erfolg wird die Liste neu geladen — sonst stünde die Offerte
    // weiter als Entwurf da.
    await waitFor(() => expect(listQuotes).toHaveBeenCalledTimes(2))
  })

  it('markiert nichts, solange nur der Dialog offen ist', async () => {
    const user = userEvent.setup()
    render(<QuotesScreen />)
    await user.click(await screen.findByRole('button', { name: POSTAL }))

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(markQuoteSentByPost).not.toHaveBeenCalled()
  })

  it('zeigt das Versanddatum in der Statusspalte', async () => {
    listQuotes.mockResolvedValue([
      quote({ status: 'gesendet', sent_at: '2026-09-04T00:00:00Z' }),
    ])
    render(<QuotesScreen />)
    expect(await screen.findByText(/Versendet 04\.09\.2026/)).toBeTruthy()
  })
})

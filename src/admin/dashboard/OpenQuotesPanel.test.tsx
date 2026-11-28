// Seitenpanel der Kachel «Offerten in Bearbeitung»: zeigt nur Entwürfe,
// bietet dieselben Aktionen wie die Offertenliste, und ein Klick auf die Karte
// öffnet das Projekt — ein Klick auf einen Knopf aber nicht.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Quote } from '../../api/admin/quotes'

const listQuotes = vi.fn()
const getQuoteDetail = vi.fn()
const setQuoteStatus = vi.fn()
vi.mock('../../api/admin/quotes', () => ({
  listQuotesPage: async (q: unknown) => {
    const rows = await listQuotes(q)
    return { rows, total: rows.length, page: 1, page_size: 50 }
  },
  getQuoteDetail: (id: number) => getQuoteDetail(id),
  setQuoteStatus: (id: number, status: string) => setQuoteStatus(id, status),
  sendQuoteRejection: vi.fn(),
  markQuoteSentByPost: vi.fn(),
}))
vi.mock('../../api/auth', () => ({ getMe: () => Promise.resolve({}) }))
vi.mock('../../api/modules', () => ({ getFeature: () => null, isFeatureEnabled: () => false }))
vi.mock('../operative/quotes/QuoteEditForm', () => ({
  QuoteEditForm: () => <div>Bearbeiten-Maske</div>,
}))

import { OpenQuotesPanel } from './OpenQuotesPanel'

function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: 1577,
    quote_number: 'OFF-2026-1577',
    project_name: 'Frischknecht Neftenbach HS',
    project_id: 'p-1577',
    total_amount: 1090.75,
    status: 'entwurf',
    created_at: '2026-11-16T08:00:00Z',
    reminder_sent_at: null,
    projektleiter_id: null,
    customer_name: 'Frischknecht',
    ...over,
  }
}

beforeEach(() => {
  listQuotes.mockReset().mockResolvedValue([quote()])
  getQuoteDetail.mockReset().mockResolvedValue({ id: 1577 })
  setQuoteStatus.mockReset().mockResolvedValue({})
})

describe('OpenQuotesPanel', () => {
  it('lädt nur Entwürfe — eine versendete Offerte ist nicht mehr in Bearbeitung', async () => {
    render(<OpenQuotesPanel onClose={vi.fn()} onChanged={vi.fn()} />)
    await screen.findByText('Frischknecht Neftenbach HS')
    const q = listQuotes.mock.calls[0][0] as { statuses: Iterable<string> }
    expect([...q.statuses]).toEqual(['entwurf'])
  })

  it('«Abgelehnte Offerten» lässt ersetzte Absagen weg, wie die Kachel', async () => {
    listQuotes.mockResolvedValue([quote({ status: 'abgelehnt' })])
    render(<OpenQuotesPanel art="abgelehnt" onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByText('Abgelehnte Offerten')).toBeTruthy()
    const q = listQuotes.mock.calls[0][0] as { statuses: Iterable<string>; entschiedenSeitTagen?: number; nurVerlorene?: boolean }
    expect([...q.statuses]).toEqual(['abgelehnt'])
    expect(q.entschiedenSeitTagen).toBe(14)
    expect(q.nurVerlorene).toBe(true)
  })

  it('«Angenommen, nicht verrechnet» lädt ohne Zeitfenster nur Unverrechnete, wie die Kachel', async () => {
    listQuotes.mockResolvedValue([quote({ status: 'akzeptiert' })])
    render(<OpenQuotesPanel art="akzeptiert" onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByText('Angenommen, nicht verrechnet')).toBeTruthy()
    const q = listQuotes.mock.calls[0][0] as { statuses: Iterable<string>; entschiedenSeitTagen?: number; nurUnverrechnete?: boolean }
    expect([...q.statuses]).toEqual(['akzeptiert'])
    expect(q.entschiedenSeitTagen).toBeUndefined()
    expect(q.nurUnverrechnete).toBe(true)
  })

  it('öffnet beim Klick auf die Karte das Projekt', async () => {
    const onOpenProject = vi.fn()
    render(<OpenQuotesPanel onClose={vi.fn()} onChanged={vi.fn()} onOpenProject={onOpenProject} />)
    await userEvent.click(await screen.findByText('Frischknecht Neftenbach HS'))
    expect(onOpenProject).toHaveBeenCalledWith('p-1577')
  })

  it('«Akzeptieren» setzt den Status, ohne ins Projekt zu springen, und meldet die Änderung', async () => {
    const onOpenProject = vi.fn()
    const onChanged = vi.fn()
    render(<OpenQuotesPanel onClose={vi.fn()} onChanged={onChanged} onOpenProject={onOpenProject} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Akzeptieren' }))
    await waitFor(() => expect(setQuoteStatus).toHaveBeenCalledWith(1577, 'akzeptiert'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(onOpenProject).not.toHaveBeenCalled()
  })

  it('«Bearbeiten» öffnet die Offerten-Maske im Panel', async () => {
    const onOpenProject = vi.fn()
    render(<OpenQuotesPanel onClose={vi.fn()} onChanged={vi.fn()} onOpenProject={onOpenProject} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }))
    expect(await screen.findByText('Bearbeiten-Maske')).toBeTruthy()
    expect(getQuoteDetail).toHaveBeenCalledWith(1577)
    expect(onOpenProject).not.toHaveBeenCalled()
  })

  it('macht eine freistehende Offerte ohne Projekt nicht klickbar', async () => {
    listQuotes.mockResolvedValue([quote({ project_id: null })])
    const onOpenProject = vi.fn()
    render(<OpenQuotesPanel onClose={vi.fn()} onChanged={vi.fn()} onOpenProject={onOpenProject} />)
    await userEvent.click(await screen.findByText('Frischknecht Neftenbach HS'))
    expect(onOpenProject).not.toHaveBeenCalled()
  })
})

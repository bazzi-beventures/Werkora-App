import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { OfferReminderModal } from './OfferReminderModal'
import { getPendingReminderQuotes, sendQuoteReminder, type PendingReminderQuote } from '../../api/admin'

// Klick auf eine Karte im Dialog «Offerten-Erinnerungen» öffnet das Projekt;
// der Knopf «Erinnerung senden» darf dabei nicht mitnavigieren.

vi.mock('../../api/admin', async () => {
  const echt = await vi.importActual<Record<string, unknown>>('../../api/admin')
  return { ...echt, getPendingReminderQuotes: vi.fn(), sendQuoteReminder: vi.fn() }
})

function offerte(over: Partial<PendingReminderQuote> = {}): PendingReminderQuote {
  return {
    id: 867, quote_number: 'OFF-2026-867', customer_name: 'Muster AG',
    customer_email: 'info@muster.ch', project_name: 'Beschattung', project_id: 'p-867',
    total_amount: 45109.5, sent_at: '2026-10-05T08:00:00Z',
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('OfferReminderModal', () => {
  it('öffnet beim Klick auf die Karte das Projekt', async () => {
    vi.mocked(getPendingReminderQuotes).mockResolvedValue([offerte()])
    const onOpenProject = vi.fn()
    render(<OfferReminderModal onClose={vi.fn()} onSent={vi.fn()} onOpenProject={onOpenProject} />)
    fireEvent.click(await screen.findByText('OFF-2026-867'))
    expect(onOpenProject).toHaveBeenCalledWith('p-867')
  })

  it('öffnet das Projekt auch per Tastatur', async () => {
    vi.mocked(getPendingReminderQuotes).mockResolvedValue([offerte()])
    const onOpenProject = vi.fn()
    render(<OfferReminderModal onClose={vi.fn()} onSent={vi.fn()} onOpenProject={onOpenProject} />)
    await screen.findByText('OFF-2026-867')
    fireEvent.keyDown(screen.getByRole('button', { name: /OFF-2026-867/ }), { key: 'Enter' })
    expect(onOpenProject).toHaveBeenCalledWith('p-867')
  })

  it('«Erinnerung senden» versendet, ohne ins Projekt zu springen', async () => {
    vi.mocked(getPendingReminderQuotes).mockResolvedValue([offerte()])
    vi.mocked(sendQuoteReminder).mockResolvedValue()
    const onOpenProject = vi.fn()
    const onSent = vi.fn()
    render(<OfferReminderModal onClose={vi.fn()} onSent={onSent} onOpenProject={onOpenProject} />)
    fireEvent.click(await screen.findByText('Erinnerung senden'))
    await waitFor(() => expect(onSent).toHaveBeenCalled())
    expect(sendQuoteReminder).toHaveBeenCalledWith(867)
    expect(onOpenProject).not.toHaveBeenCalled()
  })

  it('macht eine freistehende Offerte ohne Projekt nicht klickbar', async () => {
    vi.mocked(getPendingReminderQuotes).mockResolvedValue([offerte({ project_id: null })])
    const onOpenProject = vi.fn()
    render(<OfferReminderModal onClose={vi.fn()} onSent={vi.fn()} onOpenProject={onOpenProject} />)
    fireEvent.click(await screen.findByText('OFF-2026-867'))
    expect(onOpenProject).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /OFF-2026-867/ })).toBeNull()
  })
})

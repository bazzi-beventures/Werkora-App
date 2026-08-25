import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AftersalesTask } from '../../api/admin/aftersales'

let mobile = true
vi.mock('../useIsMobile', () => ({ useIsMobile: () => mobile }))

const listAftersales = vi.fn()
vi.mock('../../api/admin', () => ({
  listAftersales: (status?: string) => listAftersales(status),
  updateAftersales: vi.fn(),
  regenerateAftersalesBody: vi.fn(),
  sendAftersalesNow: vi.fn(),
  cancelAftersales: vi.fn(),
  reactivateAftersales: vi.fn(),
}))

import AftersalesScreen from './AftersalesScreen'

function task(over: Partial<AftersalesTask> = {}): AftersalesTask {
  return {
    id: 1,
    invoice_id: 10,
    project_name: 'Sanierung Bad',
    customer_name: 'Muster AG',
    customer_email: 'kontakt@muster.ch',
    object_address: null,
    kind: 'feedback',
    status: 'review',
    review_start: '2026-08-01',
    send_date: '2026-08-20',
    season_year: null,
    positions_snapshot: { items: [], total_amount: null, projektleiter: 'Anna Meier' } as never,
    mail_subject: null,
    mail_body: null,
    mail_body_generated_at: null,
    sent_at: null,
    response_text: null,
    responded_at: null,
    created_at: '2026-08-01T08:00:00Z',
    ...over,
  }
}

beforeEach(() => {
  mobile = true
  listAftersales.mockReset().mockResolvedValue([task()])
})

describe('AftersalesScreen — Karten auf dem Handy', () => {
  it('rendert Karten statt der 7-spaltigen Tabelle', async () => {
    const { container } = render(<AftersalesScreen />)
    await screen.findByText('Muster AG')

    // Die Positions-Tabelle steckt im Modal und ist hier nicht offen.
    expect(container.querySelector('table')).toBeNull()
    expect(container.querySelectorAll('.admin-card')).toHaveLength(1)
  })

  it('rendert am Desktop weiterhin die Tabelle', async () => {
    mobile = false
    const { container } = render(<AftersalesScreen />)
    await screen.findByText('Muster AG')

    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelectorAll('.admin-card')).toHaveLength(0)
  })

  it('bringt alle sieben Spaltenwerte auf die Karte', async () => {
    const { container } = render(<AftersalesScreen />)
    await screen.findByText('Muster AG')

    // Auf die Karte eingegrenzt: «Zu prüfen» ist auch ein Filter-Knopf daneben.
    const card = within(container.querySelector('.admin-card') as HTMLElement)
    expect(card.getByText(/Feedback · Sanierung Bad/)).toBeTruthy()
    expect(card.getByText(/Anna Meier · Versand 20\.08\.2026/)).toBeTruthy()
    expect(card.getByText('Zu prüfen')).toBeTruthy()
    expect(card.getByRole('button', { name: 'Bearbeiten' })).toBeTruthy()
  })

  it('zeigt «Vorschau» statt «Bearbeiten», wenn der Eintrag durch ist', async () => {
    listAftersales.mockResolvedValue([task({ status: 'sent' })])
    render(<AftersalesScreen />)
    await screen.findByText('Muster AG')

    expect(screen.getByRole('button', { name: 'Vorschau' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).toBeNull()
  })

  it('öffnet das Detail-Modal per Tipp auf die Karte', async () => {
    // Die Tabelle oeffnet das Modal per Zeilen-Klick. Ohne onItemClick an der
    // AdminCardList waere am Handy nur noch der Knopf ein Einstieg — die Karte
    // saehe klickbar aus und reagierte nicht.
    const user = userEvent.setup()
    const { container } = render(<AftersalesScreen />)
    await screen.findByText('Muster AG')

    await user.click(container.querySelector('.admin-card') as HTMLElement)

    await waitFor(() => expect(screen.getByText(/Feedback · Muster AG/)).toBeTruthy())
  })

  it('zeigt den Leer-Zustand', async () => {
    listAftersales.mockResolvedValue([])
    const { container } = render(<AftersalesScreen />)

    await screen.findByText('Keine After-Sales-Einträge.')
    expect(container.querySelectorAll('.admin-card')).toHaveLength(0)
  })
})

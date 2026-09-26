/**
 * Reiter «Wünsche» der Hilfe-Blase (docs/specs/feature-anfragen.md §5.1/§5.5).
 *
 * Eigener Reiter neben «Problem melden» — die Trennung von Wunsch und Störung
 * passiert beim Einstieg, nicht erst beim Betreiber (F4). Das Abzeichen am FAB
 * zählt ungelesene Support-Antworten und Wunsch-Nachrichten zusammen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('./HelpBot', () => ({ default: () => <div data-testid="helpbot" /> }))
vi.mock('./SupportForm', () => ({ default: () => <div data-testid="supportform" /> }))

const fetchMyWishes = vi.fn()
const fetchMySupportTickets = vi.fn()
vi.mock('../api/featureRequests', async () => {
  const actual = await vi.importActual<typeof import('../api/featureRequests')>('../api/featureRequests')
  return { ...actual, fetchMyWishes: () => fetchMyWishes(), markWishesRead: vi.fn().mockResolvedValue({ ok: true }) }
})
vi.mock('../api/support', async () => {
  const actual = await vi.importActual<typeof import('../api/support')>('../api/support')
  return { ...actual, fetchMySupportTickets: () => fetchMySupportTickets() }
})

import HelpBubble from './HelpBubble'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  fetchMyWishes.mockResolvedValue({ requests: [], unread: 2 })
  fetchMySupportTickets.mockResolvedValue({ tickets: [], unread: 1 })
})

describe('HelpBubble — Wünsche', () => {
  it('eigener Reiter neben «Problem melden», Abzeichen zählt beides', async () => {
    render(<HelpBubble showHelp={false} showSupport showWishes />)
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByRole('button', { name: 'Support (1)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Wünsche (2)' }))
    // Ungelesenes wartet → der Reiter öffnet direkt auf «Meine Wünsche».
    expect(screen.getByRole('button', { name: /Meine Wünsche \(2\)/, pressed: true })).toBeTruthy()
  })

  it('ohne Modul kein Reiter und kein Abruf', () => {
    render(<HelpBubble showHelp showWishes={false} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.queryByRole('button', { name: /Wünsche/ })).toBeNull()
    expect(fetchMyWishes).not.toHaveBeenCalled()
  })

  it('«Roadmap ansehen» schliesst die Blase und springt', async () => {
    fetchMyWishes.mockResolvedValue({ requests: [], unread: 0 })
    const onOpenRoadmap = vi.fn()
    render(<HelpBubble showHelp={false} showWishes onOpenRoadmap={onOpenRoadmap} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(await screen.findByRole('button', { name: /Roadmap ansehen/ }))
    expect(onOpenRoadmap).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

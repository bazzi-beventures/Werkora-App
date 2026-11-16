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
const markWishesRead = vi.fn()
const fetchMySupportTickets = vi.fn()
vi.mock('../api/featureRequests', async () => {
  const actual = await vi.importActual<typeof import('../api/featureRequests')>('../api/featureRequests')
  return { ...actual, fetchMyWishes: () => fetchMyWishes(), markWishesRead: () => markWishesRead() }
})
vi.mock('../api/support', async () => {
  const actual = await vi.importActual<typeof import('../api/support')>('../api/support')
  return { ...actual, fetchMySupportTickets: () => fetchMySupportTickets() }
})

import HelpBubble from './HelpBubble'
import { resetWishNewsNoticeForTests } from './wishNewsSession'

const NEWS = [{
  kind: 'feature', source: 'abo', feature_id: 'f-6', reference: 'WF-6', title: 'Erinnerungsfunktion',
  phase: 'umsetzung', phase_label: 'In Umsetzung', target_label: 'KW 40 2026', notified_on: '2026-10-03',
}]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetWishNewsNoticeForTests()
  markWishesRead.mockResolvedValue({ ok: true })
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

  it('beim Start: «Neues zu deinen Wünschen» — OK quittiert', async () => {
    fetchMyWishes.mockResolvedValue({ requests: [], unread: 1, news: NEWS })
    render(<HelpBubble showHelp={false} showWishes />)
    const notice = await screen.findByRole('dialog', { name: /Neues zu deinen Wünschen/ })
    expect(notice.textContent).toContain('WF-6')
    expect(notice.textContent).toContain('jetzt «In Umsetzung»')
    expect(notice.textContent).toContain('03.10.26')
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(markWishesRead).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: /Neues zu deinen Wünschen/ })).toBeNull()
  })

  it('«Später» quittiert nicht und kommt bei diesem Start nicht wieder', async () => {
    fetchMyWishes.mockResolvedValue({ requests: [], unread: 1, news: NEWS })
    const { unmount } = render(<HelpBubble showHelp={false} showWishes />)
    await screen.findByRole('dialog', { name: /Neues zu deinen Wünschen/ })
    fireEvent.click(screen.getByRole('button', { name: 'Später' }))
    expect(markWishesRead).not.toHaveBeenCalled()
    unmount()
    // Screenwechsel in der PWA hängt die Blase neu ein — der Hinweis bleibt weg.
    render(<HelpBubble showHelp={false} showWishes />)
    await waitFor(() => expect(fetchMyWishes).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog', { name: /Neues zu deinen Wünschen/ })).toBeNull()
  })

  it('«Zur Roadmap» quittiert und springt', async () => {
    fetchMyWishes.mockResolvedValue({ requests: [], unread: 1, news: NEWS })
    const onOpenRoadmap = vi.fn()
    render(<HelpBubble showHelp={false} showWishes onOpenRoadmap={onOpenRoadmap} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Zur Roadmap' }))
    expect(onOpenRoadmap).toHaveBeenCalled()
    await waitFor(() => expect(markWishesRead).toHaveBeenCalled())
  })

  it('Satz des Betreibers beim Zuordnen: im Hinweis und unter «Meine Wünsche»', async () => {
    // WW-86: der Satz kam früher nie an — zugeordnete Wünsche zeigten nur die Phase.
    const satz = 'Einen Mahnstopp je Rechnung nehmen wir auf die Roadmap.'
    fetchMyWishes.mockResolvedValue({
      requests: [{
        id: 'r-86', request_no: 86, reference: 'WW-86', origin: 'anfrage', title: 'Mahnstopp',
        importance: 'wichtig', triage: 'zugeordnet', triage_label: 'Zugeordnet', answer: satz,
        created_at: '2026-11-13T14:00:00Z', created_on: '2026-11-13',
        notified_at: '2026-11-16T17:00:00Z', read_at: null,
        feature: { id: 'f-54', reference: 'WF-54', phase_label: 'In Prüfung', target_label: 'offen' },
      }],
      unread: 1,
      news: [{ ...NEWS[0], source: 'anfrage', feature_id: 'f-54', reference: 'WF-54', answer: satz }],
    })
    render(<HelpBubble showHelp={false} showWishes />)
    const notice = await screen.findByRole('dialog', { name: /Neues zu deinen Wünschen/ })
    expect(notice.textContent).toContain(satz)
    fireEvent.click(screen.getByRole('button', { name: 'Später' }))
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('button', { name: /Wünsche \(1\)/ }))
    expect(await screen.findByText(satz)).toBeTruthy()
  })

  it('ohne Neuigkeiten kein Hinweis', async () => {
    fetchMyWishes.mockResolvedValue({ requests: [], unread: 0, news: [] })
    render(<HelpBubble showHelp={false} showWishes />)
    await waitFor(() => expect(fetchMyWishes).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

/**
 * Rückfrage an den Einreicher (docs/specs/feature-anfragen.md §7.1a).
 *
 * Der Betreiber spielt einen unklaren Wunsch zurück. Beim nächsten Start der
 * App erscheint die Frage im Hinweis; «Jetzt beantworten» öffnet «Meine
 * Wünsche», dort steht das Antwortfeld. Die offene Frage zählt im Abzeichen
 * weiter, auch wenn der Hinweis quittiert ist — und die Zahl landet über
 * `useWishAttention` am Navigationspunkt im Admin.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('./HelpBot', () => ({ default: () => <div data-testid="helpbot" /> }))

const fetchMyWishes = vi.fn()
const markWishesRead = vi.fn()
const replyToWishQuestion = vi.fn()
vi.mock('../api/featureRequests', async () => {
  const actual = await vi.importActual<typeof import('../api/featureRequests')>('../api/featureRequests')
  return {
    ...actual,
    fetchMyWishes: () => fetchMyWishes(),
    markWishesRead: () => markWishesRead(),
    replyToWishQuestion: (id: string, text: string) => replyToWishQuestion(id, text),
  }
})

import HelpBubble from './HelpBubble'
import { resetWishAttentionForTests, useWishAttention } from './useMyWishes'
import { resetWishNewsNoticeForTests } from './wishNewsSession'

const WISH = {
  id: 'r-4', request_no: 4, reference: 'WW-4', origin: 'anfrage', title: 'Nächster Termin',
  importance: 'wichtig', triage: 'rueckfrage', triage_label: 'Rückfrage',
  answer: 'Welche Maske meinst du genau?', created_at: '2026-09-30T08:00:00Z', created_on: '2026-09-30',
  notified_at: '2026-10-11T08:00:00Z', read_at: null,
  rueckfragen: [{ frage: 'Welche Maske meinst du genau?', gefragt_am: '2026-10-11' }],
}
const NEWS = [{
  kind: 'antwort', source: 'anfrage', request_id: 'r-4', reference: 'WW-4', title: 'Nächster Termin',
  triage: 'rueckfrage', triage_label: 'Rückfrage', answer: 'Welche Maske meinst du genau?',
  notified_on: '2026-10-11',
}]

function NavBadge() {
  return <span data-testid="nav-badge">{useWishAttention()}</span>
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetWishNewsNoticeForTests()
  resetWishAttentionForTests()
  markWishesRead.mockResolvedValue({ ok: true })
  replyToWishQuestion.mockResolvedValue({ ok: true, triage: 'neu' })
  fetchMyWishes.mockResolvedValue({ requests: [WISH], unread: 1, attention: 1, news: NEWS })
})

describe('Rückfrage zu einem Wunsch', () => {
  it('Hinweis beim Start → «Jetzt beantworten» öffnet das Antwortfeld', async () => {
    render(<><HelpBubble showHelp={false} showWishes /><NavBadge /></>)
    const notice = await screen.findByRole('dialog', { name: /Neues zu deinen Wünschen/ })
    expect(notice.textContent).toContain('Welche Maske meinst du genau?')
    expect(notice.textContent).toContain('Bitte beantworte die Frage')
    expect(screen.getByTestId('nav-badge').textContent).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'Jetzt beantworten' }))
    await waitFor(() => expect(markWishesRead).toHaveBeenCalled())
    // Quittiert ist die Nachricht, nicht die Frage — die Zahl bleibt.
    expect(screen.getByTestId('nav-badge').textContent).toBe('1')

    const field = await screen.findByLabelText('Antwort auf die Rückfrage zu WW-4')
    fireEvent.change(field, { target: { value: 'Die Projektliste' } })
    fetchMyWishes.mockResolvedValue({
      requests: [{ ...WISH, triage: 'neu', triage_label: 'Eingegangen', answer: null }],
      unread: 0, attention: 0, news: [],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Antworten' }))
    await waitFor(() => expect(replyToWishQuestion).toHaveBeenCalledWith('r-4', 'Die Projektliste'))
    await waitFor(() => expect(screen.getByTestId('nav-badge').textContent).toBe('0'))
  })

  it('gelesene, offene Rückfrage zählt weiter im Abzeichen der Blase', async () => {
    fetchMyWishes.mockResolvedValue({
      requests: [{ ...WISH, read_at: '2026-10-11T09:00:00Z' }], unread: 0, attention: 1, news: [],
    })
    render(<HelpBubble showHelp={false} showWishes />)
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy())
    expect(screen.queryByRole('dialog', { name: /Neues zu deinen Wünschen/ })).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { expanded: false })) })
    // Der Reiter öffnet direkt dort, wo man antworten kann.
    expect(await screen.findByLabelText('Antwort auf die Rückfrage zu WW-4')).toBeTruthy()
  })
})

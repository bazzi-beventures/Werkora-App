/**
 * Roadmap der Nutzer (docs/specs/feature-anfragen.md §5.4).
 *
 * Geprüft: fremde Betriebe erscheinen nur als Zahl (F3), «Unsere Wünsche» nur
 * für Admins, «Brauchen wir auch» im Detail, und der Punkt «geändert seit
 * letztem Besuch» bricht ohne localStorage nichts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const api = {
  fetchRoadmap: vi.fn(),
  fetchRoadmapFeature: vi.fn(),
  fetchTenantWishes: vi.fn(),
  fetchMyWishes: vi.fn(),
  markWishesRead: vi.fn(),
  supportFeatureWish: vi.fn(),
  withdrawFeatureSupport: vi.fn(),
  subscribeFeature: vi.fn(),
  unsubscribeFeature: vi.fn(),
}

vi.mock('../api/featureRequests', async () => {
  const actual = await vi.importActual<typeof import('../api/featureRequests')>('../api/featureRequests')
  return {
    ...actual,
    fetchRoadmap: () => api.fetchRoadmap(),
    fetchRoadmapFeature: (id: string) => api.fetchRoadmapFeature(id),
    fetchTenantWishes: () => api.fetchTenantWishes(),
    fetchMyWishes: () => api.fetchMyWishes(),
    markWishesRead: () => api.markWishesRead(),
    supportFeatureWish: (id: string, b: unknown) => api.supportFeatureWish(id, b),
    withdrawFeatureSupport: (id: string) => api.withdrawFeatureSupport(id),
    subscribeFeature: (id: string) => api.subscribeFeature(id),
    unsubscribeFeature: (id: string) => api.unsubscribeFeature(id),
  }
})

import Roadmap from './Roadmap'

const CARD = {
  id: 'f-1', feature_no: 12, reference: 'WF-12', title: 'Offerten als Vorlage speichern',
  area: 'offerten', phase: 'geplant', phase_label: 'Geplant', phase_since: '2026-08-20',
  target_label: 'Q4 2026', request_count: 5, tenant_count: 4, own_count: 2, other_tenants: 3,
  mine: null, updated_at: '2026-09-20T10:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  try { localStorage.clear() } catch { /* jsdom */ }
  api.fetchRoadmap.mockResolvedValue({ features: [CARD] })
  api.fetchMyWishes.mockResolvedValue({ requests: [], unread: 0 })
  api.fetchTenantWishes.mockResolvedValue({ requests: [] })
  api.markWishesRead.mockResolvedValue({ ok: true })
  api.supportFeatureWish.mockResolvedValue({ ok: true, already: false })
  api.withdrawFeatureSupport.mockResolvedValue({ ok: true, removed: 1 })
  api.subscribeFeature.mockResolvedValue({ ok: true, subscribed: true })
  api.unsubscribeFeature.mockResolvedValue({ ok: true, subscribed: false })
  api.fetchRoadmapFeature.mockResolvedValue({
    ...CARD, description: 'Positionen als Vorlage', history: [
      { art: 'phase', on: '2026-08-12', phase: 'pruefung' },
      { art: 'phase', on: '2026-08-20', phase: 'geplant', text: 'Kommt im Herbst' },
    ],
    from_our_tenant: [{ created_by_name: 'Anna', importance: 'dringend', created_at: '', created_on: '2026-08-05',
                        origin: 'anfrage', is_me: false }],
  })
})

describe('Roadmap', () => {
  it('zeigt den eigenen Betrieb mit Zahl und fremde nur als Zahl', async () => {
    render(<Roadmap userId="u-1" role="user" appContext="pwa" compact />)
    expect(await screen.findByText(/Ihr \(2\) \+ 3 weitere Betriebe/)).toBeTruthy()
  })

  it('«Unsere Wünsche» nur für Admins', async () => {
    const { unmount } = render(<Roadmap userId="u-1" role="user" appContext="pwa" />)
    await screen.findByText('Offerten als Vorlage speichern')
    expect(screen.queryByRole('tab', { name: 'Unsere Wünsche' })).toBeNull()
    unmount()
    render(<Roadmap userId="u-1" role="admin" appContext="admin" />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Unsere Wünsche' }))
    await waitFor(() => expect(api.fetchTenantWishes).toHaveBeenCalled())
  })

  it('Detail: Verlauf nur mit Datum, «Brauchen wir auch» unterstützt', async () => {
    render(<Roadmap userId="u-1" role="user" appContext="pwa" />)
    fireEvent.click(await screen.findByTitle('Details'))
    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByText('Kommt im Herbst')).toBeTruthy()
    expect(within(sheet).getByText('20.08.26')).toBeTruthy()
    expect(within(sheet).queryByText(/\d{1,2}:\d{2}/)).toBeNull()
    expect(within(sheet).getByText(/Anna/)).toBeTruthy()
    expect(within(sheet).getByText(/\+ 3 weitere Betriebe/)).toBeTruthy()
    fireEvent.change(within(sheet).getByPlaceholderText(/Wofür braucht ihr das/), { target: { value: 'Für Bäder' } })
    fireEvent.click(within(sheet).getByRole('button', { name: '👍 Brauchen wir auch' }))
    await waitFor(() => expect(api.supportFeatureWish).toHaveBeenCalledWith(
      'f-1', { text: 'Für Bäder', app_context: 'pwa' }))
  })

  it('Like direkt auf der Karte — mit Zahl, ohne das Detail zu öffnen', async () => {
    render(<Roadmap userId="u-1" role="user" appContext="pwa" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Gefällt mir (5)' }))
    await waitFor(() => expect(api.supportFeatureWish).toHaveBeenCalledWith('f-1', { app_context: 'pwa' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // Danach wird das Board neu geladen.
    await waitFor(() => expect(api.fetchRoadmap).toHaveBeenCalledTimes(2))
  })

  it('Like zurücknehmen', async () => {
    api.fetchRoadmap.mockResolvedValue({ features: [{ ...CARD, mine: 'unterstuetzung' }] })
    render(<Roadmap userId="u-1" role="user" appContext="pwa" />)
    const like = await screen.findByRole('button', { name: /Gefällt mir \(5\) — zurücknehmen/ })
    expect(like.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(like)
    await waitFor(() => expect(api.withdrawFeatureSupport).toHaveBeenCalledWith('f-1'))
  })

  it('Abonnieren und Abo beenden auf der Karte', async () => {
    api.fetchRoadmap
      .mockResolvedValueOnce({ features: [CARD] })
      .mockResolvedValue({ features: [{ ...CARD, subscribed: true }] })
    render(<Roadmap userId="u-1" role="user" appContext="pwa" />)
    fireEvent.click(await screen.findByRole('button', { name: '🔔 Abonnieren' }))
    await waitFor(() => expect(api.subscribeFeature).toHaveBeenCalledWith('f-1'))
    fireEvent.click(await screen.findByRole('button', { name: '🔔 Abonniert' }))
    await waitFor(() => expect(api.unsubscribeFeature).toHaveBeenCalledWith('f-1'))
  })

  it('eigene Anfrage: Like und Abo stehen gedrückt und gesperrt', async () => {
    api.fetchRoadmap.mockResolvedValue({ features: [{ ...CARD, mine: 'anfrage', notified_anyway: true }] })
    render(<Roadmap userId="u-1" role="user" appContext="pwa" />)
    const abo = await screen.findByRole('button', { name: 'Du wirst benachrichtigt' })
    expect((abo as HTMLButtonElement).disabled).toBe(true)
    expect(abo.getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByRole('button', { name: /Gefällt mir/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('«Meine Wünsche» zeigt abonnierte Features mit «Abo beenden»', async () => {
    api.fetchMyWishes.mockResolvedValue({
      requests: [], unread: 0,
      subscriptions: [{ feature_id: 'f-1', feature: { id: 'f-1', reference: 'WF-12', title: 'Offerten als Vorlage speichern',
                                                    phase: 'geplant', phase_label: 'Geplant', target_label: 'Q4 2026' } }],
    })
    render(<Roadmap userId="u-1" role="user" appContext="pwa" />)
    fireEvent.click(await screen.findByRole('tab', { name: /Meine Wünsche/ }))
    expect(await screen.findByText('Abonniert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abo beenden' }))
    await waitFor(() => expect(api.unsubscribeFeature).toHaveBeenCalledWith('f-1'))
  })

  it('Punkt «geändert» nur nach einem früheren Besuch', async () => {
    localStorage.setItem('roadmap-seen:u-1', '2026-09-01T00:00:00Z')
    render(<Roadmap userId="u-1" role="user" appContext="pwa" />)
    expect(await screen.findByLabelText('Geändert seit deinem letzten Besuch')).toBeTruthy()
  })

  it('ohne früheren Besuch kein Punkt — und der Besuch wird gemerkt', async () => {
    render(<Roadmap userId="u-2" role="user" appContext="pwa" />)
    await screen.findByText('Offerten als Vorlage speichern')
    expect(screen.queryByLabelText('Geändert seit deinem letzten Besuch')).toBeNull()
    await waitFor(() => expect(localStorage.getItem('roadmap-seen:u-2')).not.toBeNull())
  })
})

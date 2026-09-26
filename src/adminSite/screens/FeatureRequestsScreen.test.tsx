/**
 * Feature-Anfragen auf admin.werkora.ch (docs/specs/feature-anfragen.md §7).
 *
 * Geprüft werden die Regeln, nicht die Optik:
 *
 * 1. **Triage braucht, was der Ausgang braucht** — «Beantworten» und
 *    «Ablehnen» nie ohne Satz an den Einreicher (F9).
 * 2. **Kein stiller Phasenwechsel** — eine Karte in eine andere Spalte ziehen
 *    öffnet den Dialog; «Nicht geplant» verlangt einen öffentlichen Grund.
 * 3. **Weiterleiten an den Support nur mit Konto** — ohne Absender kann niemand
 *    die Meldung beantworten.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const api = {
  fetchFeatureRequests: vi.fn(),
  fetchFeatures: vi.fn(),
  fetchFeatureRequest: vi.fn(),
  triageFeatureRequest: vi.fn(),
  changeFeaturePhase: vi.fn(),
  assignFeatureRequests: vi.fn(),
  searchFeatures: vi.fn(),
}

vi.mock('../../api/featureRequests', async () => {
  const actual = await vi.importActual<typeof import('../../api/featureRequests')>('../../api/featureRequests')
  return {
    ...actual,
    fetchFeatureRequests: (p: unknown) => api.fetchFeatureRequests(p),
    fetchFeatures: () => api.fetchFeatures(),
    fetchFeatureRequest: (id: string) => api.fetchFeatureRequest(id),
    triageFeatureRequest: (id: string, b: unknown) => api.triageFeatureRequest(id, b),
    changeFeaturePhase: (id: string, b: unknown) => api.changeFeaturePhase(id, b),
    assignFeatureRequests: (ids: string[], f: string) => api.assignFeatureRequests(ids, f),
    searchFeatures: (q: string) => api.searchFeatures(q),
  }
})

vi.mock('../tenantScopedApi', () => ({ listUsers: vi.fn().mockResolvedValue([]) }))

import FeatureRequestsScreen from './FeatureRequestsScreen'

const REQUEST = {
  id: 'r-1', tenant_id: 't-1', tenant_name: 'Gehlhaar AG', request_no: 1042, reference: 'WW-1042',
  origin: 'anfrage', source: 'app', created_by: 'u-1', created_by_name: 'Anna Muster',
  created_by_role: 'admin', title: 'Offerten-Vorlage', area: 'offerten', importance: 'dringend',
  triage: 'neu', created_at: '2026-08-05T09:12:00Z', created_on: '2026-08-05',
}

const FEATURE = {
  id: 'f-1', feature_no: 12, reference: 'WF-12', title: 'Offerten als Vorlage speichern',
  area: 'offerten', phase: 'geplant', phase_label: 'Geplant', phase_since: '2026-08-20',
  visibility: 'oeffentlich', target_from: '2026-10-01', target_to: '2026-10-31',
  target_precision: 'monat', target_label: 'Oktober 2026', request_count: 3, tenant_count: 2,
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchFeatureRequests.mockResolvedValue({
    requests: [REQUEST], new_count: 1, tenants: [{ id: 't-1', name: 'Gehlhaar AG' }], capped: false,
  })
  api.fetchFeatures.mockResolvedValue({ features: [FEATURE] })
  api.fetchFeatureRequest.mockResolvedValue({
    ...REQUEST, description: 'Jede Offerte gleich.', allowed_actions:
      ['zuordnen', 'neues_feature', 'support', 'beantworten', 'ablehnen'], similar: [FEATURE],
  })
  api.triageFeatureRequest.mockResolvedValue({})
  api.changeFeaturePhase.mockResolvedValue({})
  api.searchFeatures.mockResolvedValue({ features: [] })
})

async function oeffneAnfrage() {
  render(<FeatureRequestsScreen />)
  fireEvent.click(await screen.findByTitle('Anfrage öffnen'))
  return await screen.findByRole('dialog')
}

describe('FeatureRequestsScreen — Eingang', () => {
  it('zeigt neue Anfragen mit Datum, ohne Uhrzeit', async () => {
    render(<FeatureRequestsScreen />)
    expect(await screen.findByText('WW-1042')).toBeTruthy()
    expect(screen.getByText('05.08.26')).toBeTruthy()
    expect(screen.queryByText(/\d{1,2}:\d{2}/)).toBeNull()
    expect(api.fetchFeatureRequests).toHaveBeenCalledWith({ triage: 'neu', tenantId: undefined })
  })

  it('«Beantworten» geht nicht ohne Satz an den Einreicher', async () => {
    const dialog = await oeffneAnfrage()
    fireEvent.click(within(dialog).getByLabelText(/Beantworten/))
    const ausfuehren = within(dialog).getByRole('button', { name: 'Ausführen' })
    expect(ausfuehren).toBeDisabled()
    fireEvent.change(within(dialog).getByPlaceholderText(/Gibt es schon/),
                     { target: { value: 'Gibt es schon unter Vorlagen.' } })
    expect(ausfuehren).not.toBeDisabled()
    fireEvent.click(ausfuehren)
    // Mit Konto ist «benachrichtigen» vorbelegt (F11) — die Antwort soll ankommen.
    await waitFor(() => expect(api.triageFeatureRequest).toHaveBeenCalledWith(
      'r-1', { aktion: 'beantworten', text: 'Gibt es schon unter Vorlagen.', notify: true }))
  })

  it('«benachrichtigen» lässt sich abwählen', async () => {
    const dialog = await oeffneAnfrage()
    fireEvent.click(within(dialog).getByLabelText(/Ablehnen/))
    fireEvent.change(within(dialog).getByPlaceholderText(/Warum nicht/), { target: { value: 'Doppelt' } })
    fireEvent.click(within(dialog).getByLabelText(/benachrichtigen/))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ausführen' }))
    await waitFor(() => expect(api.triageFeatureRequest).toHaveBeenCalledWith(
      'r-1', { aktion: 'ablehnen', text: 'Doppelt' }))
  })

  it('ein ähnliches Feature wählt «Zuordnen» mit diesem Feature vor', async () => {
    const dialog = await oeffneAnfrage()
    fireEvent.click(within(dialog).getByRole('button', { name: /WF-12 · Offerten als Vorlage/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ausführen' }))
    await waitFor(() => expect(api.triageFeatureRequest).toHaveBeenCalledWith(
      'r-1', { aktion: 'zuordnen', feature_id: 'f-1' }))
  })

  it('ohne Konto gibt es keinen Weg zum Support', async () => {
    api.fetchFeatureRequest.mockResolvedValue({
      ...REQUEST, created_by: null, description: 'x', similar: [],
      allowed_actions: ['zuordnen', 'neues_feature', 'beantworten', 'ablehnen'],
    })
    const dialog = await oeffneAnfrage()
    expect(within(dialog).queryByLabelText(/An den Support/)).toBeNull()
    expect(within(dialog).getByText(/nur mit Konto/)).toBeTruthy()
  })
})

describe('FeatureRequestsScreen — Board', () => {
  function zieheNach(spalte: string) {
    const karte = screen.getByTitle('Feature öffnen')
    const data: Record<string, string> = {}
    const dataTransfer = {
      setData: (k: string, v: string) => { data[k] = v },
      getData: (k: string) => data[k],
    }
    fireEvent.dragStart(karte, { dataTransfer })
    fireEvent.drop(screen.getByRole('region', { name: spalte }), { dataTransfer })
  }

  it('Ziehen in eine andere Spalte öffnet den Dialog statt still zu wechseln', async () => {
    render(<FeatureRequestsScreen />)
    fireEvent.click(await screen.findByRole('tab', { name: /Board/ }))
    await screen.findByText('Offerten als Vorlage speichern')
    zieheNach('In Umsetzung')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('WF-12 → In Umsetzung')).toBeTruthy()
    expect(api.changeFeaturePhase).not.toHaveBeenCalled()
    // «In Umsetzung» ist keine Phase, auf die ein Einreicher wartet — das
    // Häkchen steht, ist aber nicht vorbelegt (F11).
    const haken = within(dialog).getByLabelText(/3 Anfragende in 2 Betrieben benachrichtigen/) as HTMLInputElement
    expect(haken.checked).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(api.changeFeaturePhase).toHaveBeenCalledWith(
      'f-1', expect.objectContaining({ phase: 'umsetzung' })))
    expect(api.changeFeaturePhase.mock.calls[0][1]).not.toHaveProperty('notify')
  })

  it('«Im Test» belegt das Häkchen vor; ein internes Feature hat keins', async () => {
    render(<FeatureRequestsScreen />)
    fireEvent.click(await screen.findByRole('tab', { name: /Board/ }))
    await screen.findByText('Offerten als Vorlage speichern')
    zieheNach('Im Test')
    const dialog = await screen.findByRole('dialog')
    expect((within(dialog).getByLabelText(/benachrichtigen/) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(api.changeFeaturePhase).toHaveBeenCalledWith(
      'f-1', expect.objectContaining({ phase: 'test', notify: true })))
  })

  it('internes Feature: kein Häkchen', async () => {
    api.fetchFeatures.mockResolvedValue({ features: [{ ...FEATURE, visibility: 'intern' }] })
    render(<FeatureRequestsScreen />)
    fireEvent.click(await screen.findByRole('tab', { name: /Board/ }))
    await screen.findByText('Offerten als Vorlage speichern')
    zieheNach('Im Test')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText(/benachrichtigen/)).toBeNull()
  })

  it('«Nicht geplant» verlangt einen öffentlichen Grund', async () => {
    render(<FeatureRequestsScreen />)
    fireEvent.click(await screen.findByRole('tab', { name: /Board/ }))
    await screen.findByText('Offerten als Vorlage speichern')
    fireEvent.click(screen.getByRole('button', { name: /Später \/ Nicht geplant/ }))
    zieheNach('Nicht geplant')
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Übernehmen' }))
    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(api.changeFeaturePhase).not.toHaveBeenCalled()
  })
})

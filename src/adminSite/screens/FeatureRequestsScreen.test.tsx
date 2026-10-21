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
    fireEvent.change(within(dialog).getByPlaceholderText('Antwort an den Kunden'),
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
    fireEvent.change(within(dialog).getByPlaceholderText('Antwort an den Kunden'), { target: { value: 'Doppelt' } })
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

  it('zeigt Screenshots; ohne signierte URL den Dateinamen', async () => {
    api.fetchFeatureRequest.mockResolvedValue({
      ...REQUEST, description: 'Auf der ersten Maske', similar: [], allowed_actions: ['zuordnen'],
      attachments: [
        { path: 't-1/r-1/1.png', url: 'https://signed/1.png' },
        { path: 't-1/r-1/2.heic', url: null },
      ],
    })
    const dialog = await oeffneAnfrage()
    expect(within(dialog).getByText('Screenshots')).toBeTruthy()
    expect(within(dialog).getByAltText('Screenshot zum Wunsch').getAttribute('src')).toBe('https://signed/1.png')
    expect(within(dialog).getByText(/2\.heic \(nicht anzeigbar\)/)).toBeTruthy()
  })

  it('ohne Screenshots kein leerer Abschnitt', async () => {
    const dialog = await oeffneAnfrage()
    expect(within(dialog).queryByText('Screenshots')).toBeNull()
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

  it('«Rückfrage» spielt den Wunsch mit einer Frage zurück — Push vorbelegt', async () => {
    api.fetchFeatureRequest.mockResolvedValue({
      ...REQUEST, description: 'Auf der ersten Maske', similar: [],
      allowed_actions: ['zuordnen', 'neues_feature', 'support', 'rueckfrage', 'beantworten', 'ablehnen'],
    })
    const dialog = await oeffneAnfrage()
    fireEvent.click(within(dialog).getByLabelText(/Rückfrage \(unklar, worum es geht\)/))
    const ausfuehren = within(dialog).getByRole('button', { name: 'Ausführen' })
    expect(ausfuehren).toBeDisabled()
    fireEvent.change(within(dialog).getByPlaceholderText('Antwort an den Kunden'),
                     { target: { value: 'Welche Maske meinst du?' } })
    fireEvent.click(ausfuehren)
    await waitFor(() => expect(api.triageFeatureRequest).toHaveBeenCalledWith(
      'r-1', { aktion: 'rueckfrage', text: 'Welche Maske meinst du?', notify: true }))
  })

  it('zeigt keinen Ausgang, den dieses Bundle nicht kennt (kein leeres Radio)', async () => {
    api.fetchFeatureRequest.mockResolvedValue({
      ...REQUEST, description: 'x', similar: [],
      allowed_actions: ['zuordnen', 'kuenftige_aktion', 'ablehnen'],
    })
    const dialog = await oeffneAnfrage()
    const gruppe = within(dialog).getByRole('radiogroup', { name: 'Ausgang' })
    const radios = within(gruppe).getAllByRole('radio')
    expect(radios).toHaveLength(2)
    radios.forEach(r => expect(r.closest('label')?.textContent?.trim()).toBeTruthy())
  })

  it('zeigt die Beschreibung nicht doppelt, wenn sie dem Titel gleicht', async () => {
    api.fetchFeatureRequest.mockResolvedValue({
      ...REQUEST, title: 'Kunde zieht Skonto ab', description: 'Kunde zieht Skonto ab', similar: [],
      allowed_actions: ['zuordnen'],
    })
    const dialog = await oeffneAnfrage()
    expect(within(dialog).getAllByText('Kunde zieht Skonto ab')).toHaveLength(1)
  })

  it('zeigt Rückfragen samt Antwort des Einreichers', async () => {
    api.fetchFeatureRequest.mockResolvedValue({
      ...REQUEST, description: 'Auf der ersten Maske', similar: [], allowed_actions: ['zuordnen'],
      rueckfragen: [{ frage: 'Welche Maske?', gefragt_am: '2026-10-11',
                      antwort: 'Die Projektliste', beantwortet_am: '2026-10-12' }],
    })
    const dialog = await oeffneAnfrage()
    expect(within(dialog).getByText('Welche Maske?')).toBeTruthy()
    expect(within(dialog).getByText('Die Projektliste')).toBeTruthy()
    expect(within(dialog).getByText(/12\.10\.26/)).toBeTruthy()
  })

  it('Screenshots zu einer Antwort stehen bei der Runde, nicht beim Wunsch', async () => {
    api.fetchFeatureRequest.mockResolvedValue({
      ...REQUEST, description: 'Auf der ersten Maske', similar: [], allowed_actions: ['zuordnen'],
      rueckfragen: [{ frage: 'Wie soll es aussehen?', gefragt_am: '2026-10-11',
                      antwort: 'Wie im Bild', beantwortet_am: '2026-10-12' }],
      attachments: [
        { path: 't-1/r-1/1.png', url: 'https://signed/1.png' },
        { path: 't-1/r-1/2.png', url: 'https://signed/2.png', rueckfrage: 0 },
      ],
    })
    const dialog = await oeffneAnfrage()
    const bilder = within(dialog).getAllByAltText('Screenshot zum Wunsch')
    expect(bilder.map(b => b.getAttribute('src'))).toEqual(['https://signed/1.png', 'https://signed/2.png'])
    const runde = within(dialog).getByText('Wie im Bild').closest('.fr-dialog-round') as HTMLElement
    expect(within(runde).getByAltText('Screenshot zum Wunsch').getAttribute('src')).toBe('https://signed/2.png')
  })

  it('markiert im Eingang, was mit Antwort auf eine Rückfrage zurückkam', async () => {
    api.fetchFeatureRequests.mockResolvedValue({
      requests: [{ ...REQUEST, reply_waiting: true }], new_count: 1,
      tenants: [{ id: 't-1', name: 'Gehlhaar AG' }], capped: false,
    })
    render(<FeatureRequestsScreen />)
    expect(await screen.findByText('↩ Antwort da')).toBeTruthy()
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
    // Jede neue Phase ist eine Nachricht wert (§5.9) — vorbelegt, aber
    // abwählbar: eine Korrektur soll still gespeichert werden können.
    const haken = within(dialog).getByLabelText(/3 Anfragende in 2 Betrieben benachrichtigen/) as HTMLInputElement
    expect(haken.checked).toBe(true)
    fireEvent.click(haken)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(api.changeFeaturePhase).toHaveBeenCalledWith(
      'f-1', expect.objectContaining({ phase: 'umsetzung' })))
    expect(api.changeFeaturePhase.mock.calls[0][1]).not.toHaveProperty('notify')
  })

  it('Abonnenten zählen mit — auch ein Feature ohne Anfragen bekommt das Häkchen', async () => {
    api.fetchFeatures.mockResolvedValue({ features: [{ ...FEATURE, request_count: 0, tenant_count: 0,
                                                        subscriber_count: 2 }] })
    render(<FeatureRequestsScreen />)
    fireEvent.click(await screen.findByRole('tab', { name: /Board/ }))
    await screen.findByText('Offerten als Vorlage speichern')
    zieheNach('In Umsetzung')
    const dialog = await screen.findByRole('dialog')
    const haken = within(dialog).getByLabelText(/2 Abonnenten benachrichtigen/) as HTMLInputElement
    expect(haken.checked).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(api.changeFeaturePhase).toHaveBeenCalledWith(
      'f-1', expect.objectContaining({ phase: 'umsetzung', notify: true })))
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

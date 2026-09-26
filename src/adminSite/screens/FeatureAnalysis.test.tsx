/**
 * Feature-Anfragen, Paket 3 (docs/specs/feature-anfragen.md §7.1, §7.5, §8).
 *
 * Geprüft werden die Wege, nicht die Diagramme:
 *
 * 1. **Auswertung** — Zeitraum und Granularität gehen an den Server; ein
 *    Mandant in der Rangliste setzt den Filter im Eingang; «je aktivem Konto»
 *    zeigt bei 0 Konten keinen Quotienten.
 * 2. **Zusammenlegen** — nie ohne zweiten Klick, und nie in ein Feature im
 *    Endzustand.
 * 3. **KI-Entwurf** — überschreibt einen bestehenden Entwurf nur nach Rückfrage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (NoopResizeObserver as unknown as typeof ResizeObserver)

const api = {
  fetchFeatureRequests: vi.fn(),
  fetchFeatures: vi.fn(),
  fetchFeatureDashboard: vi.fn(),
  downloadFeatureRequestsCsv: vi.fn(),
  fetchFeature: vi.fn(),
  fetchFeatureSummary: vi.fn(),
  mergeFeature: vi.fn(),
  generateFeatureAiSummary: vi.fn(),
}

vi.mock('../../api/featureRequests', async () => {
  const actual = await vi.importActual<typeof import('../../api/featureRequests')>('../../api/featureRequests')
  return {
    ...actual,
    fetchFeatureRequests: (p: unknown) => api.fetchFeatureRequests(p),
    fetchFeatures: () => api.fetchFeatures(),
    fetchFeatureDashboard: (p: unknown) => api.fetchFeatureDashboard(p),
    downloadFeatureRequestsCsv: (p: unknown) => api.downloadFeatureRequestsCsv(p),
    fetchFeature: (id: string) => api.fetchFeature(id),
    fetchFeatureSummary: (id: string, f?: string) => api.fetchFeatureSummary(id, f),
    mergeFeature: (id: string, into: string) => api.mergeFeature(id, into),
    generateFeatureAiSummary: (id: string) => api.generateFeatureAiSummary(id),
  }
})

vi.mock('../tenantScopedApi', () => ({ listUsers: vi.fn().mockResolvedValue([]) }))

import FeatureRequestsScreen from './FeatureRequestsScreen'
import FeatureDetailDialog from './FeatureDetailDialog'

const FEATURE = {
  id: 'f-1', feature_no: 12, reference: 'WF-12', title: 'Offerten als Vorlage speichern',
  area: 'offerten', phase: 'geplant', phase_label: 'Geplant', phase_since: '2026-08-20',
  visibility: 'oeffentlich', target_label: 'Oktober 2026', request_count: 3, tenant_count: 2,
}

const DASHBOARD = {
  window: { von: '2026-06-28', bis: '2026-09-25', granularitaet: 'woche', geklemmt: false },
  periods: [{ key: '2026-W39', label: 'KW 39 2026', von: '2026-09-21', bis: '2026-09-27' }],
  total: 3,
  kacheln: {
    neu: 4, diese_woche: 3, vorwoche: 1, in_umsetzung: 2, im_test: 1,
    median_triage_tage: 1.5, median_triage_n: 2, fehlkanal_quote: 0.25, fehlkanal_n: 1, fehlkanal_basis: 4,
  },
  by_period: [{ key: '2026-W39', label: 'KW 39 2026', anfrage: 2, unterstuetzung: 1 }],
  by_tenant: [
    { tenant_id: 't-1', name: 'Gehlhaar AG', count: 2, accounts: 4, per_account: 0.5 },
    { tenant_id: 't-2', name: 'Meier AG', count: 1, accounts: 0, per_account: null },
  ],
  matrix: [
    { tenant_id: 't-1', name: 'Gehlhaar AG', cells: [2], total: 2 },
    { tenant_id: 't-2', name: 'Meier AG', cells: [1], total: 1 },
  ],
  matrix_text: 'Betrieb\tKW 39 2026\tTotal\n',
  by_area: [{ key: 'offerten', label: 'Offerten', count: 3 }],
  top_features: [{ id: 'f-1', reference: 'WF-12', title: 'Offerten als Vorlage speichern',
                   phase: 'geplant', phase_label: 'Geplant', tenants: 2, requests: 3 }],
  durchlauf: [],
  durchlauf_features: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchFeatureRequests.mockResolvedValue({
    requests: [], new_count: 4, tenants: [{ id: 't-1', name: 'Gehlhaar AG' }, { id: 't-2', name: 'Meier AG' }],
    capped: false,
  })
  api.fetchFeatures.mockResolvedValue({ features: [FEATURE] })
  api.fetchFeatureDashboard.mockResolvedValue(DASHBOARD)
  api.downloadFeatureRequestsCsv.mockResolvedValue(undefined)
})

async function oeffneAuswertung() {
  render(<FeatureRequestsScreen />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Auswertung' }))
  await screen.findByText('Fehlkanal-Quote')
}

describe('Auswertung', () => {
  it('lädt 90 Tage wochenweise und zeigt die Kacheln', async () => {
    await oeffneAuswertung()
    const p = api.fetchFeatureDashboard.mock.calls[0][0]
    expect(p.granularitaet).toBe('woche')
    const tage = (Date.parse(p.bis) - Date.parse(p.von)) / 86_400_000
    expect(tage).toBe(89)
    expect(screen.getByText('25 %')).toBeTruthy()
    expect(screen.getByText('1.5 Tage')).toBeTruthy()
    expect(screen.getByText('↑ Vorwoche 1')).toBeTruthy()
  })

  it('Granularität geht an den Server', async () => {
    await oeffneAuswertung()
    fireEvent.click(screen.getByRole('button', { name: 'Quartal' }))
    await waitFor(() => expect(api.fetchFeatureDashboard).toHaveBeenLastCalledWith(
      expect.objectContaining({ granularitaet: 'quartal' })))
  })

  it('Klick auf einen Mandanten filtert den Eingang', async () => {
    await oeffneAuswertung()
    const rangliste = screen.getByRole('list', { name: 'Anfragen je Mandant' })
    fireEvent.click(within(rangliste).getByText('Meier AG'))
    await waitFor(() => expect(api.fetchFeatureRequests).toHaveBeenLastCalledWith(
      { triage: '', tenantId: 't-2' }))
    expect(screen.getByRole('tab', { name: /Eingang/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('«je aktivem Konto» ohne Konten: kein Quotient', async () => {
    await oeffneAuswertung()
    fireEvent.click(screen.getByRole('button', { name: 'je aktivem Konto' }))
    const rangliste = screen.getByRole('list', { name: 'Anfragen je Mandant' })
    expect(within(rangliste).getByText('0.50 (2/4)')).toBeTruthy()
    expect(within(rangliste).getByText('keine Konten')).toBeTruthy()
  })

  it('CSV-Export mit dem gewählten Zeitraum', async () => {
    await oeffneAuswertung()
    fireEvent.click(screen.getByRole('button', { name: 'CSV exportieren' }))
    const p = api.fetchFeatureDashboard.mock.calls[0][0]
    await waitFor(() => expect(api.downloadFeatureRequestsCsv).toHaveBeenCalledWith({ von: p.von, bis: p.bis }))
  })

  it('«Neu im Eingang» führt zur Triage', async () => {
    await oeffneAuswertung()
    fireEvent.click(screen.getByTitle('Eingang öffnen'))
    await waitFor(() => expect(api.fetchFeatureRequests).toHaveBeenLastCalledWith(
      { triage: 'neu', tenantId: undefined }))
  })
})

const DETAIL = {
  ...FEATURE, id: 'f-2', feature_no: 13, reference: 'WF-13', title: 'Vorlagen', phase: 'pruefung',
  phase_label: 'In Prüfung', description: null, internal_note: null, ai_summary: null, links: [],
  history: [], public_history: [],
  requests: [{ id: 'r-1', reference: 'WW-1', created_on: '2026-09-01', importance: 'wichtig',
               origin: 'anfrage', title: 'x', description: 'y' }],
}

function oeffneDetail(extra: Record<string, unknown> = {}, features = [FEATURE,
  { ...FEATURE, id: 'f-9', reference: 'WF-9', title: 'Abgelehnt', phase: 'abgelehnt' }]) {
  api.fetchFeature.mockResolvedValue({ ...DETAIL, ...extra })
  api.fetchFeatureSummary.mockResolvedValue({ format: 'markdown', text: '# WF-13' })
  const onChanged = vi.fn()
  const onClose = vi.fn()
  render(<FeatureDetailDialog featureId="f-2" features={features as never}
                              onChanged={onChanged} onClose={onClose} />)
  return { onChanged, onClose }
}

describe('Zusammenlegen', () => {
  it('braucht den zweiten Klick und bietet keine Endzustände an', async () => {
    api.mergeFeature.mockResolvedValue({ ok: true, into: 'f-1', reference: 'WF-12', moved: 1, duplicates_removed: 0 })
    const { onClose, onChanged } = oeffneDetail()
    const ziel = await screen.findByLabelText('Ziel-Feature')
    expect(within(ziel).queryByText(/WF-9/)).toBeNull()
    fireEvent.change(ziel, { target: { value: 'f-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'In WF-12 aufgehen lassen' }))
    expect(api.mergeFeature).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/zusammengelegt mit WF-12/)
    fireEvent.click(screen.getByRole('button', { name: 'Zusammenlegen' }))
    await waitFor(() => expect(api.mergeFeature).toHaveBeenCalledWith('f-2', 'f-1'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onChanged).toHaveBeenCalled()
  })
})

describe('KI-Entwurf', () => {
  it('erstellt den Entwurf und zeigt ihn im Feld', async () => {
    api.generateFeatureAiSummary.mockResolvedValue({ ai_summary: '_Entwurf vom 25.09.2026_\n\n### Problemstellung' })
    oeffneDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'KI-Zusammenfassung erstellen' }))
    await waitFor(() => expect(api.generateFeatureAiSummary).toHaveBeenCalledWith('f-2'))
    await waitFor(() => expect((screen.getByLabelText('KI-Zusammenfassung') as HTMLTextAreaElement).value)
      .toMatch(/Problemstellung/))
  })

  it('überschreibt einen bestehenden Entwurf nur nach Rückfrage', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    oeffneDetail({ ai_summary: 'alt' })
    fireEvent.click(await screen.findByRole('button', { name: 'Neu erstellen' }))
    expect(confirm).toHaveBeenCalled()
    expect(api.generateFeatureAiSummary).not.toHaveBeenCalled()
    confirm.mockRestore()
  })
})

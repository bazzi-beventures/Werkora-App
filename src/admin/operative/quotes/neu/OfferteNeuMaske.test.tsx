import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuoteCreateForm } from '../QuoteCreateForm'
import { apiFetch } from '../../../../api/client'
import type { QuotePreview } from '../../../../api/admin/quotes'
import { fixpreisText } from './kalkulationText'

// Maske «Offerte neu» (Beta offerte_neu, docs/specs/offerte-neu.md): dieselben Zeilen
// wie die alte Maske, aber beschriftet, mit Live-Kalkulation aus dem Server und den
// Rabatten des Projekts sichtbar im Feld statt still beim Speichern.
vi.mock('../../../../api/client', () => ({
  apiFetch: vi.fn(),
  apiFormFetch: vi.fn(async () => ({})),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))
vi.mock('../../../../api/auth', () => ({ getMe: vi.fn(async () => ({ feature_flags: {} })) }))
vi.mock('../../../../api/modules', () => ({ isFeatureEnabled: (_u: unknown, key: string) => key === 'offerte_neu' }))

const mockFetch = vi.mocked(apiFetch)

const VORSCHAU: QuotePreview = {
  arbeit: { summe: 840, rabatt_pct: 0, rabatt_betrag: 0, rabatt_herkunft: 'keiner' },
  waren: { summe: 3347.25, rabatt_pct: 5, rabatt_betrag: 167.36, rabatt_herkunft: 'eingabe' },
  pauschalen: { summe: 240, fahrspesen: 0 },
  netto: 4259.89,
  mwst: 345.06,
  total: 4604.95,
  fixpreis: null,
  projekt_rabatt: { lohn_pct: 0, waren_pct: 5 },
  katalog_preise: [],
  marge: { ek: 2479.41, vk_nach_rabatt: 3179.89, rohertrag: 700.48, prozent: 22.03, zeilen_ohne_ek: 0 },
  endziffern_aufrundung: false,
}

function routeApi() {
  mockFetch.mockImplementation(async (path: string) => {
    if (path === '/pwa/admin/quote-skonto-defaults') return { pct: null, days: null }
    if (path === '/pwa/admin/quote-standard-notes') return { notes: '' }
    if (path === '/pwa/admin/quotes/preview') return VORSCHAU
    if (path === '/pwa/admin/quotes') return { status: 'ok', total_amount: 4604.95, fixed_price_missed: false }
    return []
  })
}

function vorschauAufrufe() {
  return mockFetch.mock.calls.filter(c => c[0] === '/pwa/admin/quotes/preview')
}

describe('Offerte neu — Maske', () => {
  beforeEach(() => {
    localStorage.clear()
    mockFetch.mockReset()
    routeApi()
  })

  it('zeigt drei Blöcke mit beschrifteten Feldern statt Platzhaltern', async () => {
    render(<QuoteCreateForm onDone={() => {}} onCancel={() => {}} lockedProjectName="Projekt A" lockedProjectId="p-1" />)
    expect(await screen.findByRole('region', { name: 'Arbeit' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Waren' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Pauschalen und Spesen' })).toBeTruthy()
    // «Stunden» ist eine Beschriftung, kein Platzhalter, der beim Tippen verschwindet.
    expect(screen.getByLabelText('Stunden')).toBeTruthy()
    expect(screen.queryByPlaceholderText('Stunden')).toBeNull()
  })

  it('rechnet über die Vorschau und zeigt das Total', async () => {
    render(<QuoteCreateForm onDone={() => {}} onCancel={() => {}} lockedProjectName="Projekt A" lockedProjectId="p-1" />)
    await waitFor(() => expect(vorschauAufrufe().length).toBeGreaterThan(0))
    expect((await screen.findAllByText(/4.604\.95/)).length).toBeGreaterThan(0)
    expect(screen.getByText('Rohertrag Waren 22 %')).toBeTruthy()
  })

  it('legt den Rabatt des Projekts sichtbar ins Feld und speichert ihn ausdrücklich', async () => {
    const user = userEvent.setup()
    render(<QuoteCreateForm onDone={() => {}} onCancel={() => {}} lockedProjectName="Projekt A" lockedProjectId="p-1" />)
    const waren = await screen.findByLabelText('Rabatt Waren %') as HTMLInputElement
    await waitFor(() => expect(waren.value).toBe('5'))

    await user.click(screen.getByRole('button', { name: '+ Freie Position' }))
    await user.type(screen.getByPlaceholderText('Bezeichnung'), 'Lamellenstoren')
    await user.click(screen.getByRole('button', { name: 'Offerte erstellen' }))

    await waitFor(() => expect(mockFetch.mock.calls.some(c => c[0] === '/pwa/admin/quotes')).toBe(true))
    const body = JSON.parse(String(mockFetch.mock.calls.find(c => c[0] === '/pwa/admin/quotes')?.[1]?.body))
    expect(body.discounts_explicit).toBe(true)
    expect(body.material_discount_pct).toBe(5)
  })

  it('lässt eine bewusst gelöschte Vorbelegung leer', async () => {
    const user = userEvent.setup()
    render(<QuoteCreateForm onDone={() => {}} onCancel={() => {}} lockedProjectName="Projekt A" lockedProjectId="p-1" />)
    const waren = await screen.findByLabelText('Rabatt Waren %') as HTMLInputElement
    await waitFor(() => expect(waren.value).toBe('5'))
    await user.clear(waren)
    // Weitere Vorschauen dürfen die 5 nicht zurückschreiben — vorbelegt wird je Projekt einmal.
    await new Promise(r => setTimeout(r, 600))
    expect(waren.value).toBe('')
  })
})

describe('Offerte neu — Fixpreis-Text', () => {
  it('meldet einen Fixpreis, der aufgeht, mit dem abgeleiteten Rabatt', () => {
    const t = fixpreisText({ ...VORSCHAU, total: 4500, fixpreis: { betrag: 4500, erreicht: true, rabatt_betrag: 264.44, rabatt_pct: 7.9 } })
    expect(t?.ok).toBe(true)
    expect(t?.text).toContain('7.9 %')
  })

  it('unterscheidet «über der Kalkulation» von «zu tief»', () => {
    const drueber = fixpreisText({ ...VORSCHAU, fixpreis: { betrag: 9000, erreicht: false, rabatt_betrag: 0, rabatt_pct: 0 } })
    expect(drueber?.text).toContain('über der Kalkulation')
    const drunter = fixpreisText({ ...VORSCHAU, fixpreis: { betrag: 500, erreicht: false, rabatt_betrag: 3347.25, rabatt_pct: 100 } })
    expect(drunter?.text).toContain('Zu tief')
  })

  it('ohne Fixpreis kein Text', () => {
    expect(fixpreisText(VORSCHAU)).toBeNull()
  })
})

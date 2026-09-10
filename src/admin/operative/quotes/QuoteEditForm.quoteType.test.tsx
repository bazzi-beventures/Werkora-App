// Typ-Umschalter der Bearbeiten-Maske (Feature "richtofferte").
//
// Welcher Typ es wird, entscheidet sich oft erst beim Ausfüllen. Der Umschalter
// steht darum auch beim Bearbeiten — aber nur, solange die Offerte nie versendet
// wurde: danach hat der Kunde ein PDF mit dem alten Titel in der Hand. Massgeblich
// ist `sent_at`, nicht der Status (den setzt jedes Speichern auf 'entwurf' zurück).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuoteEditForm } from './QuoteEditForm'
import type { QuoteDetail } from './quoteTypes'

vi.mock('../../../api/client', () => ({
  apiFetch: vi.fn(async () => []),
  apiFormFetch: vi.fn(async () => ({})),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))
vi.mock('../../../api/auth', () => ({ getMe: vi.fn(async () => ({ feature_flags: {} })) }))

let richtoffEnabled = true
vi.mock('../../../api/modules', () => ({
  isFeatureEnabled: (_me: unknown, key: string) => key === 'richtofferte' && richtoffEnabled,
}))

const updateQuote = vi.fn(async (_id: number, _payload: Record<string, unknown>) => ({ status: 'ok' }))
vi.mock('../../../api/admin/quotes', () => ({
  updateQuote: (id: number, payload: Record<string, unknown>) => updateQuote(id, payload),
  // Die Maske zieht über useQuotePdfImport auch den PDF-Import aus diesem Modul —
  // hier ungenutzt, muss aber existieren.
  extractQuotePdf: vi.fn(),
}))

function quote(over: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: 7,
    quote_number: 'OF-2600100-1',
    project_name: 'Storenmontage Müller',
    project_id: 'p-1',
    customer_id: 'c-1',
    customer_name: 'Müller GmbH',
    labor_items: [{ description: 'Montage', quantity: 4, unit: 'h', unit_price: 95, total_price: 380 }],
    material_items: [],
    travel_items: [],
    extra_product_items: [],
    extra_charge_items: [],
    installation_items: [],
    special_items: [],
    labor_discount_pct: 0,
    material_discount_pct: 0,
    skonto_pct: null,
    skonto_days: null,
    fixed_price: null,
    notes: '',
    product_description: '',
    sent_at: null,
    quote_type: 'offerte',
    ...over,
  }
}

function renderForm(over: Partial<QuoteDetail> = {}) {
  render(<QuoteEditForm quote={quote(over)} onDone={() => {}} onCancel={() => {}} />)
}

beforeEach(() => {
  richtoffEnabled = true
  updateQuote.mockClear()
})

describe('QuoteEditForm — Offerten-Typ umstellen', () => {
  it('zeigt den Umschalter beim Entwurf und schickt den neuen Typ mit', async () => {
    const user = userEvent.setup()
    renderForm()
    const gruppe = await screen.findByRole('group', { name: 'Offerten-Typ' })

    await user.click(within(gruppe).getByRole('button', { name: 'Richtofferte' }))
    // Der Titel der Maske folgt der Wahl, noch bevor gespeichert ist.
    expect(screen.getByRole('heading', { name: 'Richtofferte bearbeiten' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    await waitFor(() => expect(updateQuote).toHaveBeenCalled())
    expect(updateQuote.mock.calls[0][1]).toMatchObject({ quote_type: 'richtofferte' })
  })

  it('zeigt bei einer versendeten Offerte keinen Umschalter und schickt keinen Typ', async () => {
    const user = userEvent.setup()
    renderForm({ sent_at: '2026-09-01T08:00:00Z' })
    await screen.findByRole('heading', { name: 'Offerte bearbeiten' })

    expect(screen.queryByRole('group', { name: 'Offerten-Typ' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    await waitFor(() => expect(updateQuote).toHaveBeenCalled())
    expect(updateQuote.mock.calls[0][1]).not.toHaveProperty('quote_type')
  })

  it('nennt den Typ auch dort, wo er feststeht', async () => {
    // Versendete Richtofferte: kein Umschalter, aber die Maske sagt, was auf dem
    // PDF des Kunden steht.
    renderForm({ sent_at: '2026-09-01T08:00:00Z', quote_type: 'richtofferte' })
    expect(await screen.findByRole('heading', { name: 'Richtofferte bearbeiten' })).toBeInTheDocument()
  })

  it('ohne aktives Feature gibt es keinen Umschalter', async () => {
    richtoffEnabled = false
    renderForm()
    await screen.findByRole('heading', { name: 'Offerte bearbeiten' })
    expect(screen.queryByRole('group', { name: 'Offerten-Typ' })).not.toBeInTheDocument()
  })
})

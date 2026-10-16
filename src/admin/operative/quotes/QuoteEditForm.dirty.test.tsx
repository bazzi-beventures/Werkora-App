import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuoteEditForm } from './QuoteEditForm'
import type { QuoteDetail } from './quoteTypes'

// Der Projekt-Dialog braucht eine verlässliche Dirty-Meldung, bevor ein Klick
// neben das Fenster die Maske schliesst. (Den localStorage-Entwurf prüft
// QuoteEditForm.draft.test.tsx; hier wird er vor jedem Fall geleert, sonst
// übernähme ein Fall die Eingaben des vorigen.)
vi.mock('../../../api/client', () => ({
  apiFetch: vi.fn(async () => []),
  apiFormFetch: vi.fn(async () => ({})),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))
vi.mock('../../../api/auth', () => ({ getMe: vi.fn(async () => ({ feature_flags: {} })) }))
vi.mock('../../../api/modules', () => ({ isFeatureEnabled: () => false }))

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
    notes: 'Standardbemerkung',
    product_description: 'Rolladen Rolpac III',
    ...over,
  }
}

describe('QuoteEditForm — Dirty-Meldung', () => {
  beforeEach(() => localStorage.clear())

  it('meldet beim Öffnen «nicht geändert»', async () => {
    const onDirtyChange = vi.fn()
    render(<QuoteEditForm quote={quote()} onDone={() => {}} onCancel={() => {}} onDirtyChange={onDirtyChange} />)

    await waitFor(() => expect(onDirtyChange).toHaveBeenCalled())
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('meldet «geändert», sobald ein Feld angefasst wird', async () => {
    const onDirtyChange = vi.fn()
    render(<QuoteEditForm quote={quote()} onDone={() => {}} onCancel={() => {}} onDirtyChange={onDirtyChange} />)
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalled())

    const feld = screen.getByPlaceholderText('Beschreibung der angebotenen Produkte…')
    fireEvent.change(feld, { target: { value: 'Rolladen Rolpac III, elektrisch' } })

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))
  })

  it('meldet wieder «nicht geändert», wenn der ursprüngliche Wert zurückgesetzt wird', async () => {
    const onDirtyChange = vi.fn()
    render(<QuoteEditForm quote={quote()} onDone={() => {}} onCancel={() => {}} onDirtyChange={onDirtyChange} />)
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalled())

    const feld = screen.getByPlaceholderText('Beschreibung der angebotenen Produkte…')
    fireEvent.change(feld, { target: { value: 'Etwas anderes' } })
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    fireEvent.change(feld, { target: { value: 'Rolladen Rolpac III' } })
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
  })
})

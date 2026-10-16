import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuoteEditForm } from './QuoteEditForm'
import { quoteEditDraftKey } from './quoteEditDraft'
import type { QuoteDetail } from './quoteTypes'

// Support WS-28: ein Admin flog mitten in der Bearbeitung einer Offerte aufs
// Login (Sitzung «abgelaufen») — die App baut dabei die Maske ab, ohne dass
// «Abbrechen» gedrückt wird. Die Änderungen müssen das überleben.
vi.mock('../../../api/client', () => ({
  apiFetch: vi.fn(async () => []),
  apiFormFetch: vi.fn(async () => ({})),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))
vi.mock('../../../api/auth', () => ({ getMe: vi.fn(async () => ({ feature_flags: {} })) }))
vi.mock('../../../api/modules', () => ({ isFeatureEnabled: () => false }))

const PLATZHALTER = 'Beschreibung der angebotenen Produkte…'
const KEY = quoteEditDraftKey(7)

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

function feld(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(PLATZHALTER) as HTMLTextAreaElement
}

/** Maske öffnen, ein Feld ändern und sie dann OHNE Abbrechen abbauen — so wie
 *  es der Sprung aufs Login tut. */
function bearbeitenUndAbbauen(q: QuoteDetail = quote()) {
  const { unmount } = render(<QuoteEditForm quote={q} onDone={() => {}} onCancel={() => {}} />)
  fireEvent.change(feld(), { target: { value: 'Rolladen Rolpac III, elektrisch' } })
  unmount()
}

describe('QuoteEditForm — Entwurf überlebt den Abbau der Maske', () => {
  beforeEach(() => localStorage.clear())

  it('hält ungespeicherte Änderungen laufend fest', async () => {
    render(<QuoteEditForm quote={quote()} onDone={() => {}} onCancel={() => {}} />)
    fireEvent.change(feld(), { target: { value: 'Rolladen Rolpac III, elektrisch' } })

    await waitFor(() => expect(localStorage.getItem(KEY)).not.toBeNull())
    const stored = JSON.parse(localStorage.getItem(KEY)!)
    expect(stored.data.productDescription).toBe('Rolladen Rolpac III, elektrisch')
  })

  it('stellt die Änderungen beim nächsten Öffnen wieder her und meldet «geändert»', async () => {
    bearbeitenUndAbbauen()

    const onDirtyChange = vi.fn()
    render(<QuoteEditForm quote={quote()} onDone={() => {}} onCancel={() => {}} onDirtyChange={onDirtyChange} />)

    await waitFor(() => expect(feld().value).toBe('Rolladen Rolpac III, elektrisch'))
    expect(screen.getByText(/wiederhergestellt/)).toBeTruthy()
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))
  })

  it('überschreibt eine inzwischen gespeicherte Offerte nicht still, sondern fragt', async () => {
    bearbeitenUndAbbauen()

    // Seither hat jemand die Offerte gespeichert (z.B. derselbe Admin nach dem Neu-Login).
    render(<QuoteEditForm quote={quote({ product_description: 'Neu gespeichert' })} onDone={() => {}} onCancel={() => {}} />)

    expect(feld().value).toBe('Neu gespeichert')
    expect(screen.getByText(/seither gespeichert/)).toBeTruthy()
    // Der ältere Entwurf bleibt liegen, solange nicht entschieden ist.
    expect(JSON.parse(localStorage.getItem(KEY)!).data.productDescription).toBe('Rolladen Rolpac III, elektrisch')

    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(feld().value).toBe('Rolladen Rolpac III, elektrisch'))
  })

  it('«Verwerfen» setzt die Maske auf die gespeicherte Offerte zurück und löscht den Entwurf', async () => {
    bearbeitenUndAbbauen()
    render(<QuoteEditForm quote={quote()} onDone={() => {}} onCancel={() => {}} />)
    await waitFor(() => expect(feld().value).toBe('Rolladen Rolpac III, elektrisch'))

    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }))

    await waitFor(() => expect(feld().value).toBe('Rolladen Rolpac III'))
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('«Verwerfen» eines veralteten Entwurfs lässt neue Eingaben stehen', async () => {
    bearbeitenUndAbbauen()
    render(<QuoteEditForm quote={quote({ product_description: 'Neu gespeichert' })} onDone={() => {}} onCancel={() => {}} />)
    fireEvent.change(feld(), { target: { value: 'Frisch getippt' } })

    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }))

    expect(feld().value).toBe('Frisch getippt')
    expect(screen.queryByText(/seither gespeichert/)).toBeNull()
    // Ab jetzt hält die Maske wieder den aktuellen Stand fest.
    await waitFor(() => expect(JSON.parse(localStorage.getItem(KEY)!).data.productDescription).toBe('Frisch getippt'))
  })

  it('«Abbrechen» ist eine Entscheidung: der Entwurf ist danach weg', async () => {
    const onCancel = vi.fn()
    render(<QuoteEditForm quote={quote()} onDone={() => {}} onCancel={onCancel} />)
    fireEvent.change(feld(), { target: { value: 'Etwas anderes' } })
    await waitFor(() => expect(localStorage.getItem(KEY)).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(onCancel).toHaveBeenCalled()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('erfolgreiches Speichern löscht den Entwurf', async () => {
    const onDone = vi.fn()
    render(<QuoteEditForm quote={quote()} onDone={onDone} onCancel={() => {}} />)
    fireEvent.change(feld(), { target: { value: 'Etwas anderes' } })
    await waitFor(() => expect(localStorage.getItem(KEY)).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('zurück auf den gespeicherten Stand = kein Entwurf mehr', async () => {
    render(<QuoteEditForm quote={quote()} onDone={() => {}} onCancel={() => {}} />)
    fireEvent.change(feld(), { target: { value: 'Etwas anderes' } })
    await waitFor(() => expect(localStorage.getItem(KEY)).not.toBeNull())

    fireEvent.change(feld(), { target: { value: 'Rolladen Rolpac III' } })

    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull())
  })

  it('ohne Entwurf: kein Hinweis, nichts gespeichert', () => {
    render(<QuoteEditForm quote={quote()} onDone={() => {}} onCancel={() => {}} />)

    expect(screen.queryByText(/wiederhergestellt|seither gespeichert/)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

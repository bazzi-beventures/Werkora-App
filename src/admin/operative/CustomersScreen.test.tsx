import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CustomersScreen from './CustomersScreen'
import { apiFetch } from '../../api/client'

// Nur Netzwerk + Feature-Flag mocken — Formularlogik bleibt echt.
vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}))
vi.mock('../../api/auth', () => ({ getMe: vi.fn().mockResolvedValue({}) }))
vi.mock('../../api/modules', () => ({ isFeatureEnabled: () => false }))

// AddressAutocomplete/CompanySearch machen eigene Netzwerk-Calls und Portale —
// fuer den Dubletten-Hinweis irrelevant.
vi.mock('../../shared/AddressAutocomplete', () => ({
  AddressAutocomplete: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Adresse" value={value} onChange={e => onChange(e.target.value)} />
  ),
}))
vi.mock('../../shared/CompanySearch', () => ({ CompanySearch: () => null }))

const mockFetch = vi.mocked(apiFetch)

const EMPTY_LIST = { rows: [], total: 0, page: 1, page_size: 50 }

const MUELLER = {
  id: 'cust-1',
  name: 'Hans Müller',
  company: null,
  address: 'Bahnhofstrasse 1, 8001 Zürich',
  billing_address: null,
}

// apiFetch nach URL beantworten: Liste leer, name-check konfigurierbar.
function routeFetch(matches: unknown[]) {
  mockFetch.mockImplementation(async (path: string) => {
    if (path.startsWith('/pwa/admin/customers/name-check')) return { matches }
    if (path.startsWith('/pwa/admin/customers/list')) return EMPTY_LIST
    return { id: 'neu' }
  })
}

function nameCheckCalls(): string[] {
  return mockFetch.mock.calls
    .map(c => c[0] as string)
    .filter(p => p.startsWith('/pwa/admin/customers/name-check'))
}

async function openNewCustomerForm() {
  render(<CustomersScreen />)
  fireEvent.click(await screen.findByText('+ Neuer Kunde'))
  return screen.getByLabelText('Name *', { selector: 'input' })
}

describe('CustomersScreen — Dubletten-Hinweis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('zeigt namensgleiche Kunden als Hinweis an', async () => {
    routeFetch([MUELLER])
    const input = await openNewCustomerForm()
    fireEvent.change(input, { target: { value: 'Hans Müller' } })

    const hint = await screen.findByRole('status', {}, { timeout: 3000 })
    expect(hint).toHaveTextContent('Es gibt bereits einen Kunden mit diesem Namen')
    expect(hint).toHaveTextContent('Bahnhofstrasse 1, 8001 Zürich')
  })

  it('blockiert das Speichern nicht — der Name bleibt speicherbar', async () => {
    routeFetch([MUELLER])
    const input = await openNewCustomerForm()
    fireEvent.change(input, { target: { value: 'Hans Müller' } })
    await screen.findByRole('status', {}, { timeout: 3000 })

    fireEvent.click(screen.getByText('Speichern'))

    await waitFor(() => {
      const post = mockFetch.mock.calls.find(
        c => (c[1] as RequestInit | undefined)?.method === 'POST',
      )
      expect(post).toBeDefined()
      expect(JSON.parse((post![1] as RequestInit).body as string).name).toBe('Hans Müller')
    })
    // Der Speichern-Button ist zu keinem Zeitpunkt wegen des Hinweises gesperrt.
    expect(screen.queryByText(/nicht möglich|bereits vergeben/i)).toBeNull()
  })

  it('zeigt nichts, solange kein Namensgleicher existiert', async () => {
    routeFetch([])
    const input = await openNewCustomerForm()
    fireEvent.change(input, { target: { value: 'Einmalig AG' } })

    await waitFor(() => expect(nameCheckCalls().length).toBeGreaterThan(0), { timeout: 3000 })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('fragt bei leerem Namen gar nicht erst an', async () => {
    routeFetch([MUELLER])
    const input = await openNewCustomerForm()
    fireEvent.change(input, { target: { value: 'Hans' } })
    fireEvent.change(input, { target: { value: '   ' } })

    await new Promise(r => setTimeout(r, 700))
    expect(nameCheckCalls()).toHaveLength(0)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('verschluckt einen fehlgeschlagenen Check lautlos', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/pwa/admin/customers/name-check')) throw new Error('offline')
      if (path.startsWith('/pwa/admin/customers/list')) return EMPTY_LIST
      return { id: 'neu' }
    })
    const input = await openNewCustomerForm()
    fireEvent.change(input, { target: { value: 'Hans Müller' } })

    await waitFor(() => expect(nameCheckCalls().length).toBeGreaterThan(0), { timeout: 3000 })
    expect(screen.queryByRole('status')).toBeNull()
    // Formular bleibt bedienbar.
    expect(screen.getByText('Speichern')).toBeEnabled()
  })
})

// Anrede (Migration 20260820b): gespeichert wird der Schlüssel, nicht die
// Druckform — die baut das PDF selbst (db.customers.salutation_label).
describe('CustomersScreen — Anrede', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  function savedCustomerPayload() {
    const call = mockFetch.mock.calls.find(
      c => (c[0] as string) === '/pwa/admin/customers' && (c[1] as RequestInit)?.method === 'POST',
    )
    return JSON.parse((call![1] as RequestInit).body as string)
  }

  it('schickt den gewählten Schlüssel mit', async () => {
    routeFetch([])
    const input = await openNewCustomerForm()
    fireEvent.change(input, { target: { value: 'Hans Müller' } })
    fireEvent.change(screen.getByLabelText('Anrede'), { target: { value: 'herr' } })
    fireEvent.click(screen.getByText('Speichern'))

    await waitFor(() => expect(savedCustomerPayload().salutation).toBe('herr'))
  })

  it('schickt null statt Leerstring, wenn keine Anrede gewählt ist', async () => {
    // '' verstiesse gegen customers_salutation_check; null leert das Feld sauber.
    routeFetch([])
    const input = await openNewCustomerForm()
    fireEvent.change(input, { target: { value: 'Huber GmbH' } })
    fireEvent.click(screen.getByText('Speichern'))

    await waitFor(() => expect(savedCustomerPayload().salutation).toBeNull())
  })

  it('zeigt die Druckform in der Liste vor dem Namen', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/pwa/admin/customers/list')) {
        return { ...EMPTY_LIST, rows: [{ ...MUELLER, salutation: 'herr' }], total: 1 }
      }
      return { matches: [] }
    })
    render(<CustomersScreen />)
    expect(await screen.findByText('Herr')).toBeInTheDocument()
    expect(screen.getByText('Hans Müller')).toBeInTheDocument()
  })
})

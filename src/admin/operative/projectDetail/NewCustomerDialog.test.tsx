import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NewCustomerDialog } from './NewCustomerDialog'
import { apiFetch } from '../../../api/client'

// WW-71: die Kundenmaske des Kundenstamms über der Projektmaske. Nur Netzwerk
// und Flags gemockt — die Maske selbst ist die echte.
vi.mock('../../../api/client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}))
vi.mock('../../../api/auth', () => ({ getMe: vi.fn().mockResolvedValue({}) }))
vi.mock('../../../api/modules', () => ({ isFeatureEnabled: () => false, hasModule: () => false }))
vi.mock('../../../shared/AddressAutocomplete', () => ({
  AddressAutocomplete: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Adresse" value={value} onChange={e => onChange(e.target.value)} />
  ),
}))
vi.mock('../../../shared/CompanySearch', () => ({ CompanySearch: () => null }))

const mockFetch = vi.mocked(apiFetch)
const CREATED = { id: 'c-neu', name: 'Hans Muster', first_name: 'Hans', last_name: 'Muster' }

function postBody(): Record<string, unknown> | null {
  const post = mockFetch.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'POST')
  return post ? JSON.parse((post[1] as RequestInit).body as string) : null
}

describe('NewCustomerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/pwa/admin/customers/name-check')) return { matches: [] }
      return CREATED
    })
  })

  it('übernimmt den Suchtext, bietet die Aufteilung an und gibt den angelegten Kunden zurück', async () => {
    const onCreated = vi.fn()
    render(<NewCustomerDialog query="Muster Hans" onCreated={onCreated} onCancel={vi.fn()} />)

    const last = screen.getByLabelText('Nachname / Bezeichnung *', { selector: 'input' }) as HTMLInputElement
    expect(last.value).toBe('Muster Hans')
    // Kein «← Zurück» zur Kundenliste — im Dialog gibt es keine.
    expect(screen.queryByText('← Zurück')).toBeNull()

    fireEvent.click(screen.getByText('Vorname «Hans», Nachname «Muster»'))
    fireEvent.click(screen.getByText('Anlegen und übernehmen'))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED))
    expect(postBody()).toMatchObject({ first_name: 'Hans', last_name: 'Muster', name: 'Hans Muster' })
  })

  it('legt eine gesuchte Telefonnummer ins Feld Mobil', () => {
    render(<NewCustomerDialog query="079 576 55 16" onCreated={vi.fn()} onCancel={vi.fn()} />)
    expect((screen.getByPlaceholderText('079 123 45 67') as HTMLInputElement).value).toBe('079 576 55 16')
    expect((screen.getByLabelText('Nachname / Bezeichnung *', { selector: 'input' }) as HTMLInputElement).value).toBe('')
  })

  it('schliesst nicht per Klick daneben, aber über «Abbrechen»', () => {
    const onCancel = vi.fn()
    render(<NewCustomerDialog query="" onCreated={vi.fn()} onCancel={onCancel} />)
    const overlay = screen.getByRole('dialog', { name: 'Neuer Kunde' })
    fireEvent.mouseDown(overlay)
    fireEvent.click(overlay)
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Abbrechen'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

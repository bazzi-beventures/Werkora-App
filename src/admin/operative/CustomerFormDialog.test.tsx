import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Customer } from '../../api/admin/customers'
import { CustomerFormDialog } from './CustomerFormDialog'
import { apiFetch } from '../../api/client'

// docs/specs/mail-eingang-triage.md §4.2: «Kontakt ergänzen» öffnet die
// Kundenmaske des Kundenstamms über dem Eingang. Nur Netzwerk und Flags
// gemockt — die Maske selbst ist die echte. (Der Fall «neuer Kunde» hat seine
// Tests in projectDetail/NewCustomerDialog.test.tsx.)
vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}))
vi.mock('../../api/auth', () => ({ getMe: vi.fn().mockResolvedValue({}) }))
vi.mock('../../api/modules', () => ({ isFeatureEnabled: () => false, hasModule: () => false }))
vi.mock('../../shared/AddressAutocomplete', () => ({
  AddressAutocomplete: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Adresse" value={value} onChange={e => onChange(e.target.value)} />
  ),
}))
vi.mock('../../shared/CompanySearch', () => ({ CompanySearch: () => null }))

const mockFetch = vi.mocked(apiFetch)

const KUNDE = {
  id: 'c1', name: 'Hans Muster', first_name: 'Hans', last_name: 'Muster', salutation: null, company: null,
  email: null, additional_emails: [], phone: '079 111 22 33', phone_landline: null, address: null,
  billing_name: null, billing_address: null, object_address: null, local_contact_name: null,
  local_contact_phone: null, owner_contact_name: null, owner_contact_phone: null, notes: null,
  created_at: '2026-01-01T00:00:00Z',
} as Customer

function patch(): { path: string; body: Record<string, unknown> } | null {
  const call = mockFetch.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'PATCH')
  return call ? { path: call[0] as string, body: JSON.parse((call[1] as RequestInit).body as string) } : null
}

const emailFeld = () => document.querySelector('input[type="email"]') as HTMLInputElement
const mobilFeld = () => screen.getByPlaceholderText('079 123 45 67') as HTMLInputElement

describe('CustomerFormDialog — bestehender Kunde mit Kontakt-Vorschlag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/pwa/admin/customers/name-check')) return { matches: [] }
      if (init?.method === 'PATCH') return { ...KUNDE, email: 'hans@muster.ch' }
      return []
    })
  })

  it('füllt das leere Feld vor, speichert aber erst auf Knopfdruck — über den Weg des Kundenstamms', async () => {
    const onSave = vi.fn()
    render(
      <CustomerFormDialog label="Kunde bearbeiten" initial={KUNDE}
        ergaenzung={{ feld: 'email', wert: 'hans@muster.ch' }} onSave={onSave} onCancel={vi.fn()} />,
    )
    expect(screen.getByRole('dialog', { name: 'Kunde bearbeiten' })).toBeInTheDocument()
    expect(emailFeld().value).toBe('hans@muster.ch')
    // Die übrigen Felder tragen den Stand des Kunden.
    expect(mobilFeld().value).toBe('079 111 22 33')
    expect(screen.getByTestId('customer-ergaenzung')).toHaveTextContent(/noch nicht gespeichert/)
    // Kein Text aus dem «Neuer Kunde»-Fall der Projektmaske.
    expect(screen.queryByText(/als Kunde dieses Projekts gewählt/)).toBeNull()
    expect(screen.queryByText('Anlegen und übernehmen')).toBeNull()
    expect(patch()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...KUNDE, email: 'hans@muster.ch' }))
    expect(patch()?.path).toBe('/pwa/admin/customers/c1')
    expect(patch()?.body).toMatchObject({ email: 'hans@muster.ch', phone: '079 111 22 33', last_name: 'Muster' })
  })

  it('lässt ein ausgefülltes Feld stehen und nennt den vorgeschlagenen Wert', () => {
    render(
      <CustomerFormDialog label="Kunde bearbeiten" initial={KUNDE}
        ergaenzung={{ feld: 'phone', wert: '079 999 99 99' }} onSave={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(mobilFeld().value).toBe('079 111 22 33')
    expect(screen.getByTestId('customer-ergaenzung')).toHaveTextContent(
      'Vorschlag aus dem Mail-Eingang für «Mobil»: «079 999 99 99». Im Feld steht bereits «079 111 22 33»',
    )
  })

  it('zeigt einen Vorschlag mit Markup als Text', () => {
    render(
      <CustomerFormDialog label="Kunde bearbeiten" initial={KUNDE}
        ergaenzung={{ feld: 'phone', wert: '<img src=x onerror=alert(1)>' }} onSave={vi.fn()} onCancel={vi.fn()} />,
    )
    const hinweis = screen.getByTestId('customer-ergaenzung')
    expect(hinweis.querySelector('img')).toBeNull()
    expect(hinweis.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('«Abbrechen» speichert nichts, und ein Klick daneben schliesst nicht', () => {
    const onCancel = vi.fn()
    const onSave = vi.fn()
    render(
      <CustomerFormDialog label="Kunde bearbeiten" initial={KUNDE}
        ergaenzung={{ feld: 'email', wert: 'hans@muster.ch' }} onSave={onSave} onCancel={onCancel} />,
    )
    const overlay = screen.getByRole('dialog', { name: 'Kunde bearbeiten' })
    fireEvent.mouseDown(overlay)
    fireEvent.click(overlay)
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Abbrechen'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
    expect(patch()).toBeNull()
  })

  it('ohne Vorschlag ist es die Kundenmaske wie im Kundenstamm', () => {
    render(<CustomerFormDialog label="Kunde bearbeiten" initial={KUNDE} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByTestId('customer-ergaenzung')).toBeNull()
    expect(emailFeld().value).toBe('')
  })
})

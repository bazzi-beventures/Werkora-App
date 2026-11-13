/**
 * «Kunde anlegen» im Eingang — docs/specs/mail-eingang-triage.md §4.1.
 * Geschrieben wird nur über die echte Kundenmaske; gemockt ist, was ans Netz geht.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EingangVorschlag } from '../../api/admin/mailEingang'

const acceptMailVorschlag = vi.fn()
vi.mock('../../api/admin/mailEingang', () => ({
  acceptMailVorschlag: (...a: unknown[]) => acceptMailVorschlag(...a),
  rejectMailVorschlag: vi.fn(),
  searchMailEingangProjekte: vi.fn().mockResolvedValue([]),
}))

const getCustomer = vi.fn()
const saveCustomer = vi.fn()
vi.mock('../../api/admin/customers', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/admin/customers')>(),
  getCustomer: (...a: unknown[]) => getCustomer(...a),
  saveCustomer: (...a: unknown[]) => saveCustomer(...a),
  checkCustomerName: vi.fn().mockResolvedValue([]),
  getCustomerComments: vi.fn().mockResolvedValue([]),
  getCustomerProjects: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../api/auth', () => ({ getMe: vi.fn().mockResolvedValue({}) }))
vi.mock('../../shared/AddressAutocomplete', () => ({
  AddressAutocomplete: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Adresse" value={value} onChange={e => onChange(e.target.value)} />
  ),
}))
vi.mock('../../shared/CompanySearch', () => ({ CompanySearch: () => null }))

import VorschlagKarte from './VorschlagKarte'

const VORSCHLAG: EingangVorschlag = {
  id: 's-kunde', typ: 'kunde_anlegen', status: 'offen', created: null, decided_by_name: null, decided_at: null,
  payload: {
    name: 'Eva Meier', email: 'eva.meier@example.com', phone: '079 555 99 88', phone_landline: '',
    address: 'Rebbergweg 12, 8610 Uster',
    kandidaten: [{ id: 'k5', name: 'Meier Eva', address: 'Uster', email: '', phone: '', grund: 'ähnlicher Name' }],
  },
}
const BESTEHEND = {
  id: 'k5', name: 'Eva Meier', first_name: 'Eva', last_name: 'Meier', salutation: null, company: null,
  email: 'eva.meier@example.com', additional_emails: [], phone: null, phone_landline: null, address: 'Uster',
  billing_name: null, billing_address: null, object_address: null, local_contact_name: null,
  local_contact_phone: null, owner_contact_name: null, owner_contact_phone: null, notes: null,
  created_at: '2026-01-01T00:00:00Z',
}
const ENTSCHIEDEN = {
  suggestion: { ...VORSCHLAG, status: 'uebernommen' as const, decided_by_name: 'Petra Büro', decided_at: '2026-11-12T13:05:00Z' },
  item_status: 'erledigt' as const,
}

const speichern = (dialog: HTMLElement) => dialog.querySelector('button[type="submit"]') as HTMLButtonElement

beforeEach(() => {
  acceptMailVorschlag.mockReset().mockResolvedValue(ENTSCHIEDEN)
  getCustomer.mockReset().mockResolvedValue(BESTEHEND)
  saveCustomer.mockReset().mockImplementation(async (input: Record<string, unknown>, id?: string) => (
    { ...BESTEHEND, ...input, id: id ?? 'k-neu' }))
})

function karte(onEntschieden = vi.fn()) {
  render(<VorschlagKarte itemId="m1" vorschlag={VORSCHLAG} onEntschieden={onEntschieden} onFehler={vi.fn()} />)
  return screen.getByTestId('vorschlag-s-kunde')
}

describe('«Kunde anlegen» über das Kundenformular', () => {
  it('zeigt die Werte aus der Mail und die möglichen Dubletten, schreibt aber nichts', () => {
    const k = karte()
    expect(within(k).getByText('Rebbergweg 12, 8610 Uster')).toBeInTheDocument()
    expect(within(k).getByText('Meier Eva · Uster · ähnlicher Name')).toBeInTheDocument()
    expect(within(k).queryByRole('button', { name: 'Übernehmen' })).toBeNull()
    expect(saveCustomer).not.toHaveBeenCalled()
  })

  it('legt den Kunden vorbefüllt in der Maske an und bestätigt erst danach mit seiner id', async () => {
    const user = userEvent.setup()
    const onEntschieden = vi.fn()
    const k = karte(onEntschieden)
    await user.click(within(k).getByRole('button', { name: 'Neuen Kunden anlegen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neuer Kunde' })
    expect((dialog.querySelector('input[type="email"]') as HTMLInputElement).value).toBe('eva.meier@example.com')
    expect(within(dialog).getAllByLabelText('Adresse')[0]).toHaveValue('Rebbergweg 12, 8610 Uster')
    expect(acceptMailVorschlag).not.toHaveBeenCalled()

    await user.click(speichern(dialog))
    await waitFor(() => expect(saveCustomer).toHaveBeenCalledTimes(1))
    expect(saveCustomer.mock.calls[0][0]).toMatchObject({
      email: 'eva.meier@example.com', phone: '079 555 99 88', address: 'Rebbergweg 12, 8610 Uster',
    })
    await waitFor(() => expect(acceptMailVorschlag).toHaveBeenCalledWith('m1', 's-kunde', { customer_id: 'k-neu' }))
    expect(onEntschieden).toHaveBeenCalled()
  })

  it('öffnet beim Kandidaten dessen Maske mit der neuen Nummer statt eines zweiten Kunden', async () => {
    const user = userEvent.setup()
    const k = karte()
    await user.click(within(k).getByRole('button', { name: 'Ist dieser Kunde' }))
    expect(getCustomer).toHaveBeenCalledWith('k5')
    const dialog = await screen.findByRole('dialog', { name: 'Kunde bearbeiten' })
    expect(within(dialog).getByTestId('customer-ergaenzung')).toHaveTextContent(/079 555 99 88/)

    await user.click(speichern(dialog))
    await waitFor(() => expect(saveCustomer).toHaveBeenCalledTimes(1))
    expect(saveCustomer.mock.calls[0][1]).toBe('k5')
    await waitFor(() => expect(acceptMailVorschlag).toHaveBeenCalledWith('m1', 's-kunde', { customer_id: 'k5' }))
  })

  it('tut beim Abbrechen nichts', async () => {
    const user = userEvent.setup()
    const k = karte()
    await user.click(within(k).getByRole('button', { name: 'Neuen Kunden anlegen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neuer Kunde' })
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(saveCustomer).not.toHaveBeenCalled()
    expect(acceptMailVorschlag).not.toHaveBeenCalled()
  })
})

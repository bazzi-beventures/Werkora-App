import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KontaktNameInput } from './KontaktNameInput'
import type { Customer } from '../../../api/admin/customers'

// Das Namensfeld bleibt freier Text — die Vorschläge sind ein Angebot obendrauf.

function customer(over: Partial<Customer> & { id: string; name: string }): Customer {
  return {
    salutation: null, company: null, email: null, additional_emails: null,
    phone: null, phone_landline: null, address: null, billing_name: null,
    billing_address: null, object_address: null, local_contact_name: null,
    local_contact_phone: null, owner_contact_name: null, owner_contact_phone: null,
    notes: null, created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

const CUSTOMERS = [
  customer({ id: 'c-1', name: 'Müller Hans', phone: '079 111 22 33', local_contact_name: 'Peter Abwart' }),
  customer({ id: 'c-2', name: 'Zimmerli AG' }),
]

function Harness({ onPick = vi.fn() }: { onPick?: (c: unknown) => void }) {
  // Kontrolliertes Feld wie in der Maske: der Aufrufer hält den Wert.
  return <Controlled onPick={onPick} />
}

function Controlled({ onPick }: { onPick: (c: unknown) => void }) {
  const [v, setV] = useState('')
  return <KontaktNameInput value={v} onChange={setV} onPick={onPick} customers={CUSTOMERS} ariaLabel="Name" />
}

describe('KontaktNameInput', () => {
  it('zeigt Treffer aus dem Kundenstamm erst ab zwei Zeichen', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('combobox', { name: 'Name' })
    await user.type(input, 'm')
    expect(screen.queryByRole('listbox')).toBeNull()
    await user.type(input, 'ü')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('Müller Hans')).toBeInTheDocument()
  })

  it('bleibt ohne Treffer ein normales Textfeld', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('combobox', { name: 'Name' })
    await user.type(input, 'Niemand Bekanntes')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input).toHaveValue('Niemand Bekanntes')
  })

  it('übergibt den geklickten Vorschlag samt Rolle', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    await user.type(screen.getByRole('combobox', { name: 'Name' }), 'abwart')
    fireEvent.mouseDown(screen.getByText('Peter Abwart'))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'c-1', role: 'baustellenkontakt', name: 'Peter Abwart',
    }))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('wählt mit Enter den markierten Vorschlag, ohne das Formular abzuschicken', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    const onSubmit = vi.fn(e => e.preventDefault())
    render(<form onSubmit={onSubmit}><Harness onPick={onPick} /></form>)
    const input = screen.getByRole('combobox', { name: 'Name' })
    await user.type(input, 'zimm')
    await user.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'c-2', role: 'kunde' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

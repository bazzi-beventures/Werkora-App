import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomerFromKontaktDialog } from './CustomerFromKontaktDialog'
import { saveCustomer } from '../../../api/admin/customers'
import type { Kontakt } from '../../../api/admin/projects'

vi.mock('../../../api/admin/customers', () => ({
  saveCustomer: vi.fn(),
}))
const mockSave = vi.mocked(saveCustomer)

const ANNA: Kontakt = { name: 'Anna Neu', kommentar: '', telefon: '079 1', email: 'anna@example.ch' }
const BRUNO: Kontakt = { name: 'Bruno Bau', kommentar: 'Architekt', telefon: '', email: '' }

beforeEach(() => {
  mockSave.mockReset()
  mockSave.mockImplementation(async input => ({ id: `id-${input.name}`, name: input.name } as never))
})

describe('CustomerFromKontaktDialog', () => {
  it('legt die Person mit Name/Telefon/E-Mail an und reicht den Kunden weiter', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn(async () => {})
    render(<CustomerFromKontaktDialog kontakte={[ANNA]} projectHasCustomer={false} onCreated={onCreated} onSkip={vi.fn()} />)

    expect(screen.getByText(/ist noch nicht im Kundenstamm/)).toBeInTheDocument()
    expect(screen.getByText(/wird mit dem neuen Kunden verknüpft/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ja, Kunde anlegen' }))

    expect(mockSave).toHaveBeenCalledWith({ name: 'Anna Neu', phone: '079 1', email: 'anna@example.ch' })
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith([{ id: 'id-Anna Neu', name: 'Anna Neu' }]))
  })

  it('«Nein» legt nichts an', async () => {
    const user = userEvent.setup()
    const onSkip = vi.fn()
    render(<CustomerFromKontaktDialog kontakte={[ANNA]} projectHasCustomer onCreated={vi.fn()} onSkip={onSkip} />)
    expect(screen.queryByText(/wird mit dem neuen Kunden verknüpft/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Nein' }))
    expect(onSkip).toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('lässt bei mehreren Personen abwählen', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn(async () => {})
    render(<CustomerFromKontaktDialog kontakte={[ANNA, BRUNO]} projectHasCustomer onCreated={onCreated} onSkip={vi.fn()} />)

    await user.click(screen.getByRole('checkbox', { name: /Bruno Bau/ }))
    await user.click(screen.getByRole('button', { name: 'Ja, Kunden anlegen' }))

    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Anna Neu' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })

  it('bleibt bei einem Fehler mit Meldung offen', async () => {
    const user = userEvent.setup()
    mockSave.mockRejectedValueOnce(new Error('Name bereits vergeben'))
    const onCreated = vi.fn(async () => {})
    render(<CustomerFromKontaktDialog kontakte={[ANNA]} projectHasCustomer onCreated={onCreated} onSkip={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Ja, Kunde anlegen' }))
    expect(await screen.findByText('Name bereits vergeben')).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Ja, Kunde anlegen' })).toBeEnabled()
  })
})

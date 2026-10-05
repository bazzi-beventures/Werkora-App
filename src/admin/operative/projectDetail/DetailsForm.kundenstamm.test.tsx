import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DetailsForm } from './DetailsForm'
import type { UseProjectForm } from './useProjectForm'
import type { Customer } from '../../../api/admin/customers'

// Feature-Anfrage WW-9: aus der Projektmaske direkt auf die Kundenstammseite,
// z. B. um eine fehlende E-Mail nachzutragen. Das Kundenfeld selbst ist eine
// Suche (Klick öffnet die Vorschläge) — der Link steht deshalb daneben.

const KUNDE = { id: 'c-gehlhaar', name: 'Gehlhaar GmbH' } as unknown as Customer

function formStub(selectedCustomer: Customer | null): UseProjectForm {
  return {
    name: 'MFH Ritterweg', setName: vi.fn(),
    customerId: selectedCustomer?.id ?? '', selectCustomer: vi.fn(), selectedCustomer,
    billingRecipient: '', billingAddress: '',
    objectName: '', setObjectName: vi.fn(),
    objectAddress: '', setObjectAddress: vi.fn(), setObjectAddressTouched: vi.fn(),
    pickObjectAddress: vi.fn(),
    billingDiffers: false, setBillingDiffers: vi.fn(),
    projBillingName: '', setProjBillingName: vi.fn(),
    projBillingAddress: '', setProjBillingAddress: vi.fn(),
    artDerArbeit: [], toggleArt: vi.fn(), entsorgungsart: false,
    bemerkung: '', setBemerkung: vi.fn(),
    geruestfaecher: [], setGeruestfaecher: vi.fn(),
    projektleiterId: '', setProjektleiterId: vi.fn(),
    monteurIds: [], toggleMonteur: vi.fn(),
    appointments: [], changeAppointments: vi.fn(),
    kontakte: [], addKontakt: vi.fn(), updateKontakt: vi.fn(), pickKontaktCustomer: vi.fn(),
    removeKontakt: vi.fn(), toggleSiteContact: vi.fn(), kontakteOhneKundenstamm: () => [],
    eigentuemer: {}, updateEigentuemer: vi.fn(),
    disposal: {}, updateDisposal: vi.fn(),
    wartungInterval: '', setWartungInterval: vi.fn(),
    wartungLastAt: '', setWartungLastAt: vi.fn(),
    wartungNextDueAt: '', setWartungNextDueAt: vi.fn(),
    saving: false, error: '', setError: vi.fn(), isDirty: false,
  } as unknown as UseProjectForm
}

function setup(selectedCustomer: Customer | null, onOpenCustomer?: (id: string) => void) {
  render(
    <DetailsForm
      form={formStub(selectedCustomer)}
      staff={[]}
      customers={selectedCustomer ? [selectedCustomer] : []}
      schedulingEnabled={false}
      showGeruestfach={false}
      showAbnahme={false}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      onOpenCustomer={onOpenCustomer}
    />,
  )
}

describe('DetailsForm — Weg in den Kundenstamm', () => {
  afterEach(cleanup)

  it('verlinkt den gewählten Kunden und springt beim Klick', () => {
    const onOpenCustomer = vi.fn()
    setup(KUNDE, onOpenCustomer)
    const link = screen.getByRole('link', { name: /Im Kundenstamm öffnen/ })
    expect(link.getAttribute('href')).toBe('#/admin/customers/c-gehlhaar')
    fireEvent.click(link)
    expect(onOpenCustomer).toHaveBeenCalledWith('c-gehlhaar')
  })

  it('ohne gewählten Kunden kein Link', () => {
    setup(null, vi.fn())
    expect(screen.queryByRole('link', { name: /Im Kundenstamm öffnen/ })).toBeNull()
  })
})

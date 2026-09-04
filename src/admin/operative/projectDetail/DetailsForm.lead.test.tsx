import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { DetailsForm, StaffMember } from './DetailsForm'
import type { UseProjectForm } from './useProjectForm'

// Der Lead-Monteur (= der zuerst angewählte, monteur_ids[0]) wird in der
// Einsatzplanung rot hervorgehoben. In der Projektmaske sah man ihm bis
// 20260904 nicht an, wer es ist — geprüft wird hier genau diese Markierung.

const STAFF: StaffMember[] = [
  { id: 's-1', name: 'Marvin Walser', projektleiter: true, authorized_user_id: null },
  { id: 's-2', name: 'Flavia Joos', projektleiter: false, authorized_user_id: null },
  { id: 's-3', name: 'Franco Schäfer', projektleiter: false, authorized_user_id: null },
]

function formStub(monteurIds: string[]): UseProjectForm {
  return {
    name: 'MFH Ritterweg', setName: vi.fn(),
    customerId: '', selectCustomer: vi.fn(), selectedCustomer: null,
    billingRecipient: '', billingAddress: '',
    objectName: '', setObjectName: vi.fn(),
    objectAddress: '', setObjectAddress: vi.fn(), setObjectAddressTouched: vi.fn(),
    pickObjectAddress: vi.fn(),
    billingDiffers: false, setBillingDiffers: vi.fn(),
    projBillingName: '', setProjBillingName: vi.fn(),
    projBillingAddress: '', setProjBillingAddress: vi.fn(),
    artDerArbeit: [], toggleArt: vi.fn(), entsorgungsart: false,
    bemerkung: '', setBemerkung: vi.fn(),
    geruestfach: '', setGeruestfach: vi.fn(),
    projektleiterId: 's-1', setProjektleiterId: vi.fn(),
    monteurIds, toggleMonteur: vi.fn(),
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

function setup(monteurIds: string[]) {
  render(
    <DetailsForm
      form={formStub(monteurIds)}
      staff={STAFF}
      customers={[]}
      schedulingEnabled
      showGeruestfach={false}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

// Namen stehen auch im Projektleiter-Dropdown — deshalb nur innerhalb der
// Monteur-Chips suchen.
function chip(name: string): HTMLElement {
  const chips = document.querySelector('.project-team-chips') as HTMLElement
  return within(chips).getByText(name).closest('.project-team-chip') as HTMLElement
}

describe('DetailsForm — Lead-Monteur im Projekt-Team', () => {
  afterEach(cleanup)

  it('färbt den zuerst gewählten Monteur als Lead, nicht den ersten der Liste', () => {
    // Gewählt wurde Flavia zuerst — obwohl Marvin in der Liste oben steht.
    setup(['s-2', 's-1'])
    expect(chip('Flavia Joos')).toHaveClass('lead')
    expect(chip('Marvin Walser')).toHaveClass('active')
    expect(chip('Marvin Walser')).not.toHaveClass('lead')
    expect(chip('Franco Schäfer')).not.toHaveClass('active')
    expect(chip('Flavia Joos')).toHaveAttribute('title', expect.stringContaining('Lead-Monteur'))
  })

  it('erklärt die Farbe erst, wenn mehr als einer im Team ist', () => {
    setup(['s-2'])
    expect(screen.queryByText(/Rot = Lead-Monteur/)).toBeNull()
    cleanup()
    setup(['s-2', 's-1'])
    expect(screen.getByText(/Rot = Lead-Monteur/)).toBeTruthy()
  })
})

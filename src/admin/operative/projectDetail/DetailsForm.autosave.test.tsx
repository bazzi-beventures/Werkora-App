import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DetailsForm, StaffMember } from './DetailsForm'
import type { UseProjectForm } from './useProjectForm'
import type { ProjectAutosave } from './useProjectAutosave'

// Die selbst speichernde Maske (docs/specs/projektmaske-autosave.md): Statuszeile
// statt Knopf, Team-Leiste, Projektleiter-Hinweis, «Als Kunde anlegen».

const STAFF: StaffMember[] = [
  { id: 's-1', name: 'Marvin Walser', projektleiter: true, authorized_user_id: null },
  { id: 's-2', name: 'Flavia Joos', projektleiter: false, authorized_user_id: null },
]

const ANNA = { name: 'Anna Keller', kommentar: '', telefon: '', email: '' }

function formStub(over: Partial<UseProjectForm> = {}): UseProjectForm {
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
    geruestfaecher: [], setGeruestfaecher: vi.fn(),
    projektleiterId: '', setProjektleiterId: vi.fn(),
    monteurIds: ['s-1', 's-2'], toggleMonteur: vi.fn(),
    teamDirty: true, savedMonteurIds: ['s-1'], commitTeam: vi.fn(async () => ''), resetTeam: vi.fn(),
    appointments: [], changeAppointments: vi.fn(),
    kontakte: [ANNA], addKontakt: vi.fn(), updateKontakt: vi.fn(), pickKontaktCustomer: vi.fn(),
    removeKontakt: vi.fn(), toggleSiteContact: vi.fn(), kontakteOhneKundenstamm: () => [ANNA],
    eigentuemer: {}, updateEigentuemer: vi.fn(),
    disposal: {}, updateDisposal: vi.fn(),
    wartungInterval: '', setWartungInterval: vi.fn(),
    wartungLastAt: '', setWartungLastAt: vi.fn(),
    wartungNextDueAt: '', setWartungNextDueAt: vi.fn(),
    saving: false, error: '', setError: vi.fn(), isDirty: false,
    isAppointmentDirty: () => false,
    ...over,
  } as unknown as UseProjectForm
}

let stubForm: UseProjectForm

function autosaveStub(over: Partial<ProjectAutosave> = {}): ProjectAutosave {
  return {
    status: 'saved', savedAt: new Date(2026, 9, 2, 14, 32), error: '', busy: false, savedSomething: true,
    flush: vi.fn(async () => true),
    run: vi.fn(async (t: (f: UseProjectForm) => Promise<string>) => t(stubForm)),
    ...over,
  }
}

function setup(form = formStub(), autosave = autosaveStub(), onCreate = vi.fn()) {
  stubForm = form
  render(
    <DetailsForm
      form={form} staff={STAFF} customers={[]} schedulingEnabled={false}
      showGeruestfach={false} showAbnahme={false}
      onSubmit={vi.fn()} onCancel={vi.fn()}
      autosave={autosave} onCreateCustomerFromKontakt={onCreate}
    />,
  )
  return { form, autosave, onCreate }
}

describe('DetailsForm — selbst speichernd', () => {
  afterEach(cleanup)

  it('zeigt den Status statt eines Speichern-Knopfs', () => {
    setup()
    expect(screen.getByText(/Gespeichert ✓ 14:32/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull()
  })

  it('ein Fehler bietet «Erneut versuchen»', () => {
    const { autosave } = setup(formStub(), autosaveStub({ status: 'error', error: 'Serverfehler' }))
    expect(screen.getByText(/Nicht gespeichert — Serverfehler/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(autosave.flush).toHaveBeenCalled()
  })

  it('Team-Leiste nennt die Änderung und übernimmt über die Schlange', () => {
    const { form, autosave } = setup()
    expect(screen.getByText(/Team geändert \(\+ Flavia Joos\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Team übernehmen' }))
    expect(autosave.run).toHaveBeenCalled()
    expect(form.commitTeam).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }))
    expect(form.resetTeam).toHaveBeenCalled()
  })

  it('ohne Projektleiter ein Hinweis statt einer Rückfrage', () => {
    setup()
    expect(screen.getByText(/Kein Projektleiter zugewiesen/)).toBeTruthy()
  })

  it('neue Person ohne Stammkunde: «+ Als Kunde anlegen»', () => {
    const { onCreate } = setup()
    fireEvent.click(screen.getByRole('button', { name: '+ Als Kunde anlegen' }))
    expect(onCreate).toHaveBeenCalledWith(ANNA)
  })

  it('Feld verlassen stösst das Speichern an', () => {
    const { autosave } = setup()
    fireEvent.blur(screen.getByLabelText('Projektname *'))
    expect(autosave.flush).toHaveBeenCalled()
  })
})

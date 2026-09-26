import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { DetailsForm } from './DetailsForm'
import type { UseProjectForm } from './useProjectForm'

// Das Garantie-Häkchen und das Referenzprojekt in der Projektmaske (Spec
// docs/specs/garantiefall.md §3.9).
//
// Das Häkchen hat eine Vorgeschichte: bis 20260922 war es NUR über den
// Reopen-Dialog erreichbar («Grund: Garantiefall»), der es dem
// wiedereröffneten Ursprungsprojekt verpasste. Mit dem Wegfall dieses Grundes
// war `is_warranty` eine Zeit lang aus der Oberfläche heraus überhaupt nicht
// mehr setzbar — obwohl Rechnungs-Banner, Mindestrechnungs-Ausnahme und die
// Rapport-Vorbelegung daran hängen. Dieser Test hält fest, dass es einen Weg gibt.

vi.mock('../../../api/admin/projects', () => ({ listProjects: vi.fn() }))

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
    geruestfach: '', setGeruestfach: vi.fn(),
    projektleiterId: 's-1', setProjektleiterId: vi.fn(),
    monteurIds: [], toggleMonteur: vi.fn(),
    appointments: [], changeAppointments: vi.fn(),
    kontakte: [], addKontakt: vi.fn(), updateKontakt: vi.fn(), pickKontaktCustomer: vi.fn(),
    removeKontakt: vi.fn(), toggleSiteContact: vi.fn(), kontakteOhneKundenstamm: () => [],
    eigentuemer: {}, updateEigentuemer: vi.fn(),
    disposal: {}, updateDisposal: vi.fn(),
    wartungInterval: '', setWartungInterval: vi.fn(),
    wartungLastAt: '', setWartungLastAt: vi.fn(),
    wartungNextDueAt: '', setWartungNextDueAt: vi.fn(),
    parentProjectId: '', parentProjectLabel: '', pickReferenceProject: vi.fn(),
    completedAt: '', setCompletedAt: vi.fn(),
    isWarranty: false, setIsWarranty: vi.fn(),
    saving: false, error: '', setError: vi.fn(), isDirty: false,
    ...over,
  } as unknown as UseProjectForm
}

function setup(over: Partial<UseProjectForm> = {}, showAbnahme = false) {
  const form = formStub(over)
  render(
    <DetailsForm
      form={form}
      staff={[]}
      customers={[]}
      schedulingEnabled={false}
      showGeruestfach={false}
      showAbnahme={showAbnahme}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
  return form
}

const GARANTIE = /Garantiefall — wird nicht oder nur reduziert verrechnet/

afterEach(cleanup)

describe('Garantie-Häkchen', () => {
  it('fehlt an einem gewöhnlichen Projekt', () => {
    setup()
    expect(screen.queryByLabelText(GARANTIE)).toBeNull()
  })

  it('erscheint bei der Leistungsart Reparatur', () => {
    setup({ artDerArbeit: ['Reparatur'] })
    expect(screen.getByLabelText(GARANTIE)).toBeTruthy()
  })

  it('bleibt sichtbar, wenn es gesetzt ist — auch ohne Leistungsart', () => {
    // Sonst verschwände an einem bestehenden Garantieprojekt der einzige Weg,
    // das Häkchen wieder zu entfernen.
    setup({ isWarranty: true })
    expect(screen.getByLabelText(GARANTIE)).toBeTruthy()
  })

  it('meldet das Setzen und das Entfernen', () => {
    const form = setup({ artDerArbeit: ['Reparatur'] })
    fireEvent.click(screen.getByLabelText(GARANTIE))
    expect(form.setIsWarranty).toHaveBeenCalledWith(true)

    cleanup()
    const gesetzt = setup({ artDerArbeit: ['Reparatur'], isWarranty: true })
    fireEvent.click(screen.getByLabelText(GARANTIE))
    expect(gesetzt.setIsWarranty).toHaveBeenCalledWith(false)
  })

  it('wird vom Referenzprojekt nicht vorbelegt', () => {
    // Ob die Nacharbeit auf Garantie geht, entscheidet das Büro — nicht die
    // Herkunft des Auftrags (Spec §3.9).
    setup({ parentProjectId: 'p-alt', parentProjectLabel: 'Storen Meier' })
    expect((screen.getByLabelText(GARANTIE) as HTMLInputElement).checked).toBe(false)
  })
})

describe('Abnahmedatum', () => {
  it('fehlt, solange das Feature aus ist', () => {
    setup({}, false)
    expect(screen.queryByLabelText(/Abgeschlossen am/)).toBeNull()
  })

  it('steht zum Nachtragen bereit, wenn das Feature an ist', () => {
    const form = setup({}, true)
    const feld = screen.getByLabelText(/Abgeschlossen am/)
    fireEvent.change(feld, { target: { value: '2024-03-14' } })
    expect(form.setCompletedAt).toHaveBeenCalledWith('2024-03-14')
  })
})

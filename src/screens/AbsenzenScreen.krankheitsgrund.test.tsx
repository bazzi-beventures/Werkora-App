import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AbsenzenScreen from './AbsenzenScreen'

// Warum jemand krank ist, ist ein besonders schützenswertes Gesundheitsdatum
// (DSG Art. 5 lit. c). Das Produkt fragte es bis zum 20.09.2026 von sich aus ab:
// das Formular bot bei «Krankheit» ein «Optional»-Bemerkungsfeld an. Ein optionales
// Feld ist hier keine freie Entscheidung des Monteurs, sondern eine Einladung — wer
// es sieht, schreibt hin, was ihm fehlt.
//
// Diese Tests sind der Ratchet für die Zusage, die im Consent-Screen und im
// Mitarbeiter-Handbuch steht. Die Sperren dahinter (Chokepoint in db/absences.py,
// CHECK-Constraint seit Migration 20260920) hängen an tests/unit/test_absence_logic.py.

vi.mock('../api/chat', () => ({
  fetchMyAbsences: vi.fn(async () => []),
  fetchVacationEntitlement: vi.fn(async () => ({
    entitlement: 25, used: 0, taken: 0, planned: 0, remaining: 25, source: 'tenant_default',
  })),
  createAbsenceRequest: vi.fn(async () => ({})),
}))

import { createAbsenceRequest } from '../api/chat'

async function openForm() {
  render(
    <AbsenzenScreen
      canton="ZH"
      onBack={() => {}}
      onNavHome={() => {}}
      onNavRapport={() => {}}
      onNavProfile={() => {}}
      onLoggedOut={() => {}}
    />
  )
  await screen.findByText('Abwesenheit beantragen')
  fireEvent.click(screen.getByText('Abwesenheit beantragen'))
}

const typSelect = () =>
  screen.getByText('Typ').parentElement!.querySelector('select') as HTMLSelectElement
const bemerkungInput = () =>
  screen.queryByPlaceholderText('Optional') as HTMLInputElement | null

describe('AbsenzenScreen — kein Krankheitsgrund', () => {
  beforeEach(() => {
    vi.mocked(createAbsenceRequest).mockClear()
  })

  it('zeigt bei Urlaub ein Bemerkungsfeld', async () => {
    await openForm()
    expect(bemerkungInput()).not.toBeNull()
  })

  it('nimmt das Bemerkungsfeld bei Krankheit weg', async () => {
    await openForm()
    fireEvent.change(typSelect(), { target: { value: 'sick' } })
    expect(bemerkungInput()).toBeNull()
  })

  it('sagt statt des Feldes, dass nicht gefragt wird', async () => {
    // Bewusst ein sichtbarer Satz und keine stillschweigende Auslassung: Ein
    // fehlendes Feld liest sich sonst wie ein Versehen statt wie eine Zusage.
    await openForm()
    fireEvent.change(typSelect(), { target: { value: 'sick' } })
    expect(screen.getByText(/Wir fragen nicht, warum du krank bist/)).toBeTruthy()
  })

  it('schickt eine getippte Bemerkung nicht mit, wenn danach auf Krankheit gewechselt wird', async () => {
    await openForm()
    fireEvent.change(bemerkungInput()!, { target: { value: 'Grippe, Fieber 39' } })
    fireEvent.change(typSelect(), { target: { value: 'sick' } })
    fireEvent.click(screen.getByRole('button', { name: 'Einreichen' }))

    await waitFor(() => expect(createAbsenceRequest).toHaveBeenCalled())
    const payload = vi.mocked(createAbsenceRequest).mock.calls[0][0]
    expect(payload.absence_type).toBe('sick')
    expect(payload.comment).toBe('')
    expect(JSON.stringify(payload)).not.toContain('Grippe')
  })
})

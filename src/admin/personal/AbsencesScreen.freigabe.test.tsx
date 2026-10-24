/**
 * Freigabe-Knöpfe je Zeile — docs/specs/ferien-freigabe-recht.md.
 *
 * Der Server schickt je Antrag `decide_block`: `null` heisst «du darfst»,
 * sonst steht der Grund da. Der Knopf liest dieselbe Regel wie der Guard —
 * eine zweite, im Frontend nachgebaute Regel liefe beim Modus-Wechsel auseinander.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Absence } from '../../api/admin/absences'

vi.mock('../useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('./AbsenceCalendar', () => ({ default: () => <div /> }))

const getAdminAbsences = vi.fn()
vi.mock('../../api/admin', () => ({
  getAdminAbsences: (status?: string) => getAdminAbsences(status),
  approveAbsence: vi.fn(),
  rejectAbsence: vi.fn(),
  DECIDE_BLOCK_TEXT: {
    own: 'Eigener Antrag — gibt jemand anderes frei',
    no_right: 'Freigabe durch berechtigte Personen',
  },
}))

import AbsencesScreen from './AbsencesScreen'

function absenz(over: Partial<Absence>): Absence {
  return {
    id: 'a-1', staff_name: 'Hans Muster', absence_type: 'vacation',
    start_date: '2026-08-10', end_date: '2026-08-14', status: 'requested', note: null,
    ...over,
  }
}

beforeEach(() => getAdminAbsences.mockReset())

describe('AbsencesScreen — wer darf entscheiden', () => {
  it('zeigt die Knöpfe ohne Sperre und bei älterem Server ohne das Feld', async () => {
    getAdminAbsences.mockResolvedValue([
      absenz({ id: 'a', decide_block: null }),
      absenz({ id: 'b', staff_name: 'Alt' }),
    ])
    render(<AbsencesScreen />)
    await screen.findByText('Alt')
    expect(screen.getAllByRole('button', { name: /Genehmigen/ })).toHaveLength(2)
  })

  it('ersetzt die Knöpfe beim eigenen Antrag durch den Grund', async () => {
    getAdminAbsences.mockResolvedValue([absenz({ decide_block: 'own' })])
    render(<AbsencesScreen />)
    expect(await screen.findByText('Eigener Antrag — gibt jemand anderes frei')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Genehmigen/ })).toBeNull()
  })

  it('sagt im Modus «nur Berechtigte», wer freigibt', async () => {
    getAdminAbsences.mockResolvedValue([absenz({ decide_block: 'no_right' })])
    render(<AbsencesScreen />)
    expect(await screen.findByText('Freigabe durch berechtigte Personen')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ablehnen/ })).toBeNull()
  })
})

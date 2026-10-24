/**
 * «Ferienanträge» in der Mitarbeiter-App — docs/specs/ferien-freigabe-recht.md §3.3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Absence } from '../api/admin/absences'

const getAdminAbsences = vi.fn()
const approveAbsence = vi.fn()
const rejectAbsence = vi.fn()
vi.mock('../api/admin/absences', () => ({
  getAdminAbsences: (status?: string) => getAdminAbsences(status),
  approveAbsence: (id: string) => approveAbsence(id),
  rejectAbsence: (id: string) => rejectAbsence(id),
  DECIDE_BLOCK_TEXT: {
    own: 'Eigener Antrag — gibt jemand anderes frei',
    no_right: 'Freigabe durch berechtigte Personen',
  },
}))

import FerienantraegeScreen from './FerienantraegeScreen'

function absenz(over: Partial<Absence>): Absence {
  return {
    id: 'a-1', staff_name: 'Hans Muster', absence_type: 'vacation',
    start_date: '2026-08-10', end_date: '2026-08-14', status: 'requested', note: null,
    decide_block: null, ...over,
  }
}

beforeEach(() => {
  getAdminAbsences.mockReset()
  approveAbsence.mockReset().mockResolvedValue(undefined)
  rejectAbsence.mockReset().mockResolvedValue(undefined)
})

describe('FerienantraegeScreen', () => {
  it('lädt nur die offenen Anträge und genehmigt einen', async () => {
    getAdminAbsences.mockResolvedValue([absenz({})])
    const user = userEvent.setup()
    render(<FerienantraegeScreen onBack={() => {}} onLoggedOut={() => {}} />)
    await screen.findByText('Hans Muster')
    expect(getAdminAbsences).toHaveBeenCalledWith('requested')

    await user.click(screen.getByRole('button', { name: 'Genehmigen' }))
    expect(approveAbsence).toHaveBeenCalledWith('a-1')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Hans Muster: genehmigt'))
    expect(screen.getByText('Keine offenen Anträge.')).toBeInTheDocument()
  })

  it('zeigt beim eigenen Antrag keine Knöpfe', async () => {
    getAdminAbsences.mockResolvedValue([absenz({ decide_block: 'own' })])
    render(<FerienantraegeScreen onBack={() => {}} onLoggedOut={() => {}} />)
    expect(await screen.findByText('Eigener Antrag — gibt jemand anderes frei')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Genehmigen' })).toBeNull()
  })
})

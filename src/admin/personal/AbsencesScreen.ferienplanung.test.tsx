/**
 * Befunde der Ferienplanung im Freigabe-Screen — docs/specs/ferienplanung.md §7.1.
 *
 * Ein harter Befund verlangt beim Genehmigen eine Begründung (Entscheid E1), die
 * als `override_grund` mitgeht; ohne Befund bleibt die Freigabe ein Klick.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Absence } from '../../api/admin/absences'

vi.mock('../useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('./AbsenceCalendar', () => ({ default: () => <div /> }))

const getAdminAbsences = vi.fn()
const approveAbsence = vi.fn()
vi.mock('../../api/admin', () => ({
  getAdminAbsences: (status?: string) => getAdminAbsences(status),
  approveAbsence: (...a: unknown[]) => approveAbsence(...a),
  rejectAbsence: vi.fn(),
  DECIDE_BLOCK_TEXT: {},
}))

import AbsencesScreen from './AbsencesScreen'

const HART = {
  quelle: 'pflicht', regel_id: null, art: 'zwei_wochen', haerte: 'hart',
  titel: 'Zwei Wochen Ferien am Stück pro Jahr (gesetzlich)', tage: ['2026-08-10'], konkurrenz: [],
  gesetz: 'OR 329c Abs. 1',
}

function absenz(over: Partial<Absence>): Absence {
  return {
    id: 'a-1', staff_name: 'Hans Muster', absence_type: 'vacation',
    start_date: '2026-08-10', end_date: '2026-08-14', status: 'requested', note: null, decide_block: null,
    ...over,
  }
}

beforeEach(() => {
  getAdminAbsences.mockReset()
  approveAbsence.mockReset().mockResolvedValue(undefined)
})

describe('AbsencesScreen — Befunde der Ferienplanung', () => {
  it('zeigt den Befund mit Fundstelle', async () => {
    getAdminAbsences.mockResolvedValue([absenz({ befunde: [HART] })])
    render(<AbsencesScreen />)
    expect(await screen.findByText(/OR 329c Abs\. 1/)).toBeInTheDocument()
  })

  it('harter Befund: Genehmigen öffnet die Begründung und schickt sie mit', async () => {
    getAdminAbsences.mockResolvedValue([absenz({ befunde: [HART] })])
    render(<AbsencesScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Genehmigen/ }))
    expect(approveAbsence).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Begründung'), 'Austritt per Ende August')
    await userEvent.click(screen.getByRole('button', { name: 'Trotzdem genehmigen' }))
    await waitFor(() => expect(approveAbsence).toHaveBeenCalledWith('a-1', undefined, 'Austritt per Ende August'))
  })

  it('ohne Befund bleibt es ein Klick', async () => {
    getAdminAbsences.mockResolvedValue([absenz({})])
    render(<AbsencesScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Genehmigen/ }))
    await waitFor(() => expect(approveAbsence).toHaveBeenCalledWith('a-1', undefined, undefined))
    expect(screen.queryByText('Trotzdem genehmigen')).toBeNull()
  })
})

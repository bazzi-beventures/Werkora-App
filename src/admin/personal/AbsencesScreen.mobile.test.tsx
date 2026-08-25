import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Absence } from '../../api/admin/absences'

let mobile = true
vi.mock('../useIsMobile', () => ({ useIsMobile: () => mobile }))

// Der Kalender-Tab rendert eine eigene, schwere Komponente — fuer die
// Karten-Tests irrelevant und in jsdom nur Rauschen.
vi.mock('./AbsenceCalendar', () => ({ default: () => <div data-testid="kalender" /> }))

const getAdminAbsences = vi.fn()
const approveAbsence = vi.fn()
const rejectAbsence = vi.fn()
vi.mock('../../api/admin', () => ({
  getAdminAbsences: (status?: string) => getAdminAbsences(status),
  approveAbsence: (id: string) => approveAbsence(id),
  rejectAbsence: (id: string) => rejectAbsence(id),
}))

import AbsencesScreen from './AbsencesScreen'

function absenz(over: Partial<Absence> = {}): Absence {
  return {
    id: 'a-1',
    staff_name: 'Hans Muster',
    absence_type: 'vacation',
    start_date: '2026-08-10',
    end_date: '2026-08-14',
    status: 'requested',
    note: null,
    ...over,
  }
}

beforeEach(() => {
  mobile = true
  getAdminAbsences.mockReset().mockResolvedValue([absenz()])
  approveAbsence.mockReset().mockResolvedValue(undefined)
  rejectAbsence.mockReset().mockResolvedValue(undefined)
})

describe('AbsencesScreen — Karten auf dem Handy', () => {
  it('rendert Karten statt einer Tabelle', async () => {
    const { container } = render(<AbsencesScreen />)
    await screen.findByText('Hans Muster')

    expect(container.querySelector('table')).toBeNull()
    expect(container.querySelectorAll('.admin-card')).toHaveLength(1)
  })

  it('rendert am Desktop weiterhin die Tabelle', async () => {
    mobile = false
    const { container } = render(<AbsencesScreen />)
    await screen.findByText('Hans Muster')

    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelectorAll('.admin-card')).toHaveLength(0)
  })

  it('zeigt Typ, Zeitraum und Dauer auf der Karte', async () => {
    render(<AbsencesScreen />)
    await screen.findByText('Hans Muster')

    expect(screen.getByText('Urlaub')).toBeTruthy()
    // Mo 10.08. bis Fr 14.08.2026 sind fuenf Arbeitstage.
    expect(screen.getByText(/10\.08\.2026 – 14\.08\.2026 · 5 Tage/)).toBeTruthy()
  })

  it('genehmigt und lehnt ab', async () => {
    const user = userEvent.setup()
    render(<AbsencesScreen />)
    await screen.findByText('Hans Muster')

    await user.click(screen.getByRole('button', { name: /Genehmigen/ }))
    await waitFor(() => expect(approveAbsence).toHaveBeenCalledWith('a-1'))

    await user.click(screen.getByRole('button', { name: /✕ Ablehnen/ }))
    await waitFor(() => expect(rejectAbsence).toHaveBeenCalledWith('a-1'))
  })

  it('zeigt Aktionen NUR im Tab «Pendent»', async () => {
    // Die Aktionsspalte haengt in der Tabelle an `tab === 'requested'` — die
    // Karte muss dieselbe Bedingung tragen, sonst kann man eine bereits
    // genehmigte Absenz am Handy erneut genehmigen.
    const user = userEvent.setup()
    getAdminAbsences.mockResolvedValue([absenz({ status: 'approved' })])
    render(<AbsencesScreen />)
    await screen.findByText('Hans Muster')

    expect(screen.queryByRole('button', { name: /Genehmigen/ })).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Genehmigt' }))
    await waitFor(() => expect(getAdminAbsences).toHaveBeenCalledWith('approved'))

    expect(screen.queryByRole('button', { name: /✓ Genehmigen/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Ablehnen/ })).toBeNull()
  })

  it('zeigt den Leer-Zustand', async () => {
    getAdminAbsences.mockResolvedValue([])
    const { container } = render(<AbsencesScreen />)

    await screen.findByText('Keine Absenzen gefunden.')
    expect(container.querySelectorAll('.admin-card')).toHaveLength(0)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Correction } from '../../api/admin/corrections'

// Der Screen entscheidet ueber useIsMobile zwischen Tabelle und Karten. Der
// Hook haengt an matchMedia, das in jsdom nicht sinnvoll antwortet — deshalb
// wird er pro Testlauf gemockt statt das Fenster zu manipulieren.
let mobile = true
vi.mock('../useIsMobile', () => ({ useIsMobile: () => mobile }))

const getAdminCorrections = vi.fn()
const approveCorrection = vi.fn()
const rejectCorrection = vi.fn()
vi.mock('../../api/admin', () => ({
  getAdminCorrections: () => getAdminCorrections(),
  approveCorrection: (id: string) => approveCorrection(id),
  rejectCorrection: (id: string) => rejectCorrection(id),
}))

import CorrectionsScreen from './CorrectionsScreen'

function korrektur(over: Partial<Correction> = {}): Correction {
  return {
    id: 'k-1',
    staff_name: 'Hans Muster',
    session_date: '2026-08-09',
    requested_clock_in: '07:15',
    requested_clock_out: '17:00',
    requested_break_minutes: 45,
    current_clock_in: '07:45',
    current_clock_out: '17:00',
    current_break_minutes: 30,
    reason: 'Stempeluhr war offline',
    status: 'pending',
    ...over,
  }
}

beforeEach(() => {
  mobile = true
  getAdminCorrections.mockReset().mockResolvedValue([korrektur()])
  approveCorrection.mockReset().mockResolvedValue(undefined)
  rejectCorrection.mockReset().mockResolvedValue(undefined)
})

describe('CorrectionsScreen — Karten auf dem Handy', () => {
  it('rendert Karten statt einer Tabelle', async () => {
    const { container } = render(<CorrectionsScreen />)
    await screen.findByText('Hans Muster')

    expect(container.querySelector('table')).toBeNull()
    expect(container.querySelectorAll('.admin-card')).toHaveLength(1)
  })

  it('rendert am Desktop weiterhin die Tabelle', async () => {
    mobile = false
    const { container } = render(<CorrectionsScreen />)
    await screen.findByText('Hans Muster')

    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelectorAll('.admin-card')).toHaveLength(0)
  })

  it('klappt die Karte auf und zeigt Vorher/Nachher', async () => {
    const user = userEvent.setup()
    const { container } = render(<CorrectionsScreen />)
    await screen.findByText('Hans Muster')

    expect(screen.queryByText('Zeitänderungen')).toBeNull()
    await user.click(container.querySelector('.admin-card') as HTMLElement)

    expect(screen.getByText('Zeitänderungen')).toBeTruthy()
    // Der alte Wert steht durchgestrichen daneben — das ist der Grund fuers Aufklappen.
    expect(screen.getByText('07:45')).toBeTruthy()
  })

  it('Genehmigen klappt die Karte NICHT auf', async () => {
    // Regression: ohne stopPropagation im Aktions-Container loest jeder
    // Button-Klick zusaetzlich den Karten-Klick aus.
    const user = userEvent.setup()
    render(<CorrectionsScreen />)
    await screen.findByText('Hans Muster')

    await user.click(screen.getByRole('button', { name: /Genehmigen/ }))

    await waitFor(() => expect(approveCorrection).toHaveBeenCalledWith('k-1'))
    expect(screen.queryByText('Zeitänderungen')).toBeNull()
  })

  it('Ablehnen klappt die Karte NICHT auf', async () => {
    const user = userEvent.setup()
    render(<CorrectionsScreen />)
    await screen.findByText('Hans Muster')

    await user.click(screen.getByRole('button', { name: /Ablehnen/ }))

    await waitFor(() => expect(rejectCorrection).toHaveBeenCalledWith('k-1'))
    expect(screen.queryByText('Zeitänderungen')).toBeNull()
  })

  it('zeigt den Leer-Zustand ohne Karten-Liste', async () => {
    getAdminCorrections.mockResolvedValue([])
    const { container } = render(<CorrectionsScreen />)

    await screen.findByText('Keine offenen Korrekturanträge')
    expect(container.querySelectorAll('.admin-card')).toHaveLength(0)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BulkClockInScreen from './BulkClockInScreen'
import { getAdminStaff, getClockStatus, bulkClockIn } from '../../api/admin'

vi.mock('../../api/admin', () => ({
  getAdminStaff: vi.fn(),
  getClockStatus: vi.fn(),
  bulkClockIn: vi.fn(),
}))

const mockStaff = vi.mocked(getAdminStaff)
const mockStatus = vi.mocked(getClockStatus)
const mockBulk = vi.mocked(bulkClockIn)

const STAFF = [
  { id: 's1', name: 'Anna', funktion: 'Monteur', is_active: true },
  { id: 's2', name: 'Bob', funktion: 'Chef', is_active: true },
] as unknown as Awaited<ReturnType<typeof getAdminStaff>>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BulkClockInScreen', () => {
  it('graut bereits Eingestempelte aus (Checkbox disabled)', async () => {
    mockStaff.mockResolvedValue(STAFF)
    mockStatus.mockResolvedValue({ clocked_in_staff_ids: ['s2'] })
    render(<BulkClockInScreen />)

    await screen.findByText('Anna')
    const checkboxes = screen.getAllByRole('checkbox')
    // [0]=Alle auswählen, [1]=Anna, [2]=Bob (eingestempelt → disabled)
    expect(checkboxes[1]).not.toBeDisabled()
    expect(checkboxes[2]).toBeDisabled()
  })

  it('"Alle auswählen" wählt nur nicht-eingestempelte und stempelt sie ein', async () => {
    mockStaff.mockResolvedValue(STAFF)
    mockStatus.mockResolvedValue({ clocked_in_staff_ids: ['s2'] })
    mockBulk.mockResolvedValue({
      results: [{ staff_id: 's1', staff_name: 'Anna', status: 'clocked_in' }],
      clocked_in: 1, already: 0, errors: 0, push_sent: 1,
    })
    const user = userEvent.setup()
    render(<BulkClockInScreen />)

    await screen.findByText('Anna')
    await user.click(screen.getAllByRole('checkbox')[0])  // Alle auswählen

    // Nur s1 ist auswählbar → Button zeigt (1).
    const btn = screen.getByRole('button', { name: /Einstempeln/ })
    await user.click(btn)

    await waitFor(() => expect(mockBulk).toHaveBeenCalledTimes(1))
    const [ids, time] = mockBulk.mock.calls[0]
    expect(ids).toEqual(['s1'])
    expect(time).toMatch(/^\d{2}:\d{2}$/)
  })

  it('stempelt einzeln ausgewählte Mitarbeiter zur eingegebenen Uhrzeit ein', async () => {
    mockStaff.mockResolvedValue(STAFF)
    mockStatus.mockResolvedValue({ clocked_in_staff_ids: [] })
    mockBulk.mockResolvedValue({
      results: [{ staff_id: 's2', staff_name: 'Bob', status: 'clocked_in' }],
      clocked_in: 1, already: 0, errors: 0, push_sent: 1,
    })
    const user = userEvent.setup()
    render(<BulkClockInScreen />)

    await screen.findByText('Bob')
    await user.click(screen.getAllByRole('checkbox')[2])  // Bob
    await user.click(screen.getByRole('button', { name: /Einstempeln/ }))

    await waitFor(() => expect(mockBulk).toHaveBeenCalledTimes(1))
    expect(mockBulk.mock.calls[0][0]).toEqual(['s2'])
  })
})

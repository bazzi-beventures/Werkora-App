import { describe, it, expect, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StaffFilterPills from './StaffFilterPills'
import { staffFirstNameLabel, staffGroup } from './staffFilterGroups'
import type { StaffLite } from './scheduleShared'

const STAFF: StaffLite[] = [
  { id: 'm1', name: 'Almin Pepic', kuerzel: 'AP', role: 'user' },
  { id: 'm2', name: 'Daniel Marty', kuerzel: 'DM', role: null },
  { id: 'a1', name: 'Luca Bazzi', kuerzel: 'LB', role: 'management' },
  { id: 'a2', name: 'Marvin Walser', kuerzel: 'MW', role: 'user', projektleiter: true },
  { id: 'a3', name: 'Celine Hähni', kuerzel: 'CH', role: 'management_light' },
]

function Harness() {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  return <StaffFilterPills staff={STAFF} hiddenStaff={hidden} onHiddenChange={setHidden} />
}

afterEach(() => { window.localStorage.removeItem('schedule-staff-pill-names') })

describe('staffGroup', () => {
  it('Projektleiter, Admin und Management stehen unter Admin, der Rest unter Monteure', () => {
    expect(STAFF.map(staffGroup)).toEqual(['monteur', 'monteur', 'admin', 'admin', 'admin'])
    expect(staffGroup({ id: 'x', name: 'X', role: 'admin' })).toBe('admin')
    expect(staffGroup({ id: 'y', name: 'Y', role: 'user_light' })).toBe('monteur')
  })
})

describe('staffFirstNameLabel', () => {
  it('Vorname plus Initial des letzten Namensteils', () => {
    expect(staffFirstNameLabel('Luca Bazzi')).toBe('Luca B.')
    expect(staffFirstNameLabel('Anna Maria von Arx')).toBe('Anna A.')
    expect(staffFirstNameLabel('Cher')).toBe('Cher')
  })
})

describe('StaffFilterPills', () => {
  it('teilt die Pillen in Monteure und Admin, Admin in eigener Farbe', () => {
    const { container } = render(<Harness />)
    const groups = container.querySelectorAll('.staff-filter-group')
    expect(groups).toHaveLength(2)
    expect(within(groups[0] as HTMLElement).getAllByRole('button', { pressed: true }).map(b => b.textContent))
      .toEqual(['AP', 'DM'])
    const admin = within(groups[1] as HTMLElement).getAllByRole('button', { pressed: true })
    expect(admin.map(b => b.textContent)).toEqual(['LB', 'MW', 'CH'])
    expect(admin.every(b => b.classList.contains('staff-chip-admin'))).toBe(true)
  })

  it('blendet eine ganze Gruppe aus', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Admin ausblenden' }))
    expect(screen.getByText('2 von 5 sichtbar')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Luca Bazzi' }).className).toContain('hidden')
    expect(screen.getByRole('button', { name: 'Almin Pepic' }).className).not.toContain('hidden')
    await userEvent.click(screen.getByRole('button', { name: 'Admin anzeigen' }))
    expect(screen.getByText('5 von 5 sichtbar')).toBeTruthy()
  })

  it('zeigt auf Wunsch Vorname plus Initial statt Kürzel und merkt sich das', async () => {
    const { unmount } = render(<Harness />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Namen statt Kürzel' }))
    expect(screen.getByRole('button', { name: 'Luca Bazzi' }).textContent).toBe('Luca B.')
    expect(window.localStorage.getItem('schedule-staff-pill-names')).toBe('1')
    unmount()
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Almin Pepic' }).textContent).toBe('Almin P.')
  })
})

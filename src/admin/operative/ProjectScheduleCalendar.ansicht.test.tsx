import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleCalendar from './ProjectScheduleCalendar'
import { readScheduleView, writeScheduleView, parseViewDate, SCHEDULE_VIEW_KEY } from './scheduleViewState'

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return { ...actual, resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }) }
})

// Doppelklick auf einen Einsatz → Projektmaske → Zurück baut die Einsatzplanung
// neu auf. Ohne gemerkte Ansicht stand sie danach wieder auf «Monat / heute» mit
// dem ersten Mitarbeiter (docs/specs/einsatzplanung-rueckmeldungen-2026-10.md §2.2).

const STAFF = [
  { id: 's1', name: 'Anna Muster' },
  { id: 's2', name: 'Beat Beispiel' },
]

function renderCal(staff = STAFF) {
  return render(
    <ProjectScheduleCalendar projects={[]} staff={staff} loading={false}
      onSelect={vi.fn()} onReschedule={vi.fn()} />,
  )
}

describe('Einsatzplanung merkt sich die Ansicht in der Sitzung', () => {
  it('Ansicht und Mitarbeiter überleben einen Neuaufbau', async () => {
    const user = userEvent.setup()
    const erst = renderCal()
    await user.click(screen.getByRole('button', { name: 'Mitarbeiter' }))
    await user.selectOptions(screen.getByRole('combobox'), ['s2'])
    erst.unmount()

    renderCal()
    expect(screen.getByRole('button', { name: 'Mitarbeiter' })).toHaveClass('admin-btn-primary')
    expect(screen.getByRole('combobox')).toHaveValue('s2')
  })

  it('findet den Mitarbeiter auch, wenn die Liste erst später kommt', () => {
    writeScheduleView({ view: 'staff', staffId: 's2' })
    const { rerender } = renderCal([])
    rerender(<ProjectScheduleCalendar projects={[]} staff={STAFF} loading={false}
      onSelect={vi.fn()} onReschedule={vi.fn()} />)
    expect(screen.getByRole('combobox')).toHaveValue('s2')
    expect(readScheduleView().staffId).toBe('s2')
  })

  it('startet ohne Ablage wie bisher', () => {
    expect(window.sessionStorage.getItem(SCHEDULE_VIEW_KEY)).toBeNull()
    renderCal()
    expect(screen.getByRole('button', { name: 'Monat' })).toHaveClass('admin-btn-primary')
  })

  it('verträgt eine kaputte Ablage', () => {
    window.sessionStorage.setItem(SCHEDULE_VIEW_KEY, '{kaputt')
    expect(readScheduleView()).toEqual({})
    expect(parseViewDate('2026-13-45x')).toBeNull()
    expect(parseViewDate('2026-11-17')?.getDate()).toBe(17)
  })
})

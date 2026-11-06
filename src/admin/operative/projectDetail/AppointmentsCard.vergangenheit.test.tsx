import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AppointmentsCard from './AppointmentsCard'
import { AppointmentDraft, emptyDraft } from '../projectAppointments'

// WW-72: drei Termine im Januar 2026 statt im Januar 2027 vergeben. Die Kachel
// weist darauf hin — sperrt aber nicht (Nachträge sind legitim).

const STAFF = [{ id: 's-1', name: 'Marvin Walser' }]

function draft(over: Partial<AppointmentDraft> = {}): AppointmentDraft {
  return { ...emptyDraft(), key: 'a-1', id: null, startDate: '2026-01-12', ...over }
}

function setup(d: AppointmentDraft, extra: Partial<React.ComponentProps<typeof AppointmentsCard>> = {}) {
  const view = render(
    <AppointmentsCard appointments={[d]} onChange={vi.fn()} staff={STAFF} projectTeam={['s-1']} {...extra} />,
  )
  // Editor aufklappen (die Zusammenfassung ist der einzige aria-expanded-Knopf).
  fireEvent.click(view.container.querySelector('.project-appt-summary')!)
  return view
}

describe('AppointmentsCard — Termin in der Vergangenheit (WW-72)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 6))
  })
  afterEach(() => vi.useRealTimers())

  it('weist beim neuen Termin auf das vergangene Datum hin', () => {
    setup(draft())
    const hint = screen.getByRole('status')
    expect(hint).toHaveTextContent('in der Vergangenheit')
    expect(hint).toHaveTextContent('12.01.2026')
  })

  it('schweigt bei einem künftigen Datum', () => {
    setup(draft({ startDate: '2027-01-12' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('schweigt beim Aufklappen eines gespeicherten alten Termins', () => {
    // Ohne isDateChanged gilt nur ein Termin ohne id als neu.
    setup(draft({ id: 'a-1' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('meldet sich beim gespeicherten Termin, sobald sein Datum geändert ist', () => {
    setup(draft({ id: 'a-1' }), { isDateChanged: () => true })
    expect(screen.getByRole('status')).toHaveTextContent('in der Vergangenheit')
  })

  it('sperrt nicht: «Termin speichern» bleibt frei und speichert', async () => {
    const commit = vi.fn().mockResolvedValue('')
    setup(draft(), { autosave: { commit, remove: vi.fn(), isDirty: () => true } })
    // Mit Autosave klappt der Editor erst nach dem (hier leeren) Speichern des offenen auf.
    expect(await screen.findByRole('status')).toBeTruthy()
    const save = screen.getByRole('button', { name: 'Termin speichern' })
    expect(save).not.toBeDisabled()
    fireEvent.click(save)
    await vi.waitFor(() => expect(commit).toHaveBeenCalledWith('a-1'))
  })
})

import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import AppointmentsCard from './AppointmentsCard'
import { AppointmentDraft, emptyDraft } from '../projectAppointments'

// Selbst speichernde Maske (docs/specs/projektmaske-autosave.md §3.4): ein
// Termin wird beim Zuklappen bzw. über «Termin speichern» gespeichert, ein
// gespeicherter nach Rückfrage entfernt.

const STAFF = [{ id: 's-1', name: 'Marvin Walser' }]

function draft(over: Partial<AppointmentDraft> = {}): AppointmentDraft {
  return { ...emptyDraft(), key: 'a-1', id: 'a-1', startDate: '2026-10-18', ...over }
}

function setup(appointments: AppointmentDraft[], opts: { dirty?: boolean; commitErr?: string } = {}) {
  const commit = vi.fn(async () => opts.commitErr ?? '')
  const remove = vi.fn(async () => '')
  const onChange = vi.fn()
  render(
    <AppointmentsCard
      appointments={appointments}
      onChange={onChange}
      staff={STAFF}
      projectTeam={['s-1']}
      autosave={{ commit, remove, isDirty: () => opts.dirty ?? true }}
    />,
  )
  return { commit, remove, onChange }
}

function kopf(): HTMLElement {
  return document.querySelector('.project-appt-summary') as HTMLElement
}

describe('AppointmentsCard — selbst speichernd', () => {
  afterEach(cleanup)

  it('Zuklappen speichert den geänderten Termin', async () => {
    const { commit } = setup([draft()])
    fireEvent.click(kopf())
    await waitFor(() => expect(kopf()).toHaveAttribute('aria-expanded', 'true'))
    expect(commit).not.toHaveBeenCalled()

    fireEvent.click(kopf())
    await waitFor(() => expect(commit).toHaveBeenCalledWith('a-1'))
    await waitFor(() => expect(kopf()).toHaveAttribute('aria-expanded', 'false'))
  })

  it('ein ungültiger Termin bleibt offen, mit Meldung im Termin', async () => {
    const { commit } = setup([draft()], { commitErr: 'Startdatum fehlt.' })
    fireEvent.click(kopf())
    await waitFor(() => expect(kopf()).toHaveAttribute('aria-expanded', 'true'))
    fireEvent.click(screen.getByRole('button', { name: 'Termin speichern' }))
    await waitFor(() => expect(commit).toHaveBeenCalled())
    expect(await screen.findByText('Startdatum fehlt.')).toBeTruthy()
    expect(kopf()).toHaveAttribute('aria-expanded', 'true')
  })

  it('ein unveränderter Termin klappt ohne Speichern zu', async () => {
    const { commit } = setup([draft()], { dirty: false })
    fireEvent.click(kopf())
    await waitFor(() => expect(kopf()).toHaveAttribute('aria-expanded', 'true'))
    expect(screen.getByRole('button', { name: 'Gespeichert' })).toBeDisabled()
    fireEvent.click(kopf())
    await waitFor(() => expect(kopf()).toHaveAttribute('aria-expanded', 'false'))
    expect(commit).not.toHaveBeenCalled()
  })

  it('ein gespeicherter Termin wird erst nach Rückfrage entfernt', async () => {
    const { remove, onChange } = setup([draft()])
    fireEvent.click(screen.getByRole('button', { name: 'Termin entfernen' }))
    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByText(/Betroffene Monteure werden benachrichtigt/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('a-1'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ein nie gespeicherter Entwurf verschwindet ohne Frage', () => {
    const { remove, onChange } = setup([draft({ key: 'neu-1', id: null })])
    fireEvent.click(screen.getByRole('button', { name: 'Termin entfernen' }))
    expect(remove).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith([])
  })
})

import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import AppointmentsCard from './AppointmentsCard'
import type { AppointmentDraft } from '../projectAppointments'
import { apiFetch } from '../../../api/client'

// «Termin vorschlagen» in der Termin-Kachel (docs/specs/servicebegleitung.md §6.6):
// «Übernehmen» legt einen Entwurf an und speichert ihn über denselben Weg wie «+ Termin».

vi.mock('../../../api/client', () => ({ apiFetch: vi.fn() }))
const mockFetch = vi.mocked(apiFetch)
const STAFF = [{ id: 's-1', name: 'Marco Keller' }]

function Rahmen({ commit, vorschlag = true }: { commit: (key: string) => Promise<string>; vorschlag?: boolean }) {
  const [liste, setListe] = useState<AppointmentDraft[]>([])
  return (
    <AppointmentsCard
      appointments={liste}
      onChange={next => setListe(prev => (typeof next === 'function' ? next(prev) : next))}
      staff={STAFF}
      projectTeam={[]}
      project={{ art_der_arbeit: ['Reparatur'] }}
      autosave={{ commit, remove: vi.fn(async () => ''), isDirty: () => true }}
      vorschlag={vorschlag ? { projectId: 'p-1', terminwahl: false } : undefined}
    />
  )
}

describe('AppointmentsCard — Terminvorschläge', () => {
  afterEach(() => { cleanup(); mockFetch.mockReset() })

  it('ohne Werkzeug kein Knopf', () => {
    render(<Rahmen commit={vi.fn(async () => '')} vorschlag={false} />)
    expect(screen.queryByRole('button', { name: 'Termin vorschlagen' })).toBeNull()
  })

  it('Übernehmen legt den Termin mit Team, Zeit und Art an und speichert ihn', async () => {
    mockFetch.mockResolvedValueOnce({
      vorschlaege: [{ staff_id: 's-1', name: 'Marco Keller', datum: '2026-11-19', start: '08:00', ende: '10:00',
                      score: 80, gruende: ['morgen'] }],
      ausgeschlossen: [], hinweise: [], grund: '', kind: 'reparatur', dauer_min: 90, horizont: 10, bis: '2026-11-30',
    }).mockResolvedValue({ status: 'success' })
    let gespeichert: string | null = null
    const commit = vi.fn(async (key: string) => { gespeichert = key; return '' })
    render(<Rahmen commit={commit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Termin vorschlagen' }))
    // Vorwahl der Art aus der Art der Arbeit (Reparatur).
    await waitFor(() => expect(JSON.parse(String((mockFetch.mock.calls[0][1] as RequestInit).body)).kind)
      .toBe('reparatur'))
    fireEvent.click(await screen.findByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1))
    expect(gespeichert).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Termin vorschlagen' })).toBeNull()
    expect(document.querySelector('.project-appt-summary')?.textContent).toContain('Reparatur')
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'
import AppointmentsCard from './AppointmentsCard'
import { AppointmentDraft, emptyDraft } from '../projectAppointments'
import { APPOINTMENT_KIND_LABELS, APPOINTMENT_KINDS } from '../../../api/admin/scheduling'

// Die Kachel ist reine Darstellung: Entwürfe rein, geänderte Entwürfe raus.
// Getestet wird genau dieser Vertrag — Speichern übernimmt ProjectDetailScreen.

const STAFF = [
  { id: 's-1', name: 'Marvin Walser' },
  { id: 's-2', name: 'Petra Schmid' },
]

function draft(over: Partial<AppointmentDraft> = {}): AppointmentDraft {
  return { ...emptyDraft(), key: 'a-1', id: 'a-1', startDate: '2026-08-18', ...over }
}

function setup(appointments: AppointmentDraft[], projectTeam: string[] = ['s-1']) {
  const onChange = vi.fn()
  render(
    <AppointmentsCard
      appointments={appointments}
      onChange={onChange}
      staff={STAFF}
      projectTeam={projectTeam}
    />,
  )
  return onChange
}

describe('AppointmentsCard', () => {
  // Feste «heute»-Zeit: das Banner «nächster Termin» hängt am Datum, sonst
  // würden die Erwartungen mit der Zeit kippen.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 14))
  })
  afterEach(() => vi.useRealTimers())

  it('zeigt jeden Termin mit Typ, Zeitraum und Team', () => {
    setup([
      draft({ kind: 'aufmass', startTime: '07:30', endTime: '09:00' }),
      draft({ key: 'a-2', id: 'a-2', startDate: '2026-09-01', ownTeam: true, monteurIds: ['s-2'] }),
    ])
    // Mehrfach, weil ein anstehender Termin zusätzlich im «Nächster Termin»-Banner steht.
    expect(screen.getAllByText('Aufmass').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/07:30–09:00/).length).toBeGreaterThan(0)
    // Ohne eigenes Team gilt das Projekt-Team, mit eigenem Team dessen Auswahl.
    expect(screen.getByText('Projekt-Team: Marvin Walser')).toBeTruthy()
    expect(screen.getByText('Team: Petra Schmid')).toBeTruthy()
  })

  it('nennt den nächsten anstehenden Termin', () => {
    setup([
      draft({ key: 'alt', id: 'alt', startDate: '2026-01-05' }),
      draft({ key: 'next', id: 'next', startDate: '2026-08-18', kind: 'service' }),
    ])
    const banner = screen.getByText(/Nächster Termin:/).parentElement!
    expect(within(banner).getByText(/Service/)).toBeTruthy()
    expect(banner.textContent).toContain('18.08.2026')
  })

  it('meldet «kein künftiger Termin», wenn nichts mehr ansteht', () => {
    setup([])
    expect(screen.getByText('Kein künftiger Termin geplant.')).toBeTruthy()
    expect(screen.getByText('Noch keine Termine geplant.')).toBeTruthy()
  })

  it('hängt einen leeren Termin an, ohne bestehende zu verlieren', () => {
    const bestehend = draft()
    const onChange = setup([bestehend])
    fireEvent.click(screen.getByText('+ Termin hinzufügen'))
    const next = onChange.mock.calls[0][0] as AppointmentDraft[]
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(bestehend)
    expect(next[1]).toMatchObject({ id: null, startDate: '', kind: 'montage' })
  })

  // Wer einen Termin von Hand anlegt, bestimmt meist auch die Mannschaft dafür.
  // Deshalb ist «eigenes Team» beim neuen Termin gesetzt und die Auswahl offen.
  it('legt einen neuen Termin mit gesetztem «eigenes Team» an', () => {
    const onChange = setup([])
    fireEvent.click(screen.getByText('+ Termin hinzufügen'))
    const next = onChange.mock.calls[0][0] as AppointmentDraft[]
    expect(next[0]).toMatchObject({ ownTeam: true, monteurIds: [] })
  })

  it('zeigt beim neuen Termin die Monteur-Auswahl sofort an', () => {
    // Die Kachel ist gesteuert: der neue Entwurf kommt über onChange zurück und
    // wird hier als neuer Prop-Stand nachgereicht — wie im ProjectDetailScreen.
    const onChange = setup([])
    fireEvent.click(screen.getByText('+ Termin hinzufügen'))
    const next = onChange.mock.calls[0][0] as AppointmentDraft[]
    cleanup()
    setup(next)
    fireEvent.click(screen.getByText('Montage'))          // Editor aufklappen
    expect((screen.getByLabelText('Eigenes Team für diesen Termin') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('button', { name: 'Petra Schmid' })).toBeTruthy()
    // Ohne Auswahl bleibt es beim Projekt-Team — der Hinweis sagt das auch.
    expect(screen.getByText('Keine Auswahl = Projekt-Team.')).toBeTruthy()
  })

  it('entfernt einen Termin aus der Liste', () => {
    const onChange = setup([draft(), draft({ key: 'a-2', id: 'a-2' })])
    fireEvent.click(screen.getAllByLabelText('Termin entfernen')[0])
    expect((onChange.mock.calls[0][0] as AppointmentDraft[]).map(d => d.key)).toEqual(['a-2'])
  })

  it('gibt Datums- und Typ-Änderungen als geänderten Entwurf zurück', () => {
    const onChange = setup([draft()])
    fireEvent.click(screen.getByText('Montage'))          // Editor aufklappen
    fireEvent.change(screen.getByLabelText('Termin-Typ'), { target: { value: 'aufmass' } })
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ key: 'a-1', kind: 'aufmass' })
  })

  // Die Typ-Liste kommt aus APPOINTMENT_KIND_LABELS (api/admin/scheduling.ts) —
  // die Kachel zählt sie nicht mehr selbst auf. Der Test hält fest, dass die
  // Registry auch wirklich im Dropdown ankommt (inkl. Demontage/Wiedermontage).
  it('bietet alle Termin-Typen aus der Registry an', () => {
    setup([draft()])
    fireEvent.click(screen.getByText('Montage'))          // Editor aufklappen
    const select = screen.getByLabelText('Termin-Typ')
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(
      APPOINTMENT_KINDS.map(k => APPOINTMENT_KIND_LABELS[k]),
    )
    expect(APPOINTMENT_KINDS).toContain('demontage')
    expect(APPOINTMENT_KINDS).toContain('wiedermontage')
  })

  it('gibt eine Wiedermontage als geänderten Entwurf zurück', () => {
    const onChange = setup([draft()])
    fireEvent.click(screen.getByText('Montage'))
    fireEvent.change(screen.getByLabelText('Termin-Typ'), { target: { value: 'wiedermontage' } })
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ key: 'a-1', kind: 'wiedermontage' })
  })

  it('setzt beim Startdatum das leere Enddatum auf denselben Tag', () => {
    const onChange = setup([draft({ startDate: '', endDate: '' })])
    fireEvent.click(screen.getByText('Montage'))
    fireEvent.change(screen.getByLabelText('Start (Datum)'), { target: { value: '2026-08-18' } })
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      startDate: '2026-08-18', endDate: '2026-08-18',
    })
  })

  it('schaltet das Termin-Team erst nach «eigenes Team» frei', () => {
    const onChange = setup([draft()])
    fireEvent.click(screen.getByText('Montage'))
    // Ohne eigenes Team keine Monteur-Auswahl, dafür der Hinweis aufs Projekt-Team.
    expect(screen.queryByRole('button', { name: 'Petra Schmid' })).toBeNull()
    expect(screen.getByText(/Es gilt das Projekt-Team/)).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Eigenes Team für diesen Termin'))
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ ownTeam: true })
  })

  it('wählt Monteure für den Termin an und wieder ab', () => {
    const onChange = setup([draft({ ownTeam: true, monteurIds: ['s-2'] })])
    fireEvent.click(screen.getByText('Montage'))
    fireEvent.click(screen.getByRole('button', { name: 'Marvin Walser' }))
    expect(onChange.mock.calls[0][0][0].monteurIds).toEqual(['s-2', 's-1'])

    fireEvent.click(screen.getByRole('button', { name: 'Petra Schmid' }))
    expect(onChange.mock.calls[1][0][0].monteurIds).toEqual([])
  })
})

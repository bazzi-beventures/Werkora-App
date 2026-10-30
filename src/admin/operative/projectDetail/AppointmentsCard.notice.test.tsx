import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import AppointmentsCard from './AppointmentsCard'
import { AppointmentDraft, emptyDraft, noticeChanged, noticeSnapshot } from '../projectAppointments'

// Terminbestätigung an den Kunden (WF-24, docs/specs/termin-bestaetigung-kunde.md):
// Knopf nur mit Modul und an gespeicherten Terminen, «Aktualisierung senden»
// nach einer Verschiebung, gesendet wird nie ein ungespeicherter Stand.

const send = vi.fn()
vi.mock('../../../api/admin', async orig => ({
  ...(await orig<typeof import('../../../api/admin')>()),
  sendAppointmentNotice: (...args: unknown[]) => send(...args),
}))

const STAFF = [{ id: 's-1', name: 'Marvin Walser' }]

function draft(over: Partial<AppointmentDraft> = {}): AppointmentDraft {
  return {
    ...emptyDraft(), key: 'a-1', id: 'a-1', startDate: '2026-11-04', startTime: '07:30', endTime: '09:00',
    ...over,
  }
}

function setup(appointments: AppointmentDraft[], opts: { dirty?: boolean; notice?: boolean } = {}) {
  const onChange = vi.fn()
  render(
    <AppointmentsCard
      appointments={appointments}
      onChange={onChange}
      staff={STAFF}
      projectTeam={['s-1']}
      autosave={{ commit: vi.fn(async () => ''), remove: vi.fn(async () => ''), isDirty: () => opts.dirty ?? false }}
      notice={opts.notice === false ? undefined : { customerEmail: 'kunde@example.ch', objectAddress: 'Musterweg 1' }}
    />,
  )
  return { onChange }
}

describe('Termin an Kunden senden', () => {
  afterEach(() => { cleanup(); send.mockReset() })

  it('ohne Modul kein Knopf', () => {
    setup([draft()], { notice: false })
    expect(screen.queryByRole('button', { name: 'Termin an Kunden senden' })).toBeNull()
  })

  it('nie gespeicherter Entwurf hat keinen Knopf', () => {
    setup([draft({ id: null, key: 'neu-1' })])
    expect(screen.queryByRole('button', { name: 'Termin an Kunden senden' })).toBeNull()
  })

  it('mit ungespeicherten Änderungen gesperrt', () => {
    setup([draft()], { dirty: true })
    expect(screen.getByRole('button', { name: 'Termin an Kunden senden' })).toBeDisabled()
  })

  it('sendet an die Kunden-E-Mail und führt den Versandstand nach', async () => {
    send.mockResolvedValue({ to: 'kunde@example.ch', sent_at: '2026-10-30T13:12:00Z', is_update: false, recorded: true })
    const { onChange } = setup([draft()])
    fireEvent.click(screen.getByRole('button', { name: 'Termin an Kunden senden' }))
    expect((screen.getByLabelText('Empfänger E-Mail') as HTMLInputElement).value).toBe('kunde@example.ch')
    fireEvent.change(screen.getByLabelText(/Mitteilung an den Kunden/), { target: { value: 'Balkon frei' } })
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }))
    await waitFor(() => expect(send).toHaveBeenCalledWith('a-1', {
      recipient_email: 'kunde@example.ch', cc_recipients: [], message: 'Balkon frei',
    }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const update = onChange.mock.calls[0][0] as (prev: AppointmentDraft[]) => AppointmentDraft[]
    const [next] = update([draft()])
    expect(next.notice?.sentAt).toBe('2026-10-30T13:12:00Z')
    expect(noticeChanged(next)).toBe(false)
    expect(await screen.findByText('Gesendet an kunde@example.ch.')).toBeTruthy()
  })

  it('Fehler bleibt im Dialog', async () => {
    send.mockRejectedValue(new Error('Keine gültige E-Mail-Adresse'))
    setup([draft()])
    fireEvent.click(screen.getByRole('button', { name: 'Termin an Kunden senden' }))
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Keine gültige E-Mail-Adresse')
  })

  it('nach Verschiebung: Hinweis und «Aktualisierung senden»', () => {
    const sent = draft()
    const moved = draft({
      startDate: '2026-11-05',
      notice: { sentAt: '2026-10-30T13:12:00Z', to: 'kunde@example.ch', snapshot: noticeSnapshot(sent) },
    })
    setup([moved])
    expect(screen.getByText(/Seit dem Versand an den Kunden geändert/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisierung senden' }))
    expect(screen.getByRole('dialog', { name: 'Terminänderung an Kunden senden' })).toBeTruthy()
  })

  it('unverändert gesendet: Datum und «Erneut senden»', () => {
    const sent = draft()
    setup([draft({ notice: { sentAt: '2026-10-30T13:12:00Z', to: 'k@example.ch', snapshot: noticeSnapshot(sent) } })])
    expect(screen.getByText(/An Kunden gesendet am/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Erneut senden' })).toBeEnabled()
  })

  it('Löschen eines bestätigten Termins erinnert an die Absage', () => {
    const sent = draft()
    setup([draft({ notice: { sentAt: '2026-10-30T13:12:00Z', to: 'k@example.ch', snapshot: noticeSnapshot(sent) } })])
    fireEvent.click(screen.getByRole('button', { name: 'Termin entfernen' }))
    expect(screen.getByText(/informieren Sie ihn über die Absage/)).toBeTruthy()
  })
})

describe('noticeChanged', () => {
  it('Teamwechsel ist für den Kunden keine Änderung', () => {
    const sent = draft()
    const d = draft({ ownTeam: true, monteurIds: ['s-9'], notice: { sentAt: 'x', to: '', snapshot: noticeSnapshot(sent) } })
    expect(noticeChanged(d)).toBe(false)
  })

  it('gleicher Stand in Server-Normalform ist unverändert', () => {
    const d = draft({
      notice: { sentAt: 'x', to: '', snapshot: {
        start_date: '2026-11-04', end_date: null, start_time: '07:30', end_time: '09:00', kind: 'montage', label: null,
      } },
    })
    expect(noticeChanged(d)).toBe(false)
  })
})

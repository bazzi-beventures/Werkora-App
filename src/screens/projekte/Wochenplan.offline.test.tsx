import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Wochenplan } from './Wochenplan'
import { ApiError, apiFetch } from '../../api/client'
import { mondayOfISO, todayISO } from '../../api/schedule'
import type { ScheduleWeek } from '../../api/schedule'
import { rememberScheduleWeek } from '../../api/offlineStore'

// Der Wochenplan offline (docs/specs/offline-modus.md §3.4). Bis hierher stand
// dort «Keine Verbindung — der Wochenplan braucht Netz», auch wenn die Woche
// längst auf dem Gerät lag.

vi.mock('../../api/client', () => {
  class TestApiError extends Error {
    status: number
    constructor(status = 500, msg = '') { super(msg); this.status = status }
  }
  return {
    apiFetch: vi.fn(),
    apiUrl: (p: string) => p,
    isNetworkError: (e: unknown) => e instanceof TestApiError && e.status === 0,
    ApiError: TestApiError,
  }
})

const mockFetch = vi.mocked(apiFetch)
const TestApiError = ApiError as unknown as new (status?: number, msg?: string) => Error
const USER = 'u-42'

function weekWith(monday: string, entryName: string): ScheduleWeek {
  const days = Array.from({ length: 7 }, (_, i) => {
    const [y, m, d] = monday.split('-').map(Number)
    const dt = new Date(y, m - 1, d + i)
    const pad = (n: number) => String(n).padStart(2, '0')
    const iso = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
    return {
      iso,
      weekday: 'Tag',
      date: iso,
      short: iso,
      entries: iso === todayISO()
        ? [{
            id: 'p1', appointment_id: 'a1', name: entryName, kind: 'project',
            is_internal: false, art_der_arbeit: '', time_label: '07:30–12:00',
            termin_kind: null, termin_label: null, customer_name: '',
            object_address: '', billing_address: '', phone: '',
            local_contact_name: '', monteur_names: [], bemerkung: '',
            is_multi_day: false,
          }]
        : [],
    }
  })
  return {
    week_start: monday,
    week_end: days[6].iso,
    week_number: 1,
    week_label: monday,
    has_any: true,
    days,
  }
}

beforeEach(() => {
  localStorage.clear()
  mockFetch.mockReset()
})

describe('Wochenplan — offline', () => {
  it('zeigt die gespeicherte Woche mit Stand-Badge statt einer Fehlermeldung', async () => {
    const monday = mondayOfISO(todayISO())
    rememberScheduleWeek(USER, monday, weekWith(monday, 'Storenersatz Müller'), new Date())
    mockFetch.mockRejectedValue(new TestApiError(0, 'Keine Internetverbindung'))

    render(<Wochenplan projects={[{ id: 'p1' }]} userId={USER} onSelect={() => {}} onLoggedOut={() => {}} />)

    await waitFor(() => expect(screen.getByText('Storenersatz Müller')).toBeInTheDocument())
    expect(screen.getByRole('status').textContent).toMatch(/^Offline — Stand /)
    expect(screen.queryByText(/konnte nicht geladen werden/)).not.toBeInTheDocument()
  })

  it('sagt es klar, wenn die Woche gar nicht auf dem Gerät liegt', async () => {
    mockFetch.mockRejectedValue(new TestApiError(0, 'Keine Internetverbindung'))

    render(<Wochenplan projects={[]} userId={USER} onSelect={() => {}} onLoggedOut={() => {}} />)

    await waitFor(() =>
      expect(screen.getByText('Offline — dieser Wochenplan liegt nicht auf dem Gerät.')).toBeInTheDocument())
  })

  it('legt eine online geladene Woche ins Lesepaket (Write-through)', async () => {
    const monday = mondayOfISO(todayISO())
    mockFetch.mockResolvedValue(weekWith(monday, 'Storenersatz Müller'))

    render(<Wochenplan projects={[{ id: 'p1' }]} userId={USER} onSelect={() => {}} onLoggedOut={() => {}} />)

    await waitFor(() => expect(screen.getByText('Storenersatz Müller')).toBeInTheDocument())
    expect(localStorage.getItem(`offline-lesepaket:${USER}`)).toContain(monday)
    // Online rendert kein Stand-Badge — die Daten sind von jetzt.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('meldet einen Serverfehler weiterhin als Fehler', async () => {
    const monday = mondayOfISO(todayISO())
    rememberScheduleWeek(USER, monday, weekWith(monday, 'Storenersatz Müller'), new Date())
    // 500 ist kein Netzproblem: der Snapshot darf ihn nicht übertünchen.
    mockFetch.mockRejectedValue(new TestApiError(500, 'Serverfehler'))

    render(<Wochenplan projects={[{ id: 'p1' }]} userId={USER} onSelect={() => {}} onLoggedOut={() => {}} />)

    await waitFor(() =>
      expect(screen.getByText('Der Wochenplan konnte nicht geladen werden.')).toBeInTheDocument())
  })
})

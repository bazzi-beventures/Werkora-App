import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import { listAppointments, loadSchedulingConfig } from '../../api/admin'
import { apiFetch } from '../../api/client'
import { parseDateStr, shiftISO, toDateStr } from '../utils/calendarHelpers'

// WW-69: Suchfeld im Kopf der Einsatzplanung. Ein Treffer springt im Kalender auf
// den Tag des Termins und öffnet ihn im Panel — wie ein Klick auf die Kachel.

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  apiBlobFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}))

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return {
    ...actual,
    listAppointments: vi.fn(),
    loadSchedulingConfig: vi.fn(),
    readCachedSchedulingConfig: vi.fn(() => undefined),
    resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }),
  }
})

const CONFIG = {
  fields: {}, colors: {}, views: { month: true },
  show_distances: false, grey_after: '', grey_until: '', day_capacity_hours: 8,
  blocker_categories: [],
}

const PROJECTS = [
  { id: 'p1', name: 'EFH Macri Hettlingen', project_id_text: '2601228', kind: 'project',
    customer: { name: 'Macri Luca' }, object_address: 'Hofstettweg 5, 8442 Hettlingen', monteur_ids: [] },
  { id: 'p2', name: 'MFH Breitestrasse 3', project_id_text: '2601477', kind: 'project',
    customer: { name: 'Verwaltung Muster' }, object_address: 'Breitestrasse 3, 8472 Seuzach', monteur_ids: [] },
]

// 40 Tage voraus liegt immer in einem anderen Monat als heute.
const TERMIN_TAG = shiftISO(toDateStr(new Date()), 40)

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/pwa/admin/projects/schedule')) return Promise.resolve(PROJECTS)
    return Promise.resolve([])
  })
  vi.mocked(listAppointments).mockResolvedValue([
    { id: 'a1', project_id: 'p1', start_date: TERMIN_TAG, end_date: null, start_time: '07:30',
      end_time: '12:00', kind: 'montage', label: null, monteur_ids: [] },
    { id: 'a2', project_id: 'p2', start_date: TERMIN_TAG, end_date: null, start_time: '13:00',
      end_time: '16:00', kind: 'aufmass', label: null, monteur_ids: [] },
  ] as never)
  vi.mocked(loadSchedulingConfig).mockResolvedValue(CONFIG as never)
})

describe('Suche in der Einsatzplanung', () => {
  it('findet den Termin über den Kundennamen und springt hin', async () => {
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    const input = await screen.findByRole('combobox', { name: /Termin suchen/ })

    await user.type(input, 'macri')
    const hit = await screen.findByRole('option', { name: /2601228 EFH Macri Hettlingen/ })
    expect(screen.queryByRole('option', { name: /Breitestrasse/ })).not.toBeInTheDocument()

    await user.click(hit)

    const monat = parseDateStr(TERMIN_TAG).toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })
    await waitFor(() => {
      expect(screen.getByTitle('Monatsübersicht öffnen und Tag wählen').textContent).toContain(monat)
    })
    expect(screen.getByText('Einsatz planen')).toBeInTheDocument()
  })

  it('meldet, wenn kein Termin passt', async () => {
    const user = userEvent.setup()
    render(<ProjectScheduleScreen />)
    await user.type(await screen.findByRole('combobox', { name: /Termin suchen/ }), 'zzz-nichts')
    expect(await screen.findByText('Kein Termin gefunden.')).toBeInTheDocument()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import { listAppointments, loadSchedulingConfig } from '../../api/admin'
import { apiFetch } from '../../api/client'

// Welche Reiter die Einsatzplanung anbietet, entscheidet der Mandant. Die
// Anzeige-Config hing früher im selben Promise.all wie Projekte, ~1000 Tage
// Termine und der Kundenstamm — bis zum langsamsten dieser Requests galt
// «fehlender Key = Ansicht an», der Planer sah also alle sechs Ansichten und
// danach die drei seines Mandanten. Diese Tests halten die Reihenfolge fest:
// die Config kommt für sich, und bis sie da ist, steht in der Leiste nichts.

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

// Mandant mit genau den drei Ansichten aus dem Screenshot.
const TENANT_VIEWS = {
  fields: {}, colors: {},
  views: { month: false, week: false, staff: true, plantafel: true, gantt: true, map: false },
  show_distances: false, grey_after: '', grey_until: '', day_capacity_hours: 8,
}

const ABGESCHALTET = ['Monat', 'Woche', 'Karte']
const ERLAUBT = ['Mitarbeiter', 'Plantafel', 'Tagesplan']

/** Promise, das der Test selbst auflöst — hält das grosse Datenladen offen. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/pwa/admin/staff')) return Promise.resolve([])
    return Promise.resolve([])
  })
  vi.mocked(listAppointments).mockResolvedValue([] as never)
})

describe('Einsatzplanung: Ansichten des Mandanten', () => {
  it('zeigt nie die abgeschalteten Ansichten, auch nicht während das Laden dauert', async () => {
    // Kundenstamm & Co. bleiben hängen — die Config kommt trotzdem sofort.
    const slowData = deferred<unknown[]>()
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path.startsWith('/pwa/admin/customers')) return slowData.promise
      return Promise.resolve([])
    })
    vi.mocked(loadSchedulingConfig).mockResolvedValue(TENANT_VIEWS as never)

    render(<ProjectScheduleScreen />)

    // Erster Frame: Config noch unterwegs → gar keine Reiter statt aller sechs.
    for (const label of [...ERLAUBT, ...ABGESCHALTET]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }

    // Config da, Daten noch nicht: die Leiste stimmt schon.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Plantafel' })).toBeInTheDocument()
    })
    for (const label of ERLAUBT) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    for (const label of ABGESCHALTET) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }

    slowData.resolve([])
    await waitFor(() => expect(screen.queryByText('Laden…')).not.toBeInTheDocument())
    for (const label of ABGESCHALTET) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  it('holt die Anzeige-Config nicht im selben Zug wie die Kalenderdaten', async () => {
    vi.mocked(loadSchedulingConfig).mockResolvedValue(TENANT_VIEWS as never)
    render(<ProjectScheduleScreen />)

    await waitFor(() => expect(loadSchedulingConfig).toHaveBeenCalledTimes(1))
    // Der teure Teil geht weiterhin über apiFetch/listAppointments — die Config
    // darf nicht daran hängen, sonst ist die Reiterleiste wieder so langsam wie
    // der langsamste Request.
    const configPaths = vi.mocked(apiFetch).mock.calls
      .map(c => String(c[0]))
      .filter(p => p.includes('/tenant/scheduling'))
    expect(configPaths).toHaveLength(0)
  })

  it('fällt ohne Config auf die System-Defaults zurück und sagt es', async () => {
    vi.mocked(loadSchedulingConfig).mockRejectedValue(new Error('offline'))
    render(<ProjectScheduleScreen />)

    await waitFor(() => {
      expect(screen.getByText(/Anzeige-Einstellungen nicht geladen/)).toBeInTheDocument()
    })
    // Defaults = alle Ansichten sichtbar; ohne Reiter käme man nirgends mehr hin.
    for (const label of [...ERLAUBT, ...ABGESCHALTET]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import { listAppointments, loadSchedulingConfig } from '../../api/admin'
import { apiFetch } from '../../api/client'

// Der Projekt-Picker im Planungs-Panel — die Maske, die auch beim Aufziehen
// eines Termins im Kalender aufgeht («Neuer Termin»).
//
// Gesucht wird in der Disposition mit der Projektnummer vom Auftragszettel.
// Dass das bisher funktionierte, war ein Zufall des Altbestands: importierte
// Projekte tragen die Nummer im Namen. Neu angelegte haben sie nur in
// project_id_text — die fand die Suche nicht, und in der Liste stand sie auch
// nicht.

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

// Altbestand (Nummer im Namen) und Neuanlage (Nummer nur im Feld).
const PROJECTS = [
  { id: 'alt', name: '241556 Gsell Seuzach', project_id_text: '241556', kind: 'project' },
  { id: 'neu', name: 'Leerwhg. Tösstalstr. 134', project_id_text: '261301', kind: 'project' },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/pwa/admin/projects/schedule')) return Promise.resolve(PROJECTS)
    return Promise.resolve([])
  })
  vi.mocked(listAppointments).mockResolvedValue([] as never)
  vi.mocked(loadSchedulingConfig).mockResolvedValue(CONFIG as never)
})

async function openPanel() {
  const user = userEvent.setup()
  render(<ProjectScheduleScreen />)
  await user.click(await screen.findByRole('button', { name: '+ Einsatz planen' }))
  return user
}

describe('Projekt-Picker der Einsatzplanung', () => {
  it('findet ein neu angelegtes Projekt über seine Projektnummer', async () => {
    const user = await openPanel()
    const input = screen.getByPlaceholderText('Projekt suchen oder auswählen…')

    await user.type(input, '261301')

    await waitFor(() => {
      expect(screen.getByText('261301 Leerwhg. Tösstalstr. 134')).toBeInTheDocument()
    })
    expect(screen.queryByText('241556 Gsell Seuzach')).not.toBeInTheDocument()
  })

  it('zeigt die Projektnummer in der Trefferliste', async () => {
    const user = await openPanel()
    await user.click(screen.getByPlaceholderText('Projekt suchen oder auswählen…'))

    await waitFor(() => {
      expect(screen.getByText('261301 Leerwhg. Tösstalstr. 134')).toBeInTheDocument()
    })
    // Der Altbestand hat sie schon im Namen — sie darf nicht doppelt stehen.
    expect(screen.getByText('241556 Gsell Seuzach')).toBeInTheDocument()
  })

  it('sucht weiterhin über den Namen', async () => {
    const user = await openPanel()
    await user.type(screen.getByPlaceholderText('Projekt suchen oder auswählen…'), 'gsell')

    await waitFor(() => {
      expect(screen.getByText('241556 Gsell Seuzach')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Leerwhg/)).not.toBeInTheDocument()
  })

  it('meldet, wenn nichts passt', async () => {
    const user = await openPanel()
    await user.type(screen.getByPlaceholderText('Projekt suchen oder auswählen…'), '999999')

    await waitFor(() => {
      expect(screen.getByText('Kein Projekt gefunden.')).toBeInTheDocument()
    })
  })
})

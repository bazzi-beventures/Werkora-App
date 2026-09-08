import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleScreen from './ProjectScheduleScreen'
import { listAppointments, loadSchedulingConfig, upsertProject } from '../../api/admin'
import { apiFetch } from '../../api/client'

// Blocker = provisorisch belegte Zeit, deren Projekt noch offen ist. Er hiess
// immer «Blocker»; im Kalender standen dann fünf gleich benannte Kacheln, und
// niemand wusste mehr, wofür sie stehen. Pflegt der Mandant Blocker-Kategorien
// (Konfiguration → Einsatzplanung), wählt man den Titel aus dieser Liste — und
// das Feld startet leer, damit die Auswahl nicht übersprungen wird.

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
    upsertProject: vi.fn(),
  }
})

function config(blockerCategories: string[]) {
  return {
    fields: {}, colors: {}, views: { month: true },
    show_distances: false, grey_after: '', grey_until: '', day_capacity_hours: 8,
    blocker_categories: blockerCategories,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiFetch).mockImplementation(() => Promise.resolve([]))
  vi.mocked(listAppointments).mockResolvedValue([] as never)
  vi.mocked(upsertProject).mockResolvedValue({ project: { id: 'p-neu' } } as never)
})

async function neuerBlocker(categories: string[]) {
  vi.mocked(loadSchedulingConfig).mockResolvedValue(config(categories) as never)
  const user = userEvent.setup()
  render(<ProjectScheduleScreen />)
  await user.click(await screen.findByRole('button', { name: '+ Blocker' }))
  return user
}

describe('Blocker mit Kategorien', () => {
  it('bietet die konfigurierten Kategorien zur Auswahl an', async () => {
    await neuerBlocker(['Wartet auf Material', 'Wetter'])

    const select = await screen.findByLabelText('Kategorie')
    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Wartet auf Material' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Wetter' })).toBeInTheDocument()
  })

  it('startet mit leerem Titel und übernimmt die gewählte Kategorie', async () => {
    const user = await neuerBlocker(['Wartet auf Material', 'Wetter'])

    const titel = await screen.findByLabelText('Titel')
    expect(titel).toHaveValue('')

    await user.selectOptions(screen.getByLabelText('Kategorie'), 'Wetter')
    expect(titel).toHaveValue('Wetter')
  })

  it('lässt die Kategorie im Titel ergänzen, ohne die Auswahl zu erzwingen', async () => {
    const user = await neuerBlocker(['Wetter'])

    const titel = await screen.findByLabelText('Titel')
    await user.selectOptions(screen.getByLabelText('Kategorie'), 'Wetter')
    await user.type(titel, ' – Fassade Muster')

    expect(titel).toHaveValue('Wetter – Fassade Muster')
    // Freier Text ist keine Kategorie mehr — das Dropdown fällt auf leer zurück.
    expect(screen.getByLabelText('Kategorie')).toHaveValue('')
  })

  it('verlangt einen Titel, bevor gespeichert wird', async () => {
    const user = await neuerBlocker(['Wetter'])

    await screen.findByLabelText('Titel')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => {
      expect(screen.getByText('Titel ist erforderlich.')).toBeInTheDocument()
    })
    expect(upsertProject).not.toHaveBeenCalled()
  })

  it('speichert den Blocker unter der gewählten Kategorie', async () => {
    const user = await neuerBlocker(['Wartet auf Material'])

    await screen.findByLabelText('Titel')
    await user.selectOptions(screen.getByLabelText('Kategorie'), 'Wartet auf Material')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(upsertProject).toHaveBeenCalledTimes(1))
    expect(vi.mocked(upsertProject).mock.calls[0][0]).toMatchObject({
      name: 'Wartet auf Material',
      kind: 'blocker',
    })
  })
})

describe('Blocker ohne konfigurierte Kategorien', () => {
  it('bleibt beim freien Titelfeld mit «Blocker» als Vorbelegung', async () => {
    await neuerBlocker([])

    expect(await screen.findByLabelText('Titel')).toHaveValue('Blocker')
    expect(screen.queryByLabelText('Kategorie')).not.toBeInTheDocument()
  })
})

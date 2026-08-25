import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectsScreen from './ProjectsScreen'
import type { Project } from '../../api/admin/projects'
import { apiFetch } from '../../api/client'
import { resetUnsavedChangesGuard } from '../unsavedChanges'

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  apiFormFetch: vi.fn(),
  apiBlobFetch: vi.fn(),
  apiUrl: (p: string) => p,
  ApiError: class extends Error {},
  isOfflineError: () => false,
  isNetworkError: () => false,
  parseDispositionFilename: () => null,
}))

const mockFetch = vi.mocked(apiFetch)

const EXISTING: Project = {
  id: 'p-1',
  project_id_text: '2600001',
  name: 'Fassade Seehalde',
  kind: 'project',
  customer_id: null,
  customer: null,
  object_name: null,
  object_address: null,
  art_der_arbeit: ['Neumontage'],
  projektleiter_id: null,
  monteur_ids: [],
  kontakte: [],
  eigentuemer: null,
  disposal_details: null,
  status: 'offen',
  is_closed: false,
  created_at: '2026-07-01T08:00:00Z',
  created_by: null,
  created_by_id: null,
  bemerkung: null,
  geruestfach: null,
  start_date: null,
  end_date: null,
  start_time: null,
  end_time: null,
}

const CREATED: Project = { ...EXISTING, id: 'p-2', project_id_text: '2600002', name: 'Neubau West' }

/** Antwortet auf alle Endpunkte, die Liste und Detailmaske beim Öffnen abfragen. */
function routeApi(rows: Project[], onPost?: (body: unknown) => unknown) {
  mockFetch.mockImplementation(async (path, options) => {
    if (options?.method === 'POST' && path === '/pwa/admin/projects') {
      return onPost ? onPost(JSON.parse(String(options.body ?? '{}'))) : { status: 'success', project: CREATED }
    }
    if (options?.method === 'PATCH') return { status: 'success' }
    if (path.startsWith('/pwa/admin/projects/list')) {
      return { rows, total: rows.length, open_count: rows.length, closed_count: 0, archived_count: 0, page: 1, page_size: 50 }
    }
    if (path === '/pwa/admin/staff') return []
    if (path === '/pwa/admin/customers') return []
    if (path === '/pwa/me') return { authorized_user_id: 'u-1', enabled_modules: [], feature_flags: {} }
    return []
  })
}

describe('ProjectsScreen — neues Projekt', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    resetUnsavedChangesGuard()
  })

  it('landet nach dem Anlegen direkt im neuen Projekt statt auf der Übersicht', async () => {
    const user = userEvent.setup()
    routeApi([EXISTING])
    render(<ProjectsScreen />)

    await user.click(await screen.findByRole('button', { name: /Neues Projekt/ }))
    await user.type(screen.getByLabelText('Projektname *'), 'Neubau West')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    // Die Tab-Leiste gibt es nur im gespeicherten Projekt (in der Neu-Maske nicht).
    expect(await screen.findByRole('button', { name: 'Projekt Details' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Neubau West')).toBeInTheDocument()
    // …und nicht die Übersicht.
    expect(screen.queryByRole('button', { name: /Neues Projekt/ })).not.toBeInTheDocument()
  })

  it('fällt auf die Übersicht zurück, wenn das Backend kein Projekt mitliefert', async () => {
    const user = userEvent.setup()
    routeApi([EXISTING], () => ({ status: 'success', project: null }))
    render(<ProjectsScreen />)

    await user.click(await screen.findByRole('button', { name: /Neues Projekt/ }))
    await user.type(screen.getByLabelText('Projektname *'), 'Neubau West')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByRole('button', { name: /Neues Projekt/ })).toBeInTheDocument()
  })
})

describe('ProjectsScreen — ungespeicherte Änderungen', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    resetUnsavedChangesGuard()
  })

  async function openDetailAndEdit() {
    const user = userEvent.setup()
    routeApi([EXISTING])
    render(<ProjectsScreen />)
    await user.click(await screen.findByText('Fassade Seehalde'))
    const nameInput = await screen.findByLabelText('Projektname *')
    await user.type(nameInput, ' Etappe 2')
    return user
  }

  /** Die Abfrage teilt sich die Beschriftungen mit dem Formular — gezielt darin suchen. */
  async function leaveDialog() {
    return within(await screen.findByRole('dialog', { name: 'Ungespeicherte Änderungen' }))
  }

  it('fragt beim Zurück nach, statt die Änderungen stillschweigend zu verwerfen', async () => {
    const user = await openDetailAndEdit()
    await user.click(screen.getByRole('button', { name: '← Zurück' }))
    expect(await screen.findByRole('dialog', { name: 'Ungespeicherte Änderungen' })).toBeInTheDocument()
  })

  it('bleibt nach «Abbrechen» in der Maske — mit den Eingaben', async () => {
    const user = await openDetailAndEdit()
    await user.click(screen.getByRole('button', { name: '← Zurück' }))
    await user.click((await leaveDialog()).getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ungespeicherte Änderungen' })).not.toBeInTheDocument())
    expect(screen.getByDisplayValue('Fassade Seehalde Etappe 2')).toBeInTheDocument()
  })

  it('verlässt die Maske nach «Verwerfen», ohne zu speichern', async () => {
    const user = await openDetailAndEdit()
    await user.click(screen.getByRole('button', { name: '← Zurück' }))
    await user.click((await leaveDialog()).getByRole('button', { name: 'Verwerfen' }))

    expect(await screen.findByRole('button', { name: /Neues Projekt/ })).toBeInTheDocument()
    expect(mockFetch.mock.calls.some(([, opt]) => opt?.method === 'PATCH')).toBe(false)
  })

  it('speichert nach «Speichern» und verlässt die Maske', async () => {
    const user = await openDetailAndEdit()
    await user.click(screen.getByRole('button', { name: '← Zurück' }))
    await user.click((await leaveDialog()).getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByRole('button', { name: /Neues Projekt/ })).toBeInTheDocument()
    const patch = mockFetch.mock.calls.find(([, opt]) => opt?.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(String(patch![1]!.body)).name).toBe('Fassade Seehalde Etappe 2')
  })

  it('fragt nicht nach, wenn nichts geändert wurde', async () => {
    const user = userEvent.setup()
    routeApi([EXISTING])
    render(<ProjectsScreen />)
    await user.click(await screen.findByText('Fassade Seehalde'))
    await screen.findByLabelText('Projektname *')
    await user.click(screen.getByRole('button', { name: '← Zurück' }))

    expect(await screen.findByRole('button', { name: /Neues Projekt/ })).toBeInTheDocument()
  })
})

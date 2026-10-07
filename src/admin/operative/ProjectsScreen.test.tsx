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
  geruestfaecher: [],
  start_date: null,
  end_date: null,
  start_time: null,
  end_time: null,
}

const CREATED: Project = { ...EXISTING, id: 'p-2', project_id_text: '2600002', name: 'Neubau West' }

/**
 * Speichern ohne Projektleiter fragt seit 2026-09 einmal nach — die Maske startet
 * leer, statt still den Erfasser einzutragen. Wo der Projektleiter nicht das Thema
 * des Tests ist, wird die Warnung hier weggeklickt.
 */
async function bestaetigeOhneProjektleiter(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('dialog', { name: 'Kein Projektleiter zugewiesen' })
  await user.click(within(dialog).getByRole('button', { name: 'Trotzdem speichern' }))
}

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
    await bestaetigeOhneProjektleiter(user)

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
    await bestaetigeOhneProjektleiter(user)

    expect(await screen.findByRole('button', { name: /Neues Projekt/ })).toBeInTheDocument()
  })

  it('warnt vor dem Speichern ohne Projektleiter und bleibt bei «Projektleiter wählen» in der Maske', async () => {
    const user = userEvent.setup()
    routeApi([EXISTING])
    render(<ProjectsScreen />)

    await user.click(await screen.findByRole('button', { name: /Neues Projekt/ }))
    await user.type(screen.getByLabelText('Projektname *'), 'Neubau West')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    const dialog = await screen.findByRole('dialog', { name: 'Kein Projektleiter zugewiesen' })
    await user.click(within(dialog).getByRole('button', { name: 'Projektleiter wählen' }))

    // Nichts geschrieben, Eingaben stehen noch da.
    expect(mockFetch.mock.calls.some(([, opt]) => opt?.method === 'POST')).toBe(false)
    expect(screen.getByDisplayValue('Neubau West')).toBeInTheDocument()
  })
})

// Bestehende Projekte speichern sich selbst (docs/specs/projektmaske-autosave.md,
// seit 2026-10-06 für alle Mandanten): «Zurück» schickt das eben Getippte noch
// los und fragt nur, wenn danach etwas offen bleibt — hier ein gescheitertes
// Speichern. Der Knopf-Pfad mit Abfrage gilt nur noch für neue Projekte.
describe('ProjectsScreen — bestehendes Projekt speichert selbst', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    resetUnsavedChangesGuard()
  })

  async function openDetailAndEdit() {
    const user = userEvent.setup()
    render(<ProjectsScreen />)
    await user.click(await screen.findByText('Fassade Seehalde'))
    const nameInput = await screen.findByLabelText('Projektname *')
    await user.type(nameInput, ' Etappe 2')
    return user
  }

  function patches() {
    return mockFetch.mock.calls.filter(([, opt]) => opt?.method === 'PATCH')
  }

  /** Lässt jeden PATCH scheitern — die Maske zeigt «Nicht gespeichert». */
  function patchScheitert() {
    const ok = mockFetch.getMockImplementation()!
    mockFetch.mockImplementation(async (path, options) => {
      if (options?.method === 'PATCH') throw new Error('Server nicht erreichbar')
      return ok(path, options)
    })
  }

  /** Die Abfrage teilt sich die Beschriftungen mit dem Formular — gezielt darin suchen. */
  async function leaveDialog() {
    return within(await screen.findByRole('dialog', { name: 'Ungespeicherte Änderungen' }))
  }

  it('hat keinen Speichern-Knopf, sondern die Statuszeile', async () => {
    routeApi([EXISTING])
    const user = userEvent.setup()
    render(<ProjectsScreen />)
    await user.click(await screen.findByText('Fassade Seehalde'))
    await screen.findByLabelText('Projektname *')

    expect(screen.getByRole('status')).toHaveTextContent('Änderungen werden automatisch gespeichert')
    // Nur der Formular-Knopf zählt — die Kommentar-Seitenleiste hat ihren eigenen «Speichern».
    const submit = screen.queryAllByRole('button', { name: 'Speichern' }).filter(b => b.getAttribute('type') === 'submit')
    expect(submit).toHaveLength(0)
  })

  it('speichert beim Zurück das eben Getippte und verlässt die Maske ohne Nachfrage', async () => {
    routeApi([EXISTING])
    const user = await openDetailAndEdit()
    await user.click(screen.getByRole('button', { name: '← Zurück' }))

    expect(await screen.findByRole('button', { name: /Neues Projekt/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Ungespeicherte Änderungen' })).not.toBeInTheDocument()
    // Kein «Kein Projektleiter»-Dialog: bei bestehenden Projekten steht nur ein Hinweis (§3.5).
    expect(screen.queryByRole('dialog', { name: 'Kein Projektleiter zugewiesen' })).not.toBeInTheDocument()
    const sent = patches()
    expect(sent.length).toBeGreaterThan(0)
    expect(JSON.parse(String(sent[sent.length - 1][1]!.body)).name).toBe('Fassade Seehalde Etappe 2')
  })

  // Der Audit-Eintrag nennt die geschickten Feldnamen, und daraus baut der
  // Projekt-Verlauf seinen Satz «Geändert: …». Fahren unberührte Felder mit,
  // meldet er Änderungen, die niemand gemacht hat (§3.6).
  it('schickt nur die geänderten Felder', async () => {
    routeApi([EXISTING])
    const user = await openDetailAndEdit()
    await user.click(screen.getByRole('button', { name: '← Zurück' }))
    await screen.findByRole('button', { name: /Neues Projekt/ })

    for (const [, opt] of patches()) {
      const body = JSON.parse(String(opt!.body))
      expect('is_warranty' in body).toBe(false)
      expect('parent_project_id' in body).toBe(false)
      expect('completed_at' in body).toBe(false)
      expect('monteur_ids' in body).toBe(false)
    }
  })

  it('fragt beim Zurück nach, wenn das Speichern scheitert — «Abbrechen» bleibt mit den Eingaben', async () => {
    routeApi([EXISTING])
    patchScheitert()
    const user = await openDetailAndEdit()
    await user.click(screen.getByRole('button', { name: '← Zurück' }))
    await user.click((await leaveDialog()).getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ungespeicherte Änderungen' })).not.toBeInTheDocument())
    expect(screen.getByDisplayValue('Fassade Seehalde Etappe 2')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Nicht gespeichert')
  })

  it('verlässt die Maske nach «Verwerfen», wenn das Speichern scheitert', async () => {
    routeApi([EXISTING])
    patchScheitert()
    const user = await openDetailAndEdit()
    await user.click(screen.getByRole('button', { name: '← Zurück' }))
    await user.click((await leaveDialog()).getByRole('button', { name: 'Verwerfen' }))

    expect(await screen.findByRole('button', { name: /Neues Projekt/ })).toBeInTheDocument()
  })

  // Support-Meldung 2026-10-07 (Gehlhaar): «Speichern» in der Abfrage blieb auf
  // «Speichern…» stehen. Das Speichern stellt unterwegs die Rückfrage «Kein
  // Projektleiter» — gezeichnet unter der Abfrage, also verdeckt und nie
  // beantwortbar. Die Abfrage muss deshalb weg sein, bevor gespeichert wird.
  it('zeigt die Projektleiter-Rückfrage beim Speichern aus der Abfrage, statt darunter zu hängen', async () => {
    routeApi([EXISTING])
    const ok = mockFetch.getMockImplementation()!
    let failPatch = true
    mockFetch.mockImplementation(async (path, options) => {
      if (options?.method === 'PATCH' && failPatch) throw new Error('Server nicht erreichbar')
      return ok(path, options)
    })
    const user = await openDetailAndEdit()
    await user.click(screen.getByRole('button', { name: '← Zurück' }))
    failPatch = false
    await user.click((await leaveDialog()).getByRole('button', { name: 'Speichern' }))

    const question = await screen.findByRole('dialog', { name: 'Kein Projektleiter zugewiesen' })
    expect(screen.queryByRole('dialog', { name: 'Ungespeicherte Änderungen' })).not.toBeInTheDocument()
    await user.click(within(question).getByRole('button', { name: 'Trotzdem speichern' }))

    expect(await screen.findByRole('button', { name: /Neues Projekt/ })).toBeInTheDocument()
  })

  it('bleibt in der Maske, wenn die Projektleiter-Rückfrage abgebrochen wird', async () => {
    routeApi([EXISTING])
    patchScheitert()
    const user = await openDetailAndEdit()
    await user.click(screen.getByRole('button', { name: '← Zurück' }))
    await user.click((await leaveDialog()).getByRole('button', { name: 'Speichern' }))

    const question = await screen.findByRole('dialog', { name: 'Kein Projektleiter zugewiesen' })
    await user.click(within(question).getByRole('button', { name: 'Projektleiter wählen' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByDisplayValue('Fassade Seehalde Etappe 2')).toBeInTheDocument()
  })

  it('fragt nicht nach und speichert nichts, wenn nichts geändert wurde', async () => {
    const user = userEvent.setup()
    routeApi([EXISTING])
    render(<ProjectsScreen />)
    await user.click(await screen.findByText('Fassade Seehalde'))
    await screen.findByLabelText('Projektname *')
    await user.click(screen.getByRole('button', { name: '← Zurück' }))

    expect(await screen.findByRole('button', { name: /Neues Projekt/ })).toBeInTheDocument()
    expect(patches()).toHaveLength(0)
  })
})

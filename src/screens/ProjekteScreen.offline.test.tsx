import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjekteScreen from './ProjekteScreen'
import { ApiError, apiFetch } from '../api/client'
import { SK } from '../api/storageKeys'
import { rememberProjectTasks, rememberProjects, saveOfflinePackage } from '../api/offlineStore'
import type { MonteurProject } from '../shared/projectDetail/types'

// Offline-Lesepaket in «Meine Projekte» (docs/specs/offline-modus.md §3.4).
//
// Der Ausgangsbefund: geht der Monteur offline in die Projektliste, warf
// `apiFetch` ApiError(0), der Screen schluckte alles ausser 401 und rendert
// «Du bist keinem Projekt zugewiesen» — die einzige Aussage, die sicher falsch
// war. Genau das prüfen die Tests hier nach.

// Die Fehlerklasse muss IN der Factory entstehen: vi.mock wird an den Anfang
// der Datei gehoben, eine Klasse aus dem Modulrumpf wäre dort noch nicht da.
vi.mock('../api/client', () => {
  class TestApiError extends Error {
    status: number
    constructor(status = 500, msg = '') { super(msg); this.status = status }
  }
  return {
    apiFetch: vi.fn(),
    apiFormFetch: vi.fn(),
    apiUrl: (p: string) => p,
    // Der Screen fällt bei status 0 aufs Lesepaket zurück — bewusst
    // `isNetworkError` (auch «Empfangsbalken, aber kein Durchkommen»).
    isNetworkError: (e: unknown) => e instanceof TestApiError && e.status === 0,
    ApiError: TestApiError,
  }
})

const mockFetch = vi.mocked(apiFetch)
// Dieselbe Klasse, die der Screen sieht — nur so trifft sein `instanceof`.
const TestApiError = ApiError as unknown as new (status?: number, msg?: string) => Error
const USER = 'u-42'

function project(over: Partial<MonteurProject> = {}): MonteurProject {
  return {
    id: 'p1',
    name: 'MFH Sonnhalde',
    kind: 'project',
    art_der_arbeit: null,
    customer_id: null,
    customer: null,
    object_name: null,
    object_address: null,
    start_date: null,
    end_date: null,
    start_time: null,
    end_time: null,
    kontakte: [],
    bemerkung: null,
    geruestfach: null,
    ...over,
  }
}

const NOOP = {
  user: null,
  onNavHome: () => {},
  onNavRapport: () => {},
  onStartRapport: () => {},
  onNavArbeitszeit: () => {},
  onNavProfile: () => {},
  onLoggedOut: () => {},
}

/** Kein Netz: jeder Request scheitert mit status 0, wie hinter der Betonwand. */
function allOffline() {
  mockFetch.mockImplementation(() => Promise.reject(new TestApiError(0, 'Keine Internetverbindung')))
}

function goOffline() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(SK.AUTHORIZED_USER_ID, USER)
  mockFetch.mockReset()
  vi.restoreAllMocks()
})

describe('ProjekteScreen — offline lesen', () => {
  it('rendert die Projekte aus dem Lesepaket, mit Stand-Badge', async () => {
    rememberProjects(USER, [project()], new Date())
    goOffline()
    allOffline()

    render(<ProjekteScreen {...NOOP} />)

    await waitFor(() => expect(screen.getByText('MFH Sonnhalde')).toBeInTheDocument())
    expect(screen.getByText(/^Offline — Stand \d{2}:\d{2}$/)).toBeInTheDocument()
    expect(screen.queryByText(/keinem Projekt zugewiesen/)).not.toBeInTheDocument()
  })

  it('warnt farbig, sobald der Stand älter als 24 Stunden ist', async () => {
    const gestern = new Date(Date.now() - 30 * 60 * 60 * 1000)
    rememberProjects(USER, [project()], gestern)
    goOffline()
    allOffline()

    render(<ProjekteScreen {...NOOP} />)

    const badge = await screen.findByRole('status')
    expect(badge.className).toContain('stale')
    // Ab 24 h steht das Datum dabei — die Uhrzeit allein sagt dann zu wenig.
    expect(badge.textContent).toMatch(/\d{2}\.\d{2}\.\d{4}/)
  })

  it('sagt bei leerem Lesepaket «offline», nicht «keinem Projekt zugewiesen»', async () => {
    goOffline()
    allOffline()

    render(<ProjekteScreen {...NOOP} />)

    await waitFor(() =>
      expect(screen.getByText(/Offline — deine Projekte konnten noch nicht geladen werden/)).toBeInTheDocument())
    expect(screen.queryByText(/keinem Projekt zugewiesen/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
  })

  it('lädt auf «Erneut versuchen» nach und zeigt dann die Liste', async () => {
    const user = userEvent.setup()
    goOffline()
    allOffline()
    render(<ProjekteScreen {...NOOP} />)

    const retry = await screen.findByRole('button', { name: 'Erneut versuchen' })
    mockFetch.mockImplementation((path: string) =>
      path === '/pwa/projects' ? Promise.resolve([project()]) : Promise.resolve([]))
    await user.click(retry)

    await waitFor(() => expect(screen.getByText('MFH Sonnhalde')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).not.toBeInTheDocument()
  })

  it('lädt frisch, sobald das Netz zurückkommt, und räumt den Badge weg', async () => {
    rememberProjects(USER, [project()], new Date())
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    allOffline()
    render(<ProjekteScreen {...NOOP} />)
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())

    // Netz kommt zurück: der Browser feuert `online`, die App muss selbst
    // nachladen — ein Screen, der «offline» behauptet, während das Gerät
    // wieder Empfang hat, sieht kaputt aus.
    spy.mockReturnValue(true)
    mockFetch.mockImplementation((path: string) =>
      path === '/pwa/projects'
        ? Promise.resolve([project({ name: 'MFH Sonnhalde (frisch)' })])
        : Promise.resolve([]))
    window.dispatchEvent(new Event('online'))

    await waitFor(() => expect(screen.getByText('MFH Sonnhalde (frisch)')).toBeInTheDocument())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('behält den echten Leerzustand: online und wirklich kein Projekt', async () => {
    mockFetch.mockResolvedValue([])

    render(<ProjekteScreen {...NOOP} />)

    await waitFor(() => expect(screen.getByText('Du bist keinem Projekt zugewiesen.')).toBeInTheDocument())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('legt die Liste beim Online-Load ins Lesepaket (Write-through)', async () => {
    mockFetch.mockImplementation((path: string) =>
      path === '/pwa/projects' ? Promise.resolve([project()]) : Promise.resolve([]))

    render(<ProjekteScreen {...NOOP} />)
    await waitFor(() => expect(screen.getByText('MFH Sonnhalde')).toBeInTheDocument())

    const raw = localStorage.getItem(`offline-lesepaket:${USER}`)
    expect(raw).toContain('MFH Sonnhalde')
  })
})

describe('ProjekteScreen — offline im Projekt-Detail', () => {
  const TASK = { id: 't1', text: 'Fenster ausmessen', is_done: false, done_at: null, done_by_name: null, created_at: 'x' }

  async function openOfflineDetail() {
    saveOfflinePackage(USER, {
      savedAt: new Date().toISOString(),
      projects: [project()],
      tasksByProject: { p1: [TASK] },
      commentsByProject: { p1: [{ id: 'c1', author_name: 'Büro', text: 'Schlüssel beim Nachbarn', created_at: 'x' }] },
      scheduleWeeks: {},
    })
    goOffline()
    allOffline()
    const user = userEvent.setup()
    render(<ProjekteScreen {...NOOP} />)
    await waitFor(() => expect(screen.getByText('MFH Sonnhalde')).toBeInTheDocument())
    await user.click(screen.getByText('MFH Sonnhalde'))
    return user
  }

  it('zeigt Aufgaben und Kommentare aus dem Lesepaket', async () => {
    await openOfflineDetail()

    await waitFor(() => expect(screen.getByText('Fenster ausmessen')).toBeInTheDocument())
    expect(screen.getByText('Schlüssel beim Nachbarn')).toBeInTheDocument()
  })

  it('sperrt Hochladen und Kommentieren mit Begründung statt Fehlversuch', async () => {
    await openOfflineDetail()

    const upload = await screen.findByRole('button', { name: '+ Hochladen' })
    expect(upload).toBeDisabled()
    expect(screen.getByRole('button', { name: '+ Lieferschein' })).toBeDisabled()
    expect(screen.getByPlaceholderText('Kommentar…')).toBeDisabled()
    expect(screen.getByText('Hochladen braucht eine Internetverbindung.')).toBeInTheDocument()
    expect(screen.getByText('Kommentare schreiben braucht eine Internetverbindung.')).toBeInTheDocument()
  })

  it('schreibt den offline abgehakten Stand ins Lesepaket zurück', async () => {
    const user = await openOfflineDetail()
    await waitFor(() => expect(screen.getByText('Fenster ausmessen')).toBeInTheDocument())

    await user.click(screen.getByRole('checkbox'))

    // Der Server bekommt den Haken erst beim Drain der Queue — der Snapshot
    // muss ihn sofort tragen, sonst zeigt die Offline-Liste den alten Stand.
    await waitFor(() => {
      const raw = localStorage.getItem(`offline-lesepaket:${USER}`)!
      expect(JSON.parse(raw).tasksByProject.p1[0].is_done).toBe(true)
    })
  })
})

describe('ProjekteScreen — Fehlerzustand mit Netz', () => {
  it('meldet einen Serverfehler als Fehler, nicht als leere Liste', async () => {
    mockFetch.mockImplementation((path: string) =>
      path === '/pwa/projects'
        ? Promise.reject(new TestApiError(500, 'Serverfehler'))
        : Promise.resolve([]))
    // Ein alter Snapshot darf einen 500er NICHT übertünchen: das Netz ist da,
    // der Server antwortet — das gehört gemeldet, nicht kaschiert.
    rememberProjectTasks(USER, 'p1', [], new Date())

    render(<ProjekteScreen {...NOOP} />)

    await waitFor(() =>
      expect(screen.getByText('Die Projekte konnten nicht geladen werden.')).toBeInTheDocument())
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjekteScreen from './ProjekteScreen'
import { ApiError, apiFetch } from '../api/client'
import { SK } from '../api/storageKeys'
import { rememberProjects } from '../api/offlineStore'
import { DB_NAME, pendingRapporte, saveRapport, type PendingRapport } from '../api/rapportQueue'
import * as queue from '../api/rapportQueue'
import { noteNetworkFailure, resetConnectionHealth } from '../api/connectionHealth'
import type { UserInfo } from '../api/auth'
import type { MonteurProject } from '../shared/projectDetail/types'

// Einstieg und Karte des Offline-Rapports im Projekt-Detail
// (docs/specs/offline-modus.md §4.5.2 und §4.5.5).
//
// Zwei Dinge, die sich leicht falsch bauen lassen:
//   * Der Knopf «Rapport erstellen» ist derselbe. Ohne Netz führt er ins
//     Formular statt in den Chat — aber NUR mit dem Feature; sonst bleibt er
//     gesperrt, weil der Chat das LLM braucht.
//   * Ein wartender Rapport darf nie stumm auf dem Gerät liegen. Die Karte ist
//     der einzige Ort, an dem der Monteur ihn sieht.

vi.mock('../api/client', () => {
  class TestApiError extends Error {
    status: number
    constructor(status = 500, msg = '') { super(msg); this.status = status }
  }
  return {
    apiFetch: vi.fn(),
    apiFormFetch: vi.fn(),
    apiUrl: (p: string) => p,
    isNetworkError: (e: unknown) => e instanceof TestApiError && e.status === 0,
    ApiError: TestApiError,
  }
})

const mockFetch = vi.mocked(apiFetch)
const TestApiError = ApiError as unknown as new (status?: number, msg?: string) => Error
const USER = 'u-42'

function project(over: Partial<MonteurProject> = {}): MonteurProject {
  return {
    id: 'p1', name: 'MFH Sonnhalde', kind: 'project', art_der_arbeit: null,
    customer_id: null, customer: null, object_name: null, object_address: null,
    start_date: null, end_date: null, start_time: null, end_time: null,
    kontakte: [], bemerkung: null, geruestfach: null,
    ...over,
  }
}

function user(offlineFeature: boolean): UserInfo {
  return {
    authorized_user_id: USER,
    display_name: 'Mario',
    staff_name: 'Mario',
    role: 'worker',
    enabled_modules: ['ai'],
    feature_flags: offlineFeature ? { rapport_offline_formular: { enabled: true } } : {},
  } as unknown as UserInfo
}

function entry(over: Partial<PendingRapport> = {}): PendingRapport {
  return {
    clientId: 'c-1', userId: USER, projectId: 'p1', projectName: 'MFH Sonnhalde',
    date: '07.09.2026', recordedAt: '2026-09-07T12:20:00.000Z',
    staff: [{ name: 'Mario', hours: 8 }], description: 'Storen montiert.',
    workTypes: [], einbauort: '', materials: [], kleinmaterial: null,
    isPartial: false, signature: null, signedAt: null, attempts: 0, lastError: null,
    ...over,
  }
}

function resetDb(): Promise<void> {
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

function allOffline() {
  mockFetch.mockImplementation(() => Promise.reject(new TestApiError(0, 'Keine Internetverbindung')))
}

const BASE = {
  onNavHome: () => {},
  onNavRapport: () => {},
  onStartRapport: () => {},
  onNavArbeitszeit: () => {},
  onNavProfile: () => {},
  onLoggedOut: () => {},
}

beforeEach(async () => {
  localStorage.clear()
  localStorage.setItem(SK.AUTHORIZED_USER_ID, USER)
  mockFetch.mockReset()
  vi.restoreAllMocks()
  resetConnectionHealth()
  await resetDb()
})

/** Projekt-Detail offline öffnen — der Zustand, um den es hier geht. */
async function openDetail(props: Partial<Parameters<typeof ProjekteScreen>[0]>) {
  rememberProjects(USER, [project()], new Date())
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  allOffline()
  const u = userEvent.setup()
  render(<ProjekteScreen {...BASE} user={user(true)} {...props} />)
  await u.click(await screen.findByText('MFH Sonnhalde'))
  return u
}

describe('Einstieg ins Offline-Formular', () => {
  it('führt ohne Netz ins Formular statt in den Chat', async () => {
    const onStartOfflineRapport = vi.fn()
    const onStartRapport = vi.fn()
    const u = await openDetail({ onStartOfflineRapport, onStartRapport })

    const knopf = await screen.findByRole('button', { name: /Rapport ohne Netz erfassen/ })
    await u.click(knopf)

    expect(onStartOfflineRapport).toHaveBeenCalledWith({ id: 'p1', name: 'MFH Sonnhalde', workTypes: [] })
    // Der Chat wird NICHT gestartet — er braucht das LLM.
    expect(onStartRapport).not.toHaveBeenCalled()
  })

  it('bleibt ohne Feature gesperrt und sagt warum', async () => {
    // Ohne Offline-Formular ist der Knopf ehrlich gesperrt, statt nach dem
    // Antippen mit einer Fehlermeldung zu scheitern (Grundregel §4.1).
    rememberProjects(USER, [project()], new Date())
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    allOffline()
    const u = userEvent.setup()
    render(<ProjekteScreen {...BASE} user={user(false)} />)
    await u.click(await screen.findByText('MFH Sonnhalde'))

    const knopf = await screen.findByRole('button', { name: /Rapport erstellen/ })
    expect(knopf).toBeDisabled()
    expect(screen.getByText(/Der Rapport-Chat braucht eine Internetverbindung/)).toBeInTheDocument()
  })
})

describe('Karte der wartenden Rapporte', () => {
  it('zeigt einen wartenden Rapport mit Erfassungszeit', async () => {
    await saveRapport(entry())
    await openDetail({ onStartOfflineRapport: vi.fn() })

    await waitFor(() =>
      expect(screen.getByText('Ein Rapport wartet auf Verbindung')).toBeInTheDocument())
    expect(screen.getByText(/Geht raus, sobald du wieder Verbindung hast/)).toBeInTheDocument()
  })

  it('nennt den Fehler, wenn der Server ihn abgelehnt hat', async () => {
    // Nie stumm: ein Rapport, der nicht durchgeht, sagt woran es liegt.
    await saveRapport(entry({ lastError: 'Projekt nicht gefunden.' }))
    await openDetail({ onStartOfflineRapport: vi.fn() })

    await waitFor(() =>
      expect(screen.getByText(/Projekt nicht gefunden\./)).toBeInTheDocument())
  })

  it('warnt bei einer Ablehnung MIT Unterschrift, dass eine Korrektur sie kostet', async () => {
    await saveRapport(entry({ lastError: 'Stunden ungültig.', signature: 'data:image/png;base64,AAA' }))
    await openDetail({ onStartOfflineRapport: vi.fn() })

    await waitFor(() =>
      expect(screen.getByText(/muss der Kunde neu unterschreiben/)).toBeInTheDocument())
  })

  it('zeigt nur die Rapporte DIESES Projekts', async () => {
    await saveRapport(entry({ clientId: 'c-1', projectId: 'p1' }))
    await saveRapport(entry({ clientId: 'c-2', projectId: 'p2' }))
    await openDetail({ onStartOfflineRapport: vi.fn() })

    await waitFor(() =>
      expect(screen.getByText('Ein Rapport wartet auf Verbindung')).toBeInTheDocument())
  })

  it('bleibt still, wenn nichts wartet', async () => {
    await openDetail({ onStartOfflineRapport: vi.fn() })
    await screen.findByRole('button', { name: /Rapport ohne Netz erfassen/ })
    expect(screen.queryByText(/wartet auf Verbindung/)).not.toBeInTheDocument()
  })
})


describe('Tiefgarage: Browser sagt online, nichts kommt durch', () => {
  it('bietet das Formular trotzdem an', async () => {
    // Der Fall, für den das Feature gebaut ist — und der einzige, in dem
    // `navigator.onLine` die falsche Antwort gibt. Hinge der Einstieg am Flag,
    // ginge das Formular hier nie auf.
    rememberProjects(USER, [project()], new Date())
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    allOffline()
    noteNetworkFailure()

    const onStartOfflineRapport = vi.fn()
    const u = userEvent.setup()
    render(<ProjekteScreen {...BASE} user={user(true)} onStartOfflineRapport={onStartOfflineRapport} />)
    await u.click(await screen.findByText('MFH Sonnhalde'))

    const knopf = await screen.findByRole('button', { name: /Rapport ohne Netz erfassen/ })
    expect(knopf).toBeEnabled()
    await u.click(knopf)
    expect(onStartOfflineRapport).toHaveBeenCalled()
  })

  it('führt bei tragender Leitung weiterhin in den Chat', async () => {
    rememberProjects(USER, [project()], new Date())
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    mockFetch.mockImplementation((path: string) =>
      path === '/pwa/projects' ? Promise.resolve([project()]) : Promise.resolve([]))

    const onStartRapport = vi.fn()
    const onStartOfflineRapport = vi.fn()
    const u = userEvent.setup()
    render(<ProjekteScreen {...BASE} user={user(true)}
      onStartRapport={onStartRapport} onStartOfflineRapport={onStartOfflineRapport} />)
    await u.click(await screen.findByText('MFH Sonnhalde'))

    await u.click(await screen.findByRole('button', { name: /Rapport erstellen/ }))
    expect(onStartRapport).toHaveBeenCalled()
    expect(onStartOfflineRapport).not.toHaveBeenCalled()
  })
})

describe('Aktionen an jedem wartenden Rapport', () => {
  it('schiebt ihn von Hand an', async () => {
    await saveRapport(entry())
    const retry = vi.spyOn(queue, 'retryRapport').mockResolvedValue({
      ok: true, duplicate: false, signatureLost: false, error: null,
    })
    const u = await openDetail({ onStartOfflineRapport: vi.fn() })

    await u.click(await screen.findByRole('button', { name: 'Jetzt senden' }))

    expect(retry).toHaveBeenCalledWith('c-1')
    await waitFor(() => expect(screen.getByText('Rapport übertragen.')).toBeInTheDocument())
  })

  it('sagt es, wenn dabei die Unterschrift verloren ging', async () => {
    await saveRapport(entry({ signature: 'data:image/png;base64,AAA' }))
    vi.spyOn(queue, 'retryRapport').mockResolvedValue({
      ok: true, duplicate: false, signatureLost: true, error: null,
    })
    const u = await openDetail({ onStartOfflineRapport: vi.fn() })

    await u.click(await screen.findByRole('button', { name: 'Jetzt senden' }))

    await waitFor(() =>
      expect(screen.getByText(/Unterschrift wurde nicht angenommen/)).toBeInTheDocument())
  })

  it('zeigt den Fehler, wenn es nicht klappt', async () => {
    await saveRapport(entry())
    vi.spyOn(queue, 'retryRapport').mockResolvedValue({
      ok: false, duplicate: false, signatureLost: false, error: 'Stunden ungültig.',
    })
    const u = await openDetail({ onStartOfflineRapport: vi.fn() })

    await u.click(await screen.findByRole('button', { name: 'Jetzt senden' }))

    await waitFor(() => expect(screen.getByText('Stunden ungültig.')).toBeInTheDocument())
  })

  it('lässt auch einen fehlerfreien Eintrag bearbeiten', async () => {
    // Wer sich vertippt hat, merkt es meist BEVOR der Upload durch ist — und
    // stand bis dahin vor einem Eintrag, den er nicht anfassen konnte.
    await saveRapport(entry())
    const onEditOfflineRapport = vi.fn()
    const u = await openDetail({ onStartOfflineRapport: vi.fn(), onEditOfflineRapport })

    await u.click(await screen.findByRole('button', { name: 'Bearbeiten' }))

    expect(onEditOfflineRapport).toHaveBeenCalledWith(
      { id: 'p1', name: 'MFH Sonnhalde' },
      expect.objectContaining({ clientId: 'c-1' }),
    )
  })

  it('verwirft nur nach Rückfrage', async () => {
    await saveRapport(entry())
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const u = await openDetail({ onStartOfflineRapport: vi.fn() })

    await u.click(await screen.findByRole('button', { name: 'Verwerfen' }))

    expect(confirm).toHaveBeenCalled()
    expect(await pendingRapporte(USER)).toHaveLength(1)
  })

  it('warnt beim Verwerfen deutlicher, wenn eine Unterschrift daran hängt', async () => {
    await saveRapport(entry({ signature: 'data:image/png;base64,AAA' }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const u = await openDetail({ onStartOfflineRapport: vi.fn() })

    await u.click(await screen.findByRole('button', { name: 'Verwerfen' }))

    expect(confirm.mock.calls[0][0]).toMatch(/unterschrieben/i)
    await waitFor(async () => expect(await pendingRapporte(USER)).toHaveLength(0))
  })
})


describe('Rückweg aus dem Formular', () => {
  it('schlägt das Projekt gleich auf, damit die Karte sichtbar ist', async () => {
    // Ohne das landet der Monteur nach «Fertig» in der Projektliste und sieht
    // von dem Rapport, der ihm gerade versprochen wurde («wartet auf dem
    // Gerät»), nichts.
    await saveRapport(entry())
    rememberProjects(USER, [project()], new Date())
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    allOffline()
    const onProjectOpened = vi.fn()

    render(<ProjekteScreen {...BASE} user={user(true)}
      openProjectId="p1" onProjectOpened={onProjectOpened}
      onStartOfflineRapport={vi.fn()} />)

    await waitFor(() =>
      expect(screen.getByText('Ein Rapport wartet auf Verbindung')).toBeInTheDocument())
    expect(onProjectOpened).toHaveBeenCalled()
  })
})

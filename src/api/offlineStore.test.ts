import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './client'
import {
  MAX_COMMENTS_PER_PROJECT, MAX_PROJECTS, MAX_TASKS_PER_PROJECT, MAX_WEEKS,
  clearOfflinePackages, loadOfflinePackage, offlinePackageKey, prefetchOfflinePackage,
  rememberProjectTasks, rememberProjects, rememberScheduleWeek, resetPrefetchGuard,
  saveOfflinePackage, snapshotAge,
} from './offlineStore'
import type { OfflinePackage } from './offlineStore'
import type { ScheduleWeek } from './schedule'
import type { MonteurProject } from '../shared/projectDetail/types'

// Offline-Lesepaket (docs/specs/offline-modus.md §3). Zwei Dinge müssen halten:
// die Deckel (ein volles localStorage darf keinen Screen brechen) und die
// Drosselung des Prefetch (sonst feuert jeder App-Start 5–25 GETs).

vi.mock('./client', () => ({ apiFetch: vi.fn() }))

const mockFetch = vi.mocked(apiFetch)
const USER = 'u-42'

function project(id: string): MonteurProject {
  return {
    id,
    name: `Projekt ${id}`,
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
  }
}

function week(monday: string): ScheduleWeek {
  return {
    week_start: monday,
    week_end: monday,
    week_number: 1,
    week_label: monday,
    has_any: false,
    days: [],
  }
}

function pkg(over: Partial<OfflinePackage> = {}): OfflinePackage {
  return {
    savedAt: '2026-08-28T07:42:00.000Z',
    projects: [],
    tasksByProject: {},
    commentsByProject: {},
    scheduleWeeks: {},
    ...over,
  }
}

/** Montag der laufenden Woche — die Wochen-Deckel messen die Distanz dazu. */
function currentMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

beforeEach(() => {
  localStorage.clear()
  mockFetch.mockReset()
  resetPrefetchGuard()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('offlineStore — Snapshot-Roundtrip', () => {
  it('schreibt und liest das Paket unverändert zurück', () => {
    const p = pkg({
      projects: [project('p1')],
      tasksByProject: { p1: [{ id: 't1', text: 'Fenster', is_done: false, done_at: null, done_by_name: null, created_at: 'x' }] },
      commentsByProject: { p1: [{ id: 'c1', author_name: 'Max', text: 'Schlüssel beim Nachbarn', created_at: 'x' }] },
      scheduleWeeks: { [currentMonday()]: week(currentMonday()) },
    })
    saveOfflinePackage(USER, p)

    const back = loadOfflinePackage(USER)
    expect(back?.projects).toHaveLength(1)
    expect(back?.tasksByProject.p1[0].text).toBe('Fenster')
    expect(back?.commentsByProject.p1[0].text).toBe('Schlüssel beim Nachbarn')
    expect(Object.keys(back?.scheduleWeeks ?? {})).toEqual([currentMonday()])
  })

  it('liefert null für einen fehlenden und für einen kaputten Eintrag', () => {
    expect(loadOfflinePackage(USER)).toBeNull()
    localStorage.setItem(offlinePackageKey(USER), '{nicht json')
    expect(loadOfflinePackage(USER)).toBeNull()
    localStorage.setItem(offlinePackageKey(USER), JSON.stringify({ savedAt: 'x' }))
    expect(loadOfflinePackage(USER)).toBeNull()
  })

  it('ignoriert einen leeren Benutzer — ohne id gibt es keinen Snapshot', () => {
    saveOfflinePackage('', pkg({ projects: [project('p1')] }))
    expect(localStorage.length).toBe(0)
    expect(loadOfflinePackage('')).toBeNull()
  })
})

describe('offlineStore — Deckel', () => {
  it('kürzt Projekte, Aufgaben, Kommentare und Wochen auf die Höchstzahl', () => {
    const monday = currentMonday()
    saveOfflinePackage(USER, pkg({
      projects: Array.from({ length: MAX_PROJECTS + 5 }, (_, i) => project(`p${i}`)),
      tasksByProject: {
        p0: Array.from({ length: MAX_TASKS_PER_PROJECT + 10 }, (_, i) => ({
          id: `t${i}`, text: `A${i}`, is_done: false, done_at: null, done_by_name: null, created_at: 'x',
        })),
      },
      commentsByProject: {
        p0: Array.from({ length: MAX_COMMENTS_PER_PROJECT + 10 }, (_, i) => ({
          id: `c${i}`, author_name: null, text: `K${i}`, created_at: 'x',
        })),
      },
      scheduleWeeks: {
        [monday]: week(monday),
        [shift(monday, 7)]: week(shift(monday, 7)),
        [shift(monday, 70)]: week(shift(monday, 70)),
        [shift(monday, 140)]: week(shift(monday, 140)),
      },
    }))

    const back = loadOfflinePackage(USER)!
    expect(back.projects).toHaveLength(MAX_PROJECTS)
    expect(back.tasksByProject.p0).toHaveLength(MAX_TASKS_PER_PROJECT)
    expect(back.commentsByProject.p0).toHaveLength(MAX_COMMENTS_PER_PROJECT)
    // Behalten wird, was am nächsten an der laufenden Woche liegt — nicht, was
    // zufällig zuerst im Objekt stand.
    expect(Object.keys(back.scheduleWeeks).sort()).toEqual([monday, shift(monday, 7)].sort())
    expect(Object.keys(back.scheduleWeeks)).toHaveLength(MAX_WEEKS)
  })

  it('wirft Aufgaben und Kommentare weg, deren Projekt nicht mehr in der Liste steht', () => {
    saveOfflinePackage(USER, pkg({
      projects: [project('p1')],
      tasksByProject: {
        p1: [{ id: 't1', text: 'bleibt', is_done: false, done_at: null, done_by_name: null, created_at: 'x' }],
        p_alt: [{ id: 't9', text: 'weg', is_done: false, done_at: null, done_by_name: null, created_at: 'x' }],
      },
      commentsByProject: {
        p_alt: [{ id: 'c9', author_name: null, text: 'weg', created_at: 'x' }],
      },
    }))

    const back = loadOfflinePackage(USER)!
    expect(Object.keys(back.tasksByProject)).toEqual(['p1'])
    expect(back.commentsByProject).toEqual({})
  })

  it('behält die gerade geschriebene Woche, auch wenn sie weit vorausliegt', () => {
    const monday = currentMonday()
    const weit = shift(monday, 70)
    rememberScheduleWeek(USER, monday, week(monday))
    rememberScheduleWeek(USER, shift(monday, 7), week(shift(monday, 7)))
    rememberScheduleWeek(USER, weit, week(weit))

    const keys = Object.keys(loadOfflinePackage(USER)!.scheduleWeeks)
    expect(keys).toContain(weit)
    expect(keys).toHaveLength(MAX_WEEKS)
  })
})

describe('offlineStore — Write-through', () => {
  it('führt savedAt bei jedem Teil-Schreiben nach', () => {
    rememberProjects(USER, [project('p1')], new Date('2026-08-28T06:00:00Z'))
    expect(loadOfflinePackage(USER)?.savedAt).toBe('2026-08-28T06:00:00.000Z')

    rememberProjectTasks(USER, 'p1', [], new Date('2026-08-28T07:30:00Z'))
    const back = loadOfflinePackage(USER)!
    expect(back.savedAt).toBe('2026-08-28T07:30:00.000Z')
    // Der ältere Teil bleibt stehen — jeder Schreibweg fasst nur seinen Teil an.
    expect(back.projects).toHaveLength(1)
  })
})

describe('offlineStore — Logout', () => {
  it('löscht alle Lesepakete, auch fremde, und lässt anderes in Ruhe', () => {
    saveOfflinePackage(USER, pkg({ projects: [project('p1')] }))
    saveOfflinePackage('kollege', pkg({ projects: [project('p2')] }))
    localStorage.setItem('zeit_offline_queue', '[]')

    clearOfflinePackages()

    expect(loadOfflinePackage(USER)).toBeNull()
    expect(loadOfflinePackage('kollege')).toBeNull()
    expect(localStorage.getItem('zeit_offline_queue')).toBe('[]')
  })
})

describe('offlineStore — Stand-Badge', () => {
  const savedAt = '2026-08-28T05:42:00.000Z'

  it('nennt die Uhrzeit, solange der Stand frisch ist', () => {
    const { label, stale } = snapshotAge(savedAt, new Date('2026-08-28T09:00:00Z'))
    expect(label).toMatch(/^Offline — Stand \d{2}:\d{2}$/)
    expect(stale).toBe(false)
  })

  it('nimmt ab 24 Stunden das Datum dazu und warnt', () => {
    const { label, stale } = snapshotAge(savedAt, new Date('2026-08-29T06:00:00Z'))
    expect(label).toContain('28.08.2026')
    expect(stale).toBe(true)
  })

  it('sagt «unbekannt» statt «Invalid Date», wenn der Zeitpunkt fehlt', () => {
    expect(snapshotAge('', new Date()).label).toBe('Offline — Stand unbekannt')
    expect(snapshotAge('kaputt', new Date()).label).toBe('Offline — Stand unbekannt')
  })
})

describe('offlineStore — Prefetch', () => {
  function routes(over: Record<string, unknown> = {}) {
    mockFetch.mockImplementation((path: string) => {
      if (path in over) {
        const v = over[path]
        return v instanceof Error ? Promise.reject(v) : Promise.resolve(v)
      }
      if (path === '/pwa/projects') return Promise.resolve([project('p1')])
      return Promise.resolve([])
    })
  }

  it('lädt Projekte, Aufgaben und Kommentare und legt sie ab', async () => {
    routes({
      '/pwa/projects/p1/tasks': [{ id: 't1', text: 'Fenster', is_done: false, done_at: null, done_by_name: null, created_at: 'x' }],
      '/pwa/projects/p1/comments': [{ id: 'c1', author_name: null, text: 'Notiz', created_at: 'x' }],
    })

    await prefetchOfflinePackage(USER, { scheduling: false })

    const back = loadOfflinePackage(USER)!
    expect(back.projects.map(p => p.id)).toEqual(['p1'])
    expect(back.tasksByProject.p1).toHaveLength(1)
    expect(back.commentsByProject.p1).toHaveLength(1)
    // Ohne Modul `scheduling` kein Wochenplan-Request — die Route wäre gated.
    expect(mockFetch.mock.calls.some(([p]) => String(p).startsWith('/pwa/schedule/'))).toBe(false)
  })

  it('holt mit Modul scheduling die laufende und die folgende Woche', async () => {
    const monday = currentMonday()
    routes({
      [`/pwa/schedule/week?week_start=${monday}`]: week(monday),
      [`/pwa/schedule/week?week_start=${shift(monday, 7)}`]: week(shift(monday, 7)),
    })

    await prefetchOfflinePackage(USER, { scheduling: true })

    expect(Object.keys(loadOfflinePackage(USER)!.scheduleWeeks).sort())
      .toEqual([monday, shift(monday, 7)].sort())
  })

  it('drosselt auf 15 Minuten, lässt `force` aber durch', async () => {
    routes()
    const t0 = new Date('2026-08-28T06:00:00Z')
    await prefetchOfflinePackage(USER, { scheduling: false, now: t0 })
    const calls = mockFetch.mock.calls.length
    expect(calls).toBeGreaterThan(0)

    // Fünf Minuten später: nichts passiert.
    await prefetchOfflinePackage(USER, { scheduling: false, now: new Date('2026-08-28T06:05:00Z') })
    expect(mockFetch.mock.calls.length).toBe(calls)

    // Direkt nach dem Einstempeln zählt der Netz-Moment mehr als die Drosselung.
    await prefetchOfflinePackage(USER, { scheduling: false, now: new Date('2026-08-28T06:06:00Z'), force: true })
    expect(mockFetch.mock.calls.length).toBeGreaterThan(calls)
  })

  it('rührt das Netz nicht an, solange der Browser offline ist', async () => {
    routes()
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await prefetchOfflinePackage(USER, { scheduling: false })
    expect(mockFetch).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('behält den alten Teil, wenn ein einzelner Load ausfällt', async () => {
    // Erst die Liste, dann die Aufgaben: die Deckel werfen alles weg, was zu
    // keinem Projekt der Liste gehört — ein Task-Eintrag ohne sein Projekt
    // überlebt das Schreiben nicht.
    rememberProjects(USER, [project('p1')], new Date('2026-08-27T06:00:00Z'))
    rememberProjectTasks(USER, 'p1', [
      { id: 't-alt', text: 'von gestern', is_done: false, done_at: null, done_by_name: null, created_at: 'x' },
    ], new Date('2026-08-27T06:00:00Z'))

    routes({ '/pwa/projects/p1/tasks': new Error('kein Netz') })
    await prefetchOfflinePackage(USER, { scheduling: false, now: new Date('2026-08-28T06:00:00Z') })

    expect(loadOfflinePackage(USER)!.tasksByProject.p1[0].text).toBe('von gestern')
  })

  it('wirft nie — ein misslungener Prefetch ist ein Nicht-Ereignis', async () => {
    mockFetch.mockRejectedValue(new Error('kaputt'))
    await expect(prefetchOfflinePackage(USER, { scheduling: false })).resolves.toBeUndefined()
  })
})

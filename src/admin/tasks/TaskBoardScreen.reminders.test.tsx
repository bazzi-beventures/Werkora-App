import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import TaskBoardScreen from './TaskBoardScreen'
import { apiFetch } from '../../api/client'
import type { BoardTask, TaskBoardResponse } from '../../api/admin'
import type { Reminder } from '../../api/admin/reminders'

// Aufgaben-Board × Erinnerungen (Spec aufgaben-kanban-board.md §14):
// die eigenen Erinnerungen stehen als Spalte in «Meine», nicht neben fremden
// Aufgaben, und aus jeder Karte lässt sich eine Erinnerung am Projekt setzen.

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}))

const mockFetch = vi.mocked(apiFetch)

function task(over: Partial<BoardTask> = {}): BoardTask {
  return {
    id: 't1', source: 'auto', task_type: 'project_overdue', title: 'Projekt überfällig: Torti Seuzach',
    description: null, project_id: 'proj-1', project_name: 'Torti Seuzach', ref_kind: 'project',
    ref_id: 'proj-1', status: 'offen', sort_order: 0, assignee_staff_id: 'staff-1',
    assignee_locked: false, due_date: '2026-08-10', created_by_name: null,
    done_at: null, done_by_name: null, auto_done: false, created_at: '2026-08-10T00:00:00Z',
    ...over,
  }
}

function board(assignee: string, tasks: BoardTask[] = [task()]): TaskBoardResponse {
  return {
    tasks,
    columns: ['offen', 'in_arbeit', 'wartet', 'erledigt'],
    fields: [
      { key: 'projekte', label: 'Projekte' },
      { key: 'manuell', label: 'Manuell' },
    ],
    task_types: { project_overdue: { label: 'Projekt überfällig', field: 'projekte', prozessgebunden: false } },
    me_staff_id: 'staff-1',
    can_filter_all: true,
    assignee,
    projektleiter: [{ id: 'staff-1', name: 'Franco Schäfler', kuerzel: 'FS' }],
    staff: [{ id: 'staff-1', name: 'Franco Schäfler', kuerzel: 'FS' }],
  }
}

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: 'rem-1', owner_user_id: 'admin-1', created_by_name: 'Tina',
    customer_id: 'cust-1', project_id: null,
    text: 'Kunde zurück aus Portugal — Termin vereinbaren', due_date: '2099-10-12', due_time: null,
    notified_at: null, done_at: null, done_by_name: null, created_at: '2026-10-03T10:00:00Z',
    customer: { id: 'cust-1', name: 'Peter Muster' }, project: null,
    ...over,
  }
}

function route(path: string, init?: RequestInit) {
  if (path.startsWith('/pwa/admin/tasks?')) {
    const assignee = new URLSearchParams(path.split('?')[1]).get('assignee') ?? 'me'
    return board(assignee)
  }
  if (path === '/pwa/admin/reminders/mine') return [reminder()]
  if (path === '/pwa/admin/reminders' && init?.method === 'POST') return reminder({ id: 'rem-2', due_date: '2099-10-20' })
  if (path.startsWith('/pwa/admin/reminders/') && init?.method === 'PATCH') return reminder({ done_at: 'now' })
  throw new Error(`unerwarteter Aufruf ${path}`)
}

describe('TaskBoardScreen — Erinnerungen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockFetch.mockImplementation(async (path: string, init?: RequestInit) => route(path, init))
  })

  it('zeigt die eigenen Erinnerungen als Spalte in «Meine»', async () => {
    render(<TaskBoardScreen onNav={vi.fn()} showReminders />)
    const col = await screen.findByTestId('board-reminder-column')
    expect(within(col).getByText(/Termin vereinbaren/)).toBeTruthy()
    expect(within(col).getByText('Peter Muster')).toBeTruthy()
  })

  it('blendet die Spalte neben fremden Aufgaben aus', async () => {
    render(<TaskBoardScreen onNav={vi.fn()} showReminders />)
    await screen.findByTestId('board-reminder-column')
    fireEvent.click(screen.getByText('Alle'))
    await waitFor(() => expect(screen.queryByTestId('board-reminder-column')).toBeNull())
  })

  it('ohne Modul gibt es weder Spalte noch Abruf', async () => {
    render(<TaskBoardScreen onNav={vi.fn()} />)
    await screen.findByText('Torti Seuzach')
    expect(screen.queryByTestId('board-reminder-column')).toBeNull()
    expect(mockFetch.mock.calls.some(c => String(c[0]).includes('reminders'))).toBe(false)
  })

  it('hakt eine Erinnerung direkt auf dem Board ab', async () => {
    render(<TaskBoardScreen onNav={vi.fn()} showReminders />)
    const col = await screen.findByTestId('board-reminder-column')
    fireEvent.click(within(col).getByLabelText('Erinnerung erledigt'))
    await waitFor(() => expect(screen.queryByTestId('board-reminder')).toBeNull())
    const patch = mockFetch.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'PATCH')
    expect(patch?.[0]).toBe('/pwa/admin/reminders/rem-1')
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({ done: true })
  })

  it('setzt aus dem Karten-Detail eine Erinnerung am Projekt der Karte', async () => {
    render(<TaskBoardScreen onNav={vi.fn()} showReminders />)
    fireEvent.click(await screen.findByText('Torti Seuzach'))
    fireEvent.click(await screen.findByText(/Erinnerung setzen/))
    fireEvent.click(screen.getByRole('button', { name: 'Erinnerung setzen' }))
    await screen.findByText(/Erinnerung gesetzt auf 20\.10\.2099/)
    const post = mockFetch.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'POST')
    const body = JSON.parse(String((post?.[1] as RequestInit).body))
    expect(body.project_id).toBe('proj-1')
    expect(body.text).toBe('Projekt überfällig: Torti Seuzach')
  })

  it('zeigt den Titel ohne das Präfix, das der Chip schon nennt', async () => {
    render(<TaskBoardScreen onNav={vi.fn()} />)
    expect(await screen.findByText('Torti Seuzach')).toBeTruthy()
    expect(screen.queryByText('Projekt überfällig: Torti Seuzach')).toBeNull()
  })
})

describe('TaskBoardScreen — Direktaktionen und gemerkte Ansicht', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/close') && init?.method === 'POST') return {}
      return route(path, init)
    })
  })

  it('schliesst ein überfälliges Projekt direkt von der Karte — nach Rückfrage, dann mit Sync', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TaskBoardScreen onNav={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Abschliessen' }))
    await waitFor(() => expect(mockFetch.mock.calls.some(c => c[0] === '/pwa/admin/projects/proj-1/close')).toBe(true))
    expect(confirm).toHaveBeenCalled()
    await waitFor(() => expect(mockFetch.mock.calls.some(c => String(c[0]).includes('refresh=1'))).toBe(true))
    confirm.mockRestore()
  })

  it('ohne Bestätigung passiert nichts', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<TaskBoardScreen onNav={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Abschliessen' }))
    expect(mockFetch.mock.calls.some(c => String(c[0]).endsWith('/close'))).toBe(false)
    confirm.mockRestore()
  })

  it('merkt Filter, Ansicht und Suche über einen Maskenwechsel', async () => {
    const first = render(<TaskBoardScreen onNav={vi.fn()} />)
    await screen.findByText('Torti Seuzach')
    fireEvent.click(screen.getByText('Alle'))
    fireEvent.click(screen.getByText('Status'))
    fireEvent.change(screen.getByLabelText('Aufgaben durchsuchen'), { target: { value: 'Torti' } })
    first.unmount()

    mockFetch.mockClear()
    render(<TaskBoardScreen onNav={vi.fn()} />)
    await screen.findByText('Torti Seuzach')
    expect(String(mockFetch.mock.calls[0][0])).toContain('assignee=all')
    expect(screen.getByText('Alle').className).toContain('active')
    expect(screen.getByText('Status').className).toContain('active')
    expect((screen.getByLabelText('Aufgaben durchsuchen') as HTMLInputElement).value).toBe('Torti')
  })
})

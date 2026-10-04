import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ReminderPanel } from './ReminderPanel'
import { MyReminders } from './MyReminders'
import { apiFetch } from '../../api/client'
import type { Reminder } from '../../api/admin/reminders'

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}))

const mockFetch = vi.mocked(apiFetch)

const ME = { authorized_user_id: 'admin-1', role: 'admin' }

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: 'rem-1', owner_user_id: 'admin-1', created_by_name: 'Tina',
    customer_id: 'cust-1', project_id: null,
    text: 'Termin vereinbaren', due_date: '2099-10-12', due_time: null,
    notified_at: null, done_at: null, done_by_name: null, created_at: '2026-10-03T10:00:00Z',
    customer: { id: 'cust-1', name: 'Peter Muster' }, project: null,
    ...over,
  }
}

function calls(method: string) {
  return mockFetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === method)
}

describe('ReminderPanel', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('setzt eine Erinnerung am Kunden — mit Schnellwahl-Datum, ohne Uhrzeit', async () => {
    mockFetch.mockImplementation(async (_path: string, init?: RequestInit) =>
      init?.method === 'POST' ? reminder() : [])
    render(<ReminderPanel target={{ customerId: 'cust-1' }} me={ME} />)

    fireEvent.click(await screen.findByText('+ Erinnerung setzen'))
    fireEvent.change(screen.getByLabelText('Text der Erinnerung'), { target: { value: ' Termin vereinbaren ' } })
    fireEvent.click(screen.getByText('In 1 Woche'))
    fireEvent.click(screen.getByRole('button', { name: 'Erinnerung setzen' }))

    await waitFor(() => expect(calls('POST')).toHaveLength(1))
    const [path, init] = calls('POST')[0]
    expect(path).toBe('/pwa/admin/reminders')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({ text: 'Termin vereinbaren', customer_id: 'cust-1', project_id: null, due_time: null })
    expect(body.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('zeigt fremde Erinnerungen mit Namen — abhaken ja, ändern nein', async () => {
    mockFetch.mockImplementation(async (_path: string, init?: RequestInit) =>
      init?.method ? reminder() : [reminder({ owner_user_id: 'admin-2', created_by_name: 'Kollegin' })])
    render(<ReminderPanel target={{ customerId: 'cust-1' }} me={ME} />)

    const panel = await screen.findByTestId('reminder-panel')
    await waitFor(() => expect(panel).toHaveTextContent('von Kollegin'))
    expect(within(panel).queryByText('Ändern')).toBeNull()

    fireEvent.click(within(panel).getByLabelText('Erledigt'))
    await waitFor(() => expect(calls('PATCH')).toHaveLength(1))
    expect(JSON.parse((calls('PATCH')[0][1] as RequestInit).body as string)).toEqual({ done: true })
  })

  it('lädt die Liste über den Bezug', async () => {
    mockFetch.mockResolvedValue([])
    render(<ReminderPanel target={{ projectId: 'p-1' }} me={ME} />)
    await screen.findByText('Keine offenen Erinnerungen.')
    expect(mockFetch.mock.calls[0][0]).toBe('/pwa/admin/reminders?project_id=p-1')
  })
})

describe('MyReminders', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('führt zum Projekt vor dem Kunden', async () => {
    mockFetch.mockResolvedValue([
      reminder({ id: 'a', project_id: 'p-1', project: { id: 'p-1', name: 'Leerwhg.', project_id_text: '261301' } }),
    ])
    const onOpenProject = vi.fn()
    const onOpenCustomer = vi.fn()
    render(<MyReminders onOpenProject={onOpenProject} onOpenCustomer={onOpenCustomer} />)

    fireEvent.click(await screen.findByText('Peter Muster · 261301 Leerwhg.'))
    expect(onOpenProject).toHaveBeenCalledWith('p-1')
    expect(onOpenCustomer).not.toHaveBeenCalled()
  })

  it('zählt Fälliges und nimmt Abgehaktes aus der Liste', async () => {
    mockFetch.mockImplementation(async (_path: string, init?: RequestInit) =>
      init?.method === 'PATCH' ? reminder() : [reminder({ due_date: '2000-01-01' }), reminder({ id: 'b' })])
    render(<MyReminders onOpenProject={vi.fn()} onOpenCustomer={vi.fn()} />)

    const box = await screen.findByTestId('my-reminders')
    expect(box).toHaveTextContent('Überfällig · 01.01.2000')
    expect(box).toHaveTextContent('Demnächst · 12.10.2099')

    fireEvent.click(within(box).getAllByLabelText('Erledigt')[0])
    await waitFor(() => expect(within(box).getAllByLabelText('Erledigt')).toHaveLength(1))
  })
})

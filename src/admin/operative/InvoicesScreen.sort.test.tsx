// Rechnungsliste: Sortieren per Spaltenkopf — wie die Offertenliste
// (QuotesScreen.sort.test.tsx): der Klick schickt Schlüssel und Richtung an den
// Server, die Reihenfolge macht Postgres.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InvoicesScreen from './InvoicesScreen'
import { apiFetch } from '../../api/client'

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))
vi.mock('../useIsMobile', () => ({ useIsMobile: () => false }))

const mockFetch = vi.mocked(apiFetch)

const ROW = {
  id: 42, invoice_number: 'RE-2026-083', project_name: 'Fassade Seehalde', total_amount: 4159.5,
  status: 'gesendet', created_at: '2026-08-01T10:00:00Z', paid_at: null, storage_path: null,
  projektleiter_id: null, project_id: 'p-1', project_status: 'offen', project_is_closed: false,
}

function listQueries(): URLSearchParams[] {
  return mockFetch.mock.calls
    .map(c => String(c[0]))
    .filter(p => p.startsWith('/pwa/admin/invoices/list?'))
    .map(p => new URLSearchParams(p.split('?')[1]))
}

function lastListQuery(): URLSearchParams {
  const qs = listQueries()
  return qs[qs.length - 1]
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (path: string) => {
    if (String(path).startsWith('/pwa/admin/invoices/list')) {
      return { rows: [ROW], total: 1, page: 1, page_size: 50 }
    }
    if (path === '/pwa/admin/staff') return []
    return {}
  })
})

describe('InvoicesScreen — Sortierung', () => {
  it('startet mit den neuesten zuerst', async () => {
    render(<InvoicesScreen />)
    await screen.findByText('RE-2026-083')
    expect(lastListQuery().get('sort')).toBe('created_at')
    expect(lastListQuery().get('dir')).toBe('desc')
  })

  it.each([
    ['Nr.', 'invoice_number'],
    ['Projekt', 'project_name'],
    ['Betrag', 'total_amount'],
    ['Status', 'status'],
    ['Bezahlt am', 'paid_at'],
  ])('Klick auf «%s» sortiert nach %s', async (label, key) => {
    const user = userEvent.setup()
    render(<InvoicesScreen />)
    await screen.findByText('RE-2026-083')
    // Exakt: der Pfeil ist aria-hidden, «Projekt» darf «Projektleiter» nicht treffen.
    const kopf = screen.getByRole('columnheader', { name: label })
    await user.click(kopf.querySelector('button')!)
    await waitFor(() => expect(lastListQuery().get('sort')).toBe(key))
    expect(lastListQuery().get('dir')).toBe('asc')
    expect(lastListQuery().get('page')).toBe('1')
  })

  it('dreht beim zweiten Klick die Richtung', async () => {
    const user = userEvent.setup()
    render(<InvoicesScreen />)
    await screen.findByText('RE-2026-083')
    await user.click(screen.getByRole('button', { name: /^Bezahlt am/ }))
    await waitFor(() => expect(lastListQuery().get('dir')).toBe('asc'))
    await user.click(screen.getByRole('button', { name: /^Bezahlt am/ }))
    await waitFor(() => expect(lastListQuery().get('dir')).toBe('desc'))
    expect(lastListQuery().get('sort')).toBe('paid_at')
  })
})

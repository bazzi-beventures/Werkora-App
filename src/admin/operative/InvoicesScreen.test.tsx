import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InvoicesScreen from './InvoicesScreen'
import { apiFetch } from '../../api/client'
import { todayISO } from '../utils/format'

// Nur das Netzwerk mocken — Dialog-/Ablauflogik bleibt echt.
vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))

const mockFetch = vi.mocked(apiFetch)

function invoice(over: Record<string, unknown> = {}) {
  return {
    id: 42,
    invoice_number: 'RE-2026-083',
    project_name: 'Fassade Seehalde',
    total_amount: 4159.5,
    status: 'gesendet',
    created_at: '2026-08-01T10:00:00Z',
    paid_at: null,
    storage_path: null,
    projektleiter_id: null,
    project_id: 'p-1',
    project_status: 'offen',
    project_is_closed: false,
    ...over,
  }
}

// apiFetch nach Pfad beantworten; Mutationen liefern {} und werden über die
// mock.calls geprüft.
function routeFetch(invoices: Record<string, unknown>[]) {
  mockFetch.mockImplementation(async (path: string) => {
    if (path === '/pwa/admin/invoices') return invoices
    if (path === '/pwa/admin/staff') return []
    return {}
  })
}

async function openPaidDialog(inv: Record<string, unknown> = invoice()) {
  routeFetch([inv])
  render(<InvoicesScreen />)
  await screen.findByText('RE-2026-083')
  await userEvent.click(screen.getByRole('button', { name: 'Als bezahlt markieren' }))
}

describe('InvoicesScreen — bezahlt markieren', () => {
  beforeEach(() => mockFetch.mockReset())

  it('schlägt heute als Zahlungsdatum vor und schickt es mit', async () => {
    await openPaidDialog()
    expect((screen.getByLabelText('Zahlungsdatum') as HTMLInputElement).value).toBe(todayISO())

    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/invoices/42/mark-paid', {
        method: 'POST',
        body: JSON.stringify({ paid_at: todayISO() }),
      }),
    )
  })

  it('reicht ein nachgetragenes Zahlungsdatum durch', async () => {
    await openPaidDialog()
    const dateInput = screen.getByLabelText('Zahlungsdatum')
    await userEvent.clear(dateInput)
    await userEvent.type(dateInput, '2026-08-11')
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/invoices/42/mark-paid', {
        method: 'POST',
        body: JSON.stringify({ paid_at: '2026-08-11' }),
      }),
    )
  })
})

describe('InvoicesScreen — Anschlussfrage «Projekt abschliessen?»', () => {
  beforeEach(() => mockFetch.mockReset())

  it('fragt nach dem Bezahlen und schliesst das Projekt auf Bestätigung', async () => {
    await openPaidDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))

    expect(await screen.findByText('Projekt abschliessen?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ja, abschliessen' }))

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/projects/p-1/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'abgeschlossen' }),
      }),
    )
  })

  it('lässt das Projekt offen, wenn man ablehnt', async () => {
    await openPaidDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Offen lassen' }))

    expect(screen.queryByText('Projekt abschliessen?')).not.toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/pwa/admin/projects/p-1/status', expect.anything(),
    )
  })

  it('fragt nicht bei einem bereits abgeschlossenen Projekt', async () => {
    await openPaidDialog(invoice({ project_status: 'abgeschlossen', project_is_closed: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/pwa/admin/invoices/42/mark-paid', expect.anything(),
    ))
    expect(screen.queryByText('Projekt abschliessen?')).not.toBeInTheDocument()
  })

  it('fragt nicht, wenn die Rechnung an keinem Projekt hängt', async () => {
    await openPaidDialog(invoice({ project_id: null, project_status: null }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/pwa/admin/invoices/42/mark-paid', expect.anything(),
    ))
    expect(screen.queryByText('Projekt abschliessen?')).not.toBeInTheDocument()
  })

  it('fragt nicht, wenn das Bezahlen fehlgeschlagen ist', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (path === '/pwa/admin/invoices') return [invoice()]
      if (path === '/pwa/admin/staff') return []
      if (String(path).includes('mark-paid')) {
        throw new Error('Das Zahlungsdatum liegt vor dem Rechnungsdatum (01.08.2026).')
      }
      return {}
    })
    render(<InvoicesScreen />)
    await screen.findByText('RE-2026-083')
    await userEvent.click(screen.getByRole('button', { name: 'Als bezahlt markieren' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))

    // Die Backend-Meldung steht im Toast, die Anschlussfrage bleibt aus.
    expect(await screen.findByText(/Zahlungsdatum liegt vor dem Rechnungsdatum/)).toBeInTheDocument()
    expect(screen.queryByText('Projekt abschliessen?')).not.toBeInTheDocument()
  })
})

describe('InvoicesScreen — Klick auf die Rechnung öffnet das Projekt', () => {
  beforeEach(() => mockFetch.mockReset())

  it('navigiert beim Klick auf die Zeile ins Projekt', async () => {
    routeFetch([invoice()])
    const onNav = vi.fn()
    render(<InvoicesScreen onNav={onNav} />)
    await userEvent.click(await screen.findByText('RE-2026-083'))

    expect(onNav).toHaveBeenCalledWith('projects', 'p-1')
  })

  it('lässt die Aktions-Buttons nicht ins Projekt springen', async () => {
    routeFetch([invoice()])
    const onNav = vi.fn()
    render(<InvoicesScreen onNav={onNav} />)
    await screen.findByText('RE-2026-083')
    await userEvent.click(screen.getByRole('button', { name: 'Als bezahlt markieren' }))

    expect(screen.getByText('Rechnung als bezahlt markieren?')).toBeInTheDocument()
    expect(onNav).not.toHaveBeenCalled()
  })

  it('navigiert nicht bei einer Rechnung ohne Projektbezug', async () => {
    routeFetch([invoice({ project_id: null })])
    const onNav = vi.fn()
    render(<InvoicesScreen onNav={onNav} />)
    await userEvent.click(await screen.findByText('RE-2026-083'))

    expect(onNav).not.toHaveBeenCalled()
  })
})

describe('InvoicesScreen — Hinweis auf offene Rechnungen beim Abschliessen', () => {
  beforeEach(() => mockFetch.mockReset())

  it('warnt, wenn das Projekt weitere offene Rechnungen hat', async () => {
    routeFetch([invoice(), invoice({ id: 43, invoice_number: 'RE-2026-084', status: 'offen' })])
    render(<InvoicesScreen />)
    await screen.findByText('RE-2026-083')
    await userEvent.click(screen.getAllByRole('button', { name: 'Als bezahlt markieren' })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))

    expect(await screen.findByText('Projekt abschliessen?')).toBeInTheDocument()
    expect(screen.getByText('Achtung: Für dieses Projekt ist noch 1 Rechnung offen.')).toBeInTheDocument()
  })

  it('warnt nicht, wenn die bezahlte die letzte offene Rechnung war', async () => {
    await openPaidDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))

    expect(await screen.findByText('Projekt abschliessen?')).toBeInTheDocument()
    expect(screen.queryByText(/Rechnung(en)? offen/)).not.toBeInTheDocument()
  })
})

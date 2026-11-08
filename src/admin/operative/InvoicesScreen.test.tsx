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

// Die Liste kommt seitenweise (`…/invoices/list?…`); die Rechnungen eines
// Projekts holt der Screen für Dialog-Fragen eigens (`…/projects/<id>/invoices`).
function listAnswer(rawPath: unknown, invoices: Record<string, unknown>[]): unknown {
  const path = String(rawPath)
  if (path.startsWith('/pwa/admin/invoices/list')) {
    return { rows: invoices, total: invoices.length, page: 1, page_size: 50, open_total: 0 }
  }
  const m = /^\/pwa\/admin\/projects\/([^/]+)\/invoices$/.exec(path)
  if (m) return invoices.filter(i => i.project_id === m[1])
  if (path === '/pwa/admin/staff') return []
  return undefined
}

// apiFetch nach Pfad beantworten; Mutationen liefern {} und werden über die
// mock.calls geprüft.
function routeFetch(invoices: Record<string, unknown>[]) {
  mockFetch.mockImplementation(async (path: string) => listAnswer(path, invoices) ?? {})
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
        body: JSON.stringify({ paid_at: todayISO(), paid_amount: null }),
      }),
    )
  })

  it('schickt den eingegangenen Betrag, wenn der Kunde Skonto abzieht (WW-19)', async () => {
    await openPaidDialog()
    const amount = screen.getByLabelText('Eingegangener Betrag (CHF)')
    await userEvent.clear(amount)
    await userEvent.type(amount, '100')
    expect(screen.getByText(/Abzug CHF/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/invoices/42/mark-paid', {
        method: 'POST',
        body: JSON.stringify({ paid_at: todayISO(), paid_amount: 100 }),
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
        body: JSON.stringify({ paid_at: '2026-08-11', paid_amount: null }),
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
      if (String(path).includes('mark-paid')) {
        throw new Error('Das Zahlungsdatum liegt vor dem Rechnungsdatum (01.08.2026).')
      }
      return listAnswer(path, [invoice()]) ?? {}
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

describe('InvoicesScreen — seitenweise', () => {
  beforeEach(() => mockFetch.mockReset())

  function lastListCall(): URLSearchParams {
    const paths = mockFetch.mock.calls
      .map(c => String(c[0]))
      .filter(p => p.startsWith('/pwa/admin/invoices/list?'))
    return new URLSearchParams(paths[paths.length - 1].split('?')[1])
  }

  it('zeigt Gesamtzahl und den offenen Betrag des Servers', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/pwa/admin/invoices/list')) {
        return { rows: [invoice()], total: 412, page: 1, page_size: 50, open_total: 8047 }
      }
      return listAnswer(path, []) ?? {}
    })
    render(<InvoicesScreen />)
    // Der Betrag kommt vom Server (alle offenen, nicht nur die der Seite).
    expect(await screen.findByText(/412 Einträge · Offen: CHF 8.047\.00/)).toBeInTheDocument()
    expect(screen.getByText('1–50 von 412')).toBeInTheDocument()

    const q = lastListCall()
    expect(q.get('page')).toBe('1')
    expect(q.get('status')!.split(',').sort()).toEqual(['ausstehend', 'bezahlt', 'gesendet', 'inaktiv', 'offen'])
  })

  it('lässt «Offen» weg, wenn der Server den Betrag nicht liefern konnte', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/pwa/admin/invoices/list')) {
        return { rows: [invoice()], total: 1, page: 1, page_size: 50, open_total: null }
      }
      return listAnswer(path, []) ?? {}
    })
    render(<InvoicesScreen />)
    expect(await screen.findByText('1 Einträge')).toBeInTheDocument()
    expect(screen.queryByText(/Offen:/)).not.toBeInTheDocument()
  })

  it('blättert und schickt die Suche an den Server', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/pwa/admin/invoices/list')) {
        const page = Number(new URLSearchParams(String(path).split('?')[1]).get('page'))
        return {
          rows: [invoice({ id: page, invoice_number: `RE-SEITE-${page}` })],
          total: 120, page, page_size: 50, open_total: 0,
        }
      }
      return listAnswer(path, []) ?? {}
    })
    render(<InvoicesScreen />)
    await screen.findByText('RE-SEITE-1')
    await userEvent.click(screen.getByRole('button', { name: 'Weiter →' }))
    expect(await screen.findByText('RE-SEITE-2')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/such/i), 'lorca')
    await waitFor(() => expect(lastListCall().get('search')).toBe('lorca'))
    expect(lastListCall().get('page')).toBe('1')
  })

  it('sagt es, wenn die Liste nicht geladen werden konnte', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/pwa/admin/invoices/list')) throw new Error('503')
      return listAnswer(path, []) ?? {}
    })
    render(<InvoicesScreen />)
    expect(await screen.findByText('Rechnungen konnten nicht geladen werden.')).toBeInTheDocument()
  })
})

describe('InvoicesScreen — was die Liste allein nicht mehr weiss', () => {
  beforeEach(() => mockFetch.mockReset())

  // Die Liste kennt nur eine Seite und den Filter — ob ein Projekt schon eine
  // gültige Rechnung hat, fragt der Dialog deshalb das Projekt selbst.
  it('bietet «Weitere Rechnung» an, wenn das Projekt eine gültige Rechnung hat', async () => {
    const projektRechnung = invoice({ id: 7, project_id: 'p-9', status: 'bezahlt' })
    mockFetch.mockImplementation(async (path: string) => {
      const p = String(path)
      if (p === '/pwa/admin/projects') return [{ id: 'p-9', name: 'Lorca Winterthur', is_closed: false }]
      // Die Seite selbst enthält die Rechnung des Projekts NICHT (anderer Filter).
      if (p.startsWith('/pwa/admin/invoices/list')) {
        return { rows: [], total: 0, page: 1, page_size: 50, open_total: 0 }
      }
      return listAnswer(p, [projektRechnung]) ?? {}
    })
    render(<InvoicesScreen />)
    await screen.findByText('Keine Rechnungen gefunden.')
    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung erstellen' }))
    await userEvent.selectOptions(await screen.findByDisplayValue('-- Projekt wählen --'), 'p-9')

    expect(await screen.findByText('Weitere Rechnung')).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/projects/p-9/invoices')
  })

  it('bietet sie nicht an, wenn das Projekt noch keine Rechnung hat', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (String(path) === '/pwa/admin/projects') {
        return [{ id: 'p-9', name: 'Lorca Winterthur', is_closed: false }]
      }
      return listAnswer(path, []) ?? {}
    })
    render(<InvoicesScreen />)
    await screen.findByText('Keine Rechnungen gefunden.')
    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung erstellen' }))
    await userEvent.selectOptions(await screen.findByDisplayValue('-- Projekt wählen --'), 'p-9')

    expect(await screen.findByText('Art der Rechnung')).toBeInTheDocument()
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/projects/p-9/invoices'))
    expect(screen.queryByText('Weitere Rechnung')).not.toBeInTheDocument()
  })

  it('sagt beim Abschliessen ehrlich, wenn offene Rechnungen nicht prüfbar waren', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (String(path) === '/pwa/admin/projects/p-1/invoices') throw new Error('503')
      return listAnswer(path, [invoice()]) ?? {}
    })
    render(<InvoicesScreen />)
    await screen.findByText('RE-2026-083')
    await userEvent.click(screen.getByRole('button', { name: 'Als bezahlt markieren' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))

    expect(await screen.findByText('Projekt abschliessen?')).toBeInTheDocument()
    expect(screen.getByText(/liess sich nicht prüfen/)).toBeInTheDocument()
  })
})

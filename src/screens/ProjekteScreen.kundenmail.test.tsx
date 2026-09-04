import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjekteScreen from './ProjekteScreen'
import { apiFetch } from '../api/client'

// Kunden-E-Mail am Projekt nachtragen (Spec docs/specs/kunden-email-erfassen.md).
//
// Der Anlass ist ein Datenproblem, kein Bedienwunsch: bei vielen Kunden fehlt die
// Adresse, und die einzige Gelegenheit, sie zu bekommen, ist der Moment, in dem
// jemand vor Ort steht. Deshalb steht das Feld bei den Projektinfos — und deshalb
// fragt der Rapport-Chat NICHT danach: eine Pflichtfrage im Ablauf hätte den
// Rapport verlangsamt, den es ohnehin zu schreiben gilt.

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  apiFormFetch: vi.fn(),
  apiUrl: (p: string) => p,
  isNetworkError: () => false,
  ApiError: class ApiError extends Error {
    status: number
    constructor(status = 500, msg = '') { super(msg); this.status = status }
  },
}))

const mockFetch = vi.mocked(apiFetch)

function project(customer: Record<string, unknown> | null) {
  return {
    id: 'p1',
    name: 'MFH Sonnhalde',
    kind: 'project',
    art_der_arbeit: ['Montage'],
    customer_id: customer ? 'c1' : null,
    customer,
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

function customer(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'Büchel AG',
    billing_name: null,
    address: null,
    billing_address: null,
    object_address: null,
    email: null,
    phone: null,
    ...over,
  }
}

const NOOP = {
  user: null,
  onNavHome: () => {},
  onNavRapport: () => {},
  onNavArbeitszeit: () => {},
  onNavProfile: () => {},
  onLoggedOut: () => {},
}

/** Projektliste per GET, Detail-Ressourcen leer, POSTs bekommen `saved` zurück. */
function routeFetch(projects: Record<string, unknown>[], saved: unknown = null) {
  mockFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/pwa/projects' && !init) return Promise.resolve(projects)
    if (init?.method === 'POST') return Promise.resolve(saved)
    return Promise.resolve([])
  })
}

async function openDetail(projects: Record<string, unknown>[], saved: unknown = null) {
  const user = userEvent.setup()
  routeFetch(projects, saved)
  render(<ProjekteScreen {...NOOP} onStartRapport={vi.fn()} />)
  await user.click(await screen.findByText('MFH Sonnhalde'))
  await screen.findByRole('button', { name: /Rapport erstellen/ })
  return user
}

beforeEach(() => {
  mockFetch.mockReset()
  localStorage.clear()
})

describe('ProjekteScreen — Kunden-E-Mail erfassen', () => {
  it('bietet ein leeres Feld an, wenn der Kunde keine Adresse hat', async () => {
    await openDetail([project(customer())])
    expect(screen.getByLabelText('Kunden-E-Mail')).toHaveValue('')
  })

  it('speichert die eingetippte Adresse und zeigt sie danach als Mail-Link', async () => {
    const user = await openDetail(
      [project(customer())],
      { status: 'success', email: 'info@buechel.ch' },
    )

    await user.type(screen.getByLabelText('Kunden-E-Mail'), 'info@buechel.ch')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/pwa/projects/p1/customer-email',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'info@buechel.ch' }),
      }),
    ))
    // Ohne Neuladen: der Screen zieht den Kunden lokal nach, sonst stünde das Feld
    // nach dem Speichern wieder leer da.
    const link = await screen.findByRole('link', { name: 'info@buechel.ch' })
    expect(link).toHaveAttribute('href', 'mailto:info@buechel.ch')
  })

  it('weist einen Tippfehler ab, ohne den Server zu fragen', async () => {
    const user = await openDetail([project(customer())])

    await user.type(screen.getByLabelText('Kunden-E-Mail'), 'info-buechel.ch')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByText(/sieht nicht nach einer E-Mail-Adresse aus/)).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/pwa/projects/p1/customer-email', expect.anything(),
    )
  })

  it('zeigt eine gepflegte Adresse an, statt sie zum Überschreiben anzubieten', async () => {
    await openDetail([project(customer({ email: 'alt@buechel.ch' }))])

    expect(screen.getByRole('link', { name: 'alt@buechel.ch' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Kunden-E-Mail')).not.toBeInTheDocument()
  })

  it('lässt die gepflegte Adresse über «Ändern» korrigieren — vorbefüllt', async () => {
    const user = await openDetail(
      [project(customer({ email: 'alt@buechel.ch' }))],
      { status: 'success', email: 'neu@buechel.ch' },
    )

    await user.click(screen.getByRole('button', { name: 'Ändern' }))
    const input = screen.getByLabelText('Kunden-E-Mail')
    expect(input).toHaveValue('alt@buechel.ch')

    await user.clear(input)
    await user.type(input, 'neu@buechel.ch')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByRole('link', { name: 'neu@buechel.ch' })).toBeInTheDocument()
  })

  it('lässt die Zeile weg, wenn am Projekt gar kein Kunde hängt', async () => {
    await openDetail([project(null)])
    expect(screen.queryByLabelText('Kunden-E-Mail')).not.toBeInTheDocument()
    expect(screen.queryByText('Kunden-E-Mail')).not.toBeInTheDocument()
  })
})

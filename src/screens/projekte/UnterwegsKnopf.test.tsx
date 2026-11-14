import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UnterwegsKnopf } from './UnterwegsKnopf'
import { apiFetch } from '../../api/client'
import type { MeldungAnsicht } from '../../api/serviceBegleitung'

// Knopf «Unterwegs» (docs/specs/servicebegleitung.md §5.2, §13).

vi.mock('../../api/client', () => {
  class TestApiError extends Error {
    status: number
    constructor(status = 500, msg = '') { super(msg); this.status = status }
  }
  return { apiFetch: vi.fn(), ApiError: TestApiError }
})

const mockFetch = vi.mocked(apiFetch)

function ansicht(over: Partial<MeldungAnsicht> = {}): MeldungAnsicht {
  return {
    appointment_id: 'a1', stand: 'geplant', ankunft_ca: null, unterwegs_at: null, vor_ort_at: null,
    nachrichten_uebrig: 3, vorschlag: '08:35', chips: [10, 15, 20], kunde_erreichbar: true,
    telefon: '079 111 22 33', ...over,
  }
}

function setOnline(wert: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => wert })
}

beforeEach(() => { mockFetch.mockReset(); setOnline(true) })
afterEach(() => setOnline(true))

describe('UnterwegsKnopf', () => {
  it('ist offline gesperrt und bietet den Anruf an', () => {
    setOnline(false)
    render(<UnterwegsKnopf appointmentId="a1" telefonOffline="079 111 22 33" />)
    expect(screen.getByRole('button', { name: 'Unterwegs' })).toBeDisabled()
    expect(screen.getByText(/Offline/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '079 111 22 33' })).toHaveAttribute('href', 'tel:0791112233')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('wählt die gerechnete Ankunftszeit vor und meldet erst nach dem zweiten Tipp', async () => {
    mockFetch.mockResolvedValueOnce(ansicht())
    render(<UnterwegsKnopf appointmentId="a1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Unterwegs' }))
    expect(screen.getByLabelText('Ankunftszeit')).toHaveValue('08:35')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    mockFetch.mockResolvedValueOnce({
      stand: { stand: 'unterwegs', ankunft_ca: '08:35', unterwegs_at: '08:10', vor_ort_at: null, nachrichten_uebrig: 2 },
      kunde_informiert: true, hinweis: 'Der Kunde wurde per Mail informiert.',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Melden' }))
    await screen.findByText('Unterwegs gemeldet 08:10, Ankunft ca. 08:35')
    const [pfad, opts] = mockFetch.mock.calls[1]
    expect(pfad).toBe('/pwa/schedule/appointments/a1/meldung')
    expect(JSON.parse(String((opts as RequestInit).body))).toEqual({ art: 'unterwegs', ankunft_ca: '08:35' })
    // Danach wird der Knopf zu «Vor Ort», daneben «Verspätung melden».
    expect(screen.getByRole('button', { name: 'Vor Ort' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verspätung melden' })).toBeInTheDocument()
  })

  it('sagt, wenn kein Kontakt hinterlegt ist, und bietet den Anruf an', async () => {
    mockFetch.mockResolvedValueOnce(ansicht({ kunde_erreichbar: false, vorschlag: null }))
    render(<UnterwegsKnopf appointmentId="a1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Unterwegs' }))
    expect(screen.getByText(/Kein Kontakt hinterlegt/)).toBeInTheDocument()
    // Ohne Vorwahl wählt der Monteur einen Chip — «Melden» bleibt bis dahin aus.
    expect(screen.getByRole('button', { name: 'Melden' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'in 15 Min.' }))
    expect(screen.getByRole('button', { name: 'Melden' })).toBeEnabled()
  })

  it('zeigt nichts, wenn der Server die Meldung nicht anbietet', async () => {
    mockFetch.mockRejectedValueOnce(new Error('403'))
    const { container } = render(<UnterwegsKnopf appointmentId="a1" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

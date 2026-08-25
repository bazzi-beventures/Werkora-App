import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SendOrderConfirmationDialog, SendThankyouDialog } from './SendQuoteMailDialog'
import { apiFetch } from '../../api/client'

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>()
  return { ...actual, apiFetch: vi.fn() }
})

const mockFetch = vi.mocked(apiFetch)

// Kunden-Mail-Dialoge zu einer Offerte (Danke-Mail, Auftragsbestätigung): fragen
// analog zum Offerten-Versand zuerst die Empfänger-Adresse ab (vorbelegt mit der
// Kunden-E-Mail) und schicken sie an den jeweiligen Endpoint.

function renderDialog(onSent = vi.fn()) {
  render(
    <SendThankyouDialog
      quoteId={7}
      header="OF-2026-042"
      defaultEmail="kunde@example.ch"
      onClose={vi.fn()}
      onSent={onSent}
    />,
  )
  return onSent
}

function sendCall() {
  return mockFetch.mock.calls.find(c => c[0] === '/pwa/admin/quotes/7/send-thankyou')!
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockResolvedValue({ status: 'ok', message: 'Danke-Mail gesendet' })
})

describe('SendThankyouDialog', () => {
  it('sendet die vorbelegte Kunden-E-Mail als recipient_email mit', async () => {
    const user = userEvent.setup()
    const onSent = renderDialog()

    expect(screen.getByRole('textbox')).toHaveValue('kunde@example.ch')
    await user.click(screen.getByRole('button', { name: 'Dankesmail senden' }))

    await waitFor(() => expect(onSent).toHaveBeenCalledWith('Danke-Mail gesendet'))
    const body = JSON.parse((sendCall()[1] as RequestInit).body as string)
    expect(body).toEqual({ recipient_email: 'kunde@example.ch' })
  })

  it('sendet eine geänderte Adresse', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'neu@example.ch')
    await user.click(screen.getByRole('button', { name: 'Dankesmail senden' }))

    await waitFor(() => expect(sendCall()).toBeTruthy())
    const body = JSON.parse((sendCall()[1] as RequestInit).body as string)
    expect(body).toEqual({ recipient_email: 'neu@example.ch' })
  })

  it('sperrt den Senden-Knopf ohne E-Mail-Adresse', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.clear(screen.getByRole('textbox'))
    expect(screen.getByRole('button', { name: 'Dankesmail senden' })).toBeDisabled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('zeigt den Backend-Fehler an und bleibt offen', async () => {
    const user = userEvent.setup()
    mockFetch.mockRejectedValue(new Error('Danke-Mail wurde für diese Offerte bereits versendet.'))
    const onSent = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Dankesmail senden' }))

    expect(await screen.findByText('Danke-Mail wurde für diese Offerte bereits versendet.')).toBeInTheDocument()
    expect(onSent).not.toHaveBeenCalled()
  })
})

// ── Auftragsbestätigung ────────────────────────────────────────────────────
// Gleicher Dialog, anderer Endpoint. Wichtig: der Knopf hängt an keinem Feature —
// der Dialog selbst kennt darum gar keine Flags, er sendet einfach.

function renderOrderConfirmation(onSent = vi.fn(), alreadySentAt: string | null = null) {
  render(
    <SendOrderConfirmationDialog
      quoteId={7}
      header="OF-2026-042"
      defaultEmail="kunde@example.ch"
      alreadySentAt={alreadySentAt}
      onClose={vi.fn()}
      onSent={onSent}
    />,
  )
  return onSent
}

describe('SendOrderConfirmationDialog', () => {
  it('sendet an den Auftragsbestätigungs-Endpoint', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({ status: 'ok', message: 'Auftragsbestätigung gesendet' })
    const onSent = renderOrderConfirmation()

    await user.click(screen.getByRole('button', { name: 'Auftragsbestätigung senden' }))

    await waitFor(() => expect(onSent).toHaveBeenCalledWith('Auftragsbestätigung gesendet'))
    const call = mockFetch.mock.calls.find(c => c[0] === '/pwa/admin/quotes/7/send-order-confirmation')!
    expect(JSON.parse((call[1] as RequestInit).body as string))
      .toEqual({ recipient_email: 'kunde@example.ch', resend: false })
  })

  it('zeigt den Backend-Fehler an und bleibt offen', async () => {
    const user = userEvent.setup()
    mockFetch.mockRejectedValue(new Error('Auftragsbestätigung wurde für diese Offerte bereits versendet.'))
    const onSent = renderOrderConfirmation()

    await user.click(screen.getByRole('button', { name: 'Auftragsbestätigung senden' }))

    expect(await screen.findByText('Auftragsbestätigung wurde für diese Offerte bereits versendet.')).toBeInTheDocument()
    expect(onSent).not.toHaveBeenCalled()
  })

  // Zweitversand: der Dialog ist die Stelle, an der aus "schon gesendet" ein bewusster
  // Vorgang wird. Ohne das resend-Flag im Body lehnt das Backend ab — deshalb ist das
  // Flag hier die eigentliche Zusicherung, nicht die Beschriftung.
  it('schickt beim Zweitversand das resend-Flag mit und benennt den Vorgang', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({ status: 'ok', message: 'Auftragsbestätigung gesendet' })
    const onSent = renderOrderConfirmation(vi.fn(), '2026-08-19T10:00:00Z')

    expect(screen.getByText(/Bereits gesendet am 19\.08\.2026/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Erneut senden' }))

    await waitFor(() => expect(onSent).toHaveBeenCalled())
    const call = mockFetch.mock.calls.find(c => c[0] === '/pwa/admin/quotes/7/send-order-confirmation')!
    expect(JSON.parse((call[1] as RequestInit).body as string))
      .toEqual({ recipient_email: 'kunde@example.ch', resend: true })
  })

  it('schickt beim Erstversand resend=false', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({ status: 'ok', message: 'gesendet' })
    renderOrderConfirmation()

    await user.click(screen.getByRole('button', { name: 'Auftragsbestätigung senden' }))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(c => c[0] === '/pwa/admin/quotes/7/send-order-confirmation')!
      expect(JSON.parse((call[1] as RequestInit).body as string).resend).toBe(false)
    })
  })
})

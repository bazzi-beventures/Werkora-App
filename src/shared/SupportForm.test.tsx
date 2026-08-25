import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SupportForm from './SupportForm'
import { ApiError } from '../api/client'

// Spec docs/specs/support-ticket.md §5

const sendSupportTicket = vi.fn()
vi.mock('../api/support', async () => {
  const actual = await vi.importActual<typeof import('../api/support')>('../api/support')
  return {
    ...actual,
    sendSupportTicket: (...args: unknown[]) => sendSupportTicket(...args),
  }
})

const jpeg = (name = 's.jpg', size = 1024) =>
  new File([new Uint8Array(size)], name, { type: 'image/jpeg' })

beforeEach(() => {
  sendSupportTicket.mockReset()
})

describe('SupportForm', () => {
  it('sendet nicht ohne Text', () => {
    render(<SupportForm route="dashboard" appContext="pwa" />)
    const btn = screen.getByRole('button', { name: /Meldung senden/ })
    expect(btn).toBeDisabled()
  })

  it('zeigt die Referenznummer als Quittung', async () => {
    sendSupportTicket.mockResolvedValue({
      ticket_no: 1042, reference: 'WS-1042',
      created_at: '2026-08-24T12:00:00Z', attachment_count: 0,
    })
    render(<SupportForm route="rapport" appContext="pwa" />)
    fireEvent.change(screen.getByLabelText('Was ist passiert?'), {
      target: { value: 'Rapport speichert nicht' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Meldung senden/ }))
    // Die UI-Quittung ist der VERLÄSSLICHE Weg — die Push kann ausfallen.
    await waitFor(() => expect(screen.getByText(/WS-1042/)).toBeTruthy())
  })

  it('reicht Screen und App-Kontext mit', async () => {
    sendSupportTicket.mockResolvedValue({
      ticket_no: 1, reference: 'WS-1', created_at: '', attachment_count: 0,
    })
    render(<SupportForm route="offerten" appContext="admin" />)
    fireEvent.change(screen.getByLabelText('Was ist passiert?'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /Meldung senden/ }))
    await waitFor(() => expect(sendSupportTicket).toHaveBeenCalled())
    expect(sendSupportTicket.mock.calls[0][2]).toEqual({ route: 'offerten', appContext: 'admin' })
  })

  it('übersetzt Server-Fehlercodes in Klartext', async () => {
    sendSupportTicket.mockRejectedValue(new ApiError(429, 'rate_limited'))
    render(<SupportForm route="dashboard" appContext="pwa" />)
    fireEvent.change(screen.getByLabelText('Was ist passiert?'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /Meldung senden/ }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/mehrere Meldungen/))
  })

  it('lehnt zu grosse Bilder vor dem Senden ab', () => {
    render(<SupportForm route="dashboard" appContext="pwa" />)
    const input = document.getElementById('support-files') as HTMLInputElement
    fireEvent.change(input, { target: { files: [jpeg('gross.jpg', 11 * 1024 * 1024)] } })
    expect(screen.getByRole('alert').textContent).toMatch(/zu gross/)
    expect(screen.queryByText('gross.jpg')).toBeNull()
  })

  it('deckelt die Anzahl Bilder', () => {
    render(<SupportForm route="dashboard" appContext="pwa" />)
    const input = document.getElementById('support-files') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg'), jpeg('d.jpg')] },
    })
    expect(screen.getByRole('alert').textContent).toMatch(/Maximal 3/)
    expect(screen.queryByText('d.jpg')).toBeNull()
  })

  it('lässt ein gewähltes Bild wieder entfernen', () => {
    render(<SupportForm route="dashboard" appContext="pwa" />)
    const input = document.getElementById('support-files') as HTMLInputElement
    fireEvent.change(input, { target: { files: [jpeg('a.jpg')] } })
    expect(screen.getByText('a.jpg')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'a.jpg entfernen' }))
    expect(screen.queryByText('a.jpg')).toBeNull()
  })

  // ── Strg+V ────────────────────────────────────────────────────────────────
  // Der übliche Weg zu einem Screenshot ist Win+Shift+S — der Ausschnitt liegt
  // dann NUR in der Zwischenablage. Ohne Einfügen müsste der Nutzer ihn erst
  // abspeichern, um ihn über den Dateidialog anhängen zu können.

  // Zwischenablage-Bilder sind unter Windows PNG. Der Dateiname, den der Code
  // vergibt, folgt dem MIME-Typ der Datei — nicht dem, was im Item steht.
  const png = (size = 1024) =>
    new File([new Uint8Array(size)], 'image.png', { type: 'image/png' })

  function pasteEvent(items: Array<{ kind: string; type: string; file?: File }>) {
    return {
      clipboardData: {
        items: items.map(i => ({ ...i, getAsFile: () => i.file ?? null })),
      },
    }
  }

  it('hängt ein Bild aus der Zwischenablage an', () => {
    render(<SupportForm route="dashboard" appContext="pwa" />)
    fireEvent.paste(
      screen.getByLabelText('Was ist passiert?'),
      pasteEvent([{ kind: 'file', type: 'image/png', file: png() }]),
    )
    // Eigener Name statt "image.png": Zwischenablage-Bilder heissen sonst alle gleich.
    expect(screen.getByText('Eingefügtes Bild 1.png')).toBeTruthy()
  })

  it('lässt eingefügten Text unangetastet', () => {
    // Nur Bilder werden abgefangen — normales Text-Einfügen muss weiter im Feld
    // landen, sonst nimmt der Handler dem Nutzer das gewohnte Strg+V weg.
    render(<SupportForm route="dashboard" appContext="pwa" />)
    const feld = screen.getByLabelText('Was ist passiert?')
    const evt = pasteEvent([{ kind: 'string', type: 'text/plain' }])
    fireEvent.paste(feld, evt)
    expect(screen.queryByText(/Eingefügtes Bild/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('zählt eingefügte Bilder gegen dieselbe Obergrenze', () => {
    render(<SupportForm route="dashboard" appContext="pwa" />)
    const feld = screen.getByLabelText('Was ist passiert?')
    for (let i = 0; i < 4; i++) {
      fireEvent.paste(feld, pasteEvent([{ kind: 'file', type: 'image/png', file: png() }]))
    }
    expect(screen.queryByText('Eingefügtes Bild 4.png')).toBeNull()
    expect(screen.getByRole('alert').textContent).toMatch(/Maximal 3/)
  })

  it('weist ein zu grosses eingefügtes Bild ab', () => {
    render(<SupportForm route="dashboard" appContext="pwa" />)
    fireEvent.paste(
      screen.getByLabelText('Was ist passiert?'),
      pasteEvent([{ kind: 'file', type: 'image/png', file: png(11 * 1024 * 1024) }]),
    )
    expect(screen.getByRole('alert').textContent).toMatch(/zu gross/)
    expect(screen.queryByText(/Eingefügtes Bild/)).toBeNull()
  })

  it('nennt vor dem Absenden, was mitgeschickt wird', () => {
    // Transparenzhinweis ist Teil der DSGVO-Antwort (Spec §9) — er darf nicht
    // stillschweigend verschwinden.
    render(<SupportForm route="dashboard" appContext="pwa" />)
    expect(screen.getByText(/an den Werkora-Support übermittelt/)).toBeTruthy()
  })
})

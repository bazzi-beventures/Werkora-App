import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SendQuoteDialog } from './SendQuoteDialog'
import { apiFetch } from '../../api/client'

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>()
  return { ...actual, apiFetch: vi.fn(), apiFormFetch: vi.fn() }
})

const mockFetch = vi.mocked(apiFetch)

// Versand-Dialog: Projekt-Fotos gehen nur mit, wenn sie angehakt wurden.
// Bewusst nichts vorausgewählt — Baustellenfotos können Mängel zeigen.

const INFO = {
  enabled: true,
  fotos_enabled: true,
  project_id: 'proj-1',
  projekt_anhaenge: [{ id: 'a1', filename: 'Prospekt.pdf' }],
  vorlagen: [],
  projekt_fotos: [
    { id: 'f1', filename: 'IMG_1.jpg', mime_type: 'image/jpeg' },
    { id: 'f2', filename: 'IMG_2.jpg', mime_type: 'image/jpeg' },
  ],
}

function mockInfo(over: Partial<typeof INFO> = {}) {
  mockFetch.mockImplementation((path: string) =>
    path.includes('send-attachments')
      ? Promise.resolve({ ...INFO, ...over })
      : Promise.resolve({ status: 'ok' }),
  )
}

function renderDialog() {
  return render(
    <SendQuoteDialog
      quoteId={7}
      header="Offerte OF-1"
      defaultEmail="kunde@example.ch"
      onClose={vi.fn()}
      onSent={vi.fn()}
    />,
  )
}

function sendBody() {
  const call = mockFetch.mock.calls.find(c => c[0] === '/pwa/admin/quotes/send')!
  return JSON.parse((call[1] as RequestInit).body as string)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SendQuoteDialog — Projekt-Fotos', () => {
  it('zeigt die Projekt-Fotos als Vorschau, keines vorausgewählt', async () => {
    mockInfo()
    const { container } = renderDialog()

    const tiles = await waitFor(() => {
      const t = container.querySelectorAll('.quote-foto-tile')
      expect(t).toHaveLength(2)
      return t
    })
    expect([...tiles].some(t => t.classList.contains('active'))).toBe(false)
    // Vorschaubild statt blossem Dateinamen.
    expect(tiles[0].querySelector('img')).toHaveAttribute('src', expect.stringContaining('/pwa/admin/project-files/f1/download'))
  })

  it('sendet nur die angehakten Fotos mit', async () => {
    const user = userEvent.setup()
    mockInfo()
    const { container } = renderDialog()
    await waitFor(() => expect(container.querySelectorAll('.quote-foto-tile')).toHaveLength(2))

    await user.click(screen.getByRole('button', { name: 'IMG_2.jpg' }))
    await user.click(screen.getByRole('button', { name: 'Offerte senden' }))

    await waitFor(() => expect(sendBody().foto_file_ids).toEqual(['f2']))
  })

  it('ohne Auswahl gehen keine Fotos raus', async () => {
    const user = userEvent.setup()
    mockInfo()
    const { container } = renderDialog()
    await waitFor(() => expect(container.querySelectorAll('.quote-foto-tile')).toHaveLength(2))

    await user.click(screen.getByRole('button', { name: 'Offerte senden' }))
    await waitFor(() => expect(sendBody().foto_file_ids).toEqual([]))
  })

  it('«Alle wählen» hakt alle an und wieder ab', async () => {
    const user = userEvent.setup()
    mockInfo()
    const { container } = renderDialog()
    await waitFor(() => expect(container.querySelectorAll('.quote-foto-tile')).toHaveLength(2))

    await user.click(screen.getByRole('button', { name: 'Alle wählen' }))
    expect(container.querySelectorAll('.quote-foto-tile.active')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Alle abwählen' }))
    expect(container.querySelectorAll('.quote-foto-tile.active')).toHaveLength(0)
  })

  it('Feature aus: keine Foto-Sektion, Anhänge bleiben', async () => {
    mockInfo({ fotos_enabled: false, projekt_fotos: [] })
    const { container } = renderDialog()

    expect(await screen.findByText('Prospekt.pdf')).toBeInTheDocument()
    expect(container.querySelector('.quote-foto-grid')).not.toBeInTheDocument()
  })

  it('Projekt-Anhänge bleiben wie bisher vorausgewählt', async () => {
    const user = userEvent.setup()
    mockInfo()
    renderDialog()
    await screen.findByText('Prospekt.pdf')

    await user.click(screen.getByRole('button', { name: 'Offerte senden' }))
    await waitFor(() => expect(sendBody().anhang_file_ids).toEqual(['a1']))
  })
})

// Mehrere Empfänger + CC: die Standard-Adresse bleibt das vorbelegte Pflichtfeld,
// über «+» kommen weitere Empfänger und CC-Adressen dazu. Ein Mail an alle — die
// Normalisierung (leer/doppelt) macht der Server, das Frontend schickt nur, was
// wirklich ausgefüllt ist.
describe('SendQuoteDialog — mehrere Empfänger und CC', () => {
  it('schickt ohne «+» nur die Standard-Adresse, Listen leer', async () => {
    const user = userEvent.setup()
    mockInfo()
    renderDialog()
    await screen.findByText('Prospekt.pdf')

    await user.click(screen.getByRole('button', { name: 'Offerte senden' }))
    await waitFor(() => {
      const body = sendBody()
      expect(body.recipient_email).toBe('kunde@example.ch')
      expect(body.additional_recipients).toEqual([])
      expect(body.cc_recipients).toEqual([])
    })
  })

  it('fügt über «+ Empfänger» und «+ CC» weitere Adressen hinzu', async () => {
    const user = userEvent.setup()
    mockInfo()
    renderDialog()
    await screen.findByText('Prospekt.pdf')

    await user.click(screen.getByRole('button', { name: '+ Empfänger' }))
    await user.type(screen.getByLabelText('Weiterer Empfänger 1'), 'architekt@example.ch')
    await user.click(screen.getByRole('button', { name: '+ CC' }))
    await user.type(screen.getByLabelText('CC 1'), 'verwaltung@example.ch')

    await user.click(screen.getByRole('button', { name: 'Offerte senden' }))
    await waitFor(() => {
      const body = sendBody()
      expect(body.recipient_email).toBe('kunde@example.ch')
      expect(body.additional_recipients).toEqual(['architekt@example.ch'])
      expect(body.cc_recipients).toEqual(['verwaltung@example.ch'])
    })
  })

  it('schickt leer gelassene Zeilen nicht mit', async () => {
    const user = userEvent.setup()
    mockInfo()
    renderDialog()
    await screen.findByText('Prospekt.pdf')

    await user.click(screen.getByRole('button', { name: '+ Empfänger' }))
    await user.click(screen.getByRole('button', { name: '+ Empfänger' }))
    await user.type(screen.getByLabelText('Weiterer Empfänger 2'), 'zweiter@example.ch')

    await user.click(screen.getByRole('button', { name: 'Offerte senden' }))
    await waitFor(() => expect(sendBody().additional_recipients).toEqual(['zweiter@example.ch']))
  })

  it('sagt beim CC-Feld, dass die Kopie nicht angenommen werden kann', async () => {
    // Der Unterschied zwischen «weiterer Empfänger» und «CC» ist im Dialog sonst
    // unsichtbar — und er entscheidet, wer die Offerte verbindlich annehmen kann.
    const user = userEvent.setup()
    mockInfo()
    renderDialog()
    await screen.findByText('Prospekt.pdf')

    expect(screen.queryByText(/ohne Annehmen\/Ablehnen/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ CC' }))
    expect(screen.getByText(/ohne Annehmen\/Ablehnen/)).toBeInTheDocument()
  })

  it('entfernt eine Zeile wieder', async () => {
    const user = userEvent.setup()
    mockInfo()
    renderDialog()
    await screen.findByText('Prospekt.pdf')

    await user.click(screen.getByRole('button', { name: '+ CC' }))
    await user.type(screen.getByLabelText('CC 1'), 'weg@example.ch')
    await user.click(screen.getByRole('button', { name: 'CC 1 entfernen' }))

    await user.click(screen.getByRole('button', { name: 'Offerte senden' }))
    await waitFor(() => expect(sendBody().cc_recipients).toEqual([]))
  })
})

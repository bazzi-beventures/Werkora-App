import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatScreen from './ChatScreen'
import { sendMessageStream, chooseStaff, ChatResponse } from '../api/chat'
import { UserInfo } from '../api/auth'
import { ApiError } from '../api/client'
import { chatFehlertext } from './chatFehlertext'
import { offenePersonenAuswahl } from './PersonenAuswahl'

// Personen-Auswahl bei mehrdeutigem Namen (docs/specs/rapport-bot-guardrails.md §4.2):
// «Peter» passt auf zwei Mitarbeiter — früher nahm der Server still den ersten.
// Jetzt: ein Knopf je Kandidat, die Antwort ist die staff_id.

vi.mock('./SignaturePad', () => ({ default: () => <div data-testid="signature-pad" /> }))

vi.mock('../api/chat', async () => {
  const actual = await vi.importActual<typeof import('../api/chat')>('../api/chat')
  return {
    ...actual,
    sendMessageStream: vi.fn(), chooseStaff: vi.fn(), chooseProject: vi.fn(),
    confirmReport: vi.fn(), cancelReport: vi.fn(), sendVoice: vi.fn(), uploadPhoto: vi.fn(),
    disambiguateMaterial: vi.fn(), downloadRapportPdf: vi.fn(), deleteOwnRapport: vi.fn(),
  }
})

const USER = {
  authorized_user_id: 'user-1', display_name: 'Anna Huber', role: 'user', tenant_id: 'tenant-1',
  enabled_modules: ['ai'], feature_flags: {},
} as unknown as UserInfo

const WAHL: ChatResponse = {
  reply: 'Wen meinst du mit «Peter»?',
  action_taken: 'staff_choice',
  staff_choice: [{ staff_id: 's-pm', name: 'Peter Muster' }, { staff_id: 's-pk', name: 'Peter Keller' }],
}

const CONFIRM: ChatResponse = {
  reply: 'Zusammenfassung … Bericht so speichern?',
  action_taken: 'confirm_pending',
  pending_summary: {
    project: 'Meier', date: '23.11.2026', staff: [{ name: 'Peter Keller', hours: 4 }], items: [],
    art_der_arbeit: ['reparatur'],
  },
}

function renderChat() {
  return render(
    <ChatScreen displayName="Anna Huber" user={USER} activeNav="rapport"
                initialMessage="Peter 4 Stunden bei Meier" initialProject="Meier" initialProjectId="p-1"
                onNavHome={() => {}} onNavArbeitszeit={() => {}} onNavProjekte={() => {}}
                onNavProfile={() => {}} onLoggedOut={() => {}} />,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.mocked(sendMessageStream).mockImplementation(async function* () {
    yield { type: 'result', result: WAHL }
  })
})

describe('ChatScreen — Personen-Auswahl', () => {
  it('bietet je Person einen Knopf und sperrt solange die Eingabe', async () => {
    renderChat()
    await screen.findByRole('button', { name: 'Peter Muster' })
    expect(screen.getByRole('button', { name: 'Peter Keller' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Nachricht schreiben/)).toBeDisabled()
  })

  it('antwortet mit der staff_id der angetippten Person', async () => {
    const user = userEvent.setup()
    vi.mocked(chooseStaff).mockResolvedValue(CONFIRM)
    renderChat()

    await user.click(await screen.findByRole('button', { name: 'Peter Keller' }))

    expect(chooseStaff).toHaveBeenCalledWith('s-pk')
    await screen.findByRole('button', { name: 'Speichern' })
    expect(screen.queryByTestId('personen-auswahl')).not.toBeInTheDocument()
  })
})

describe('offenePersonenAuswahl', () => {
  it('ist nur offen, solange die Rückfrage die letzte Nachricht ist', () => {
    const frage = { role: 'bot' as const, action_taken: 'staff_choice', staff_choice: WAHL.staff_choice }
    expect(offenePersonenAuswahl([frage])).toHaveLength(2)
    expect(offenePersonenAuswahl([frage, { role: 'user' as const }])).toBeNull()
    expect(offenePersonenAuswahl([])).toBeNull()
  })
})

describe('chatFehlertext', () => {
  it('nennt die Limits je Konto statt «Fehler beim Senden»', () => {
    expect(chatFehlertext(new ApiError(429, 'rate_limited'), 'x')).toMatch(/kurzer Zeit/)
    expect(chatFehlertext(new ApiError(429, 'rate_limited_day'), 'x')).toMatch(/Formular/)
    expect(chatFehlertext(new ApiError(500, 'boom'), 'Fehler')).toBe('Fehler')
  })
})

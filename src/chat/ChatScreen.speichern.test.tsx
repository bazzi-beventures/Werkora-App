import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatScreen from './ChatScreen'
import { confirmReport, sendMessageStream, ChatResponse } from '../api/chat'
import { loadDraft } from './rapportDraft'
import { planRapportStart } from './rapportStart'
import { UserInfo } from '../api/auth'

// Regression: der erfasste Rapport stand im Bestätigungsschritt, «Speichern» ging
// schief (Timeout / Funkloch / Server kannte ihn nach einem Deploy nicht mehr) —
// und der Monteur blieb mit einer Fehlermeldung UND ohne «Speichern»-Knopf zurück.
// Der Einsatz liess sich nicht abschliessen, und der tote Entwurf warnte danach in
// jedem anderen Projekt vor einem «nicht gespeicherten Rapport».
//
// Serverseitig leert confirm_report den Puffer jetzt erst NACH erfolgreichem
// Speichern (services/pwa_chat_service.py) und meldet den Fall maschinenlesbar:
//   save_failed        → Rapport liegt noch, zweiter Versuch möglich
//   no_pending_report  → Rapport ist wirklich weg, Entwurf hier aufräumen

vi.mock('../api/chat', async () => {
  const actual = await vi.importActual<typeof import('../api/chat')>('../api/chat')
  return {
    ...actual,
    sendMessageStream: vi.fn(),
    confirmReport: vi.fn(),
    cancelReport: vi.fn(),
    sendVoice: vi.fn(),
    uploadPhoto: vi.fn(),
    disambiguateMaterial: vi.fn(),
    downloadRapportPdf: vi.fn(),
    deleteOwnRapport: vi.fn(),
  }
})

const USER: UserInfo = {
  authorized_user_id: 'user-1',
  display_name: 'Kevin De Florian',
  role: 'user',
  tenant_id: 'tenant-1',
  enabled_modules: ['ai'],
  feature_flags: {},           // keine Klein-/Ersatzteil-Zwischenschritte
} as unknown as UserInfo

const SUMMARY: ChatResponse = {
  reply: 'Rapport für Werro Winterthur, 3.5 h. So speichern?',
  action_taken: 'confirm_pending',
  pending_summary: {
    project: 'Werro Winterthur',
    date: '18.08.2026',
    staff: [{ name: 'Kevin De Florian', hours: 3.5 }],
    items: [],
    art_der_arbeit: ['montage'],   // vorbelegt → kein Leistungsart-Zwischenschritt
  },
}

function renderChat() {
  return render(
    <ChatScreen
      displayName="Kevin De Florian"
      user={USER}
      activeNav="rapport"
      initialMessage={'Neuer Rapport für Projekt "Werro Winterthur"'}
      initialProject="Werro Winterthur"
      onNavHome={() => {}}
      onNavArbeitszeit={() => {}}
      onNavProjekte={() => {}}
      onNavProfile={() => {}}
      onLoggedOut={() => {}}
    />
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(sendMessageStream).mockImplementation(async function* () {
    yield { type: 'result', result: SUMMARY }
  })
})

describe('ChatScreen — Speichern schlägt fehl', () => {
  it('bringt den «Speichern»-Knopf zurück, wenn der Server den Rapport behalten hat', async () => {
    vi.mocked(confirmReport).mockResolvedValue({
      reply: 'Fehler beim Speichern. Bitte erneut versuchen — dein Rapport ist noch da.',
      action_taken: 'save_failed',
    })
    const user = userEvent.setup()
    renderChat()

    const speichern = await screen.findByRole('button', { name: 'Speichern' })
    await user.click(speichern)

    // Zweiter Versuch muss möglich sein — der Rapport liegt serverseitig noch.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument())
    expect(await screen.findByText(/dein Rapport ist noch da/)).toBeInTheDocument()
  })

  it('bietet nach einem Netzwerkfehler ebenfalls einen zweiten Versuch an', async () => {
    vi.mocked(confirmReport).mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    renderChat()

    await user.click(await screen.findByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument())
  })

  it('räumt den toten Entwurf auf, wenn der Server den Rapport nicht mehr kennt', async () => {
    vi.mocked(confirmReport).mockResolvedValue({
      reply: 'Kein ausstehender Bericht gefunden (abgelaufen?). Bitte erneut erstellen.',
      action_taken: 'no_pending_report',
    })
    const user = userEvent.setup()
    renderChat()

    await user.click(await screen.findByRole('button', { name: 'Speichern' }))

    // Kein zweiter Versuch (es gibt nichts mehr zu speichern) …
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument()
    )
    // … und der Entwurf warnt in keinem anderen Projekt mehr vor einem Rapport,
    // den niemand mehr speichern kann.
    await waitFor(() => {
      const draft = loadDraft('user-1', Date.now())
      expect(planRapportStart(draft, 'Garcia Winterthur')).toEqual({ kind: 'start' })
    })
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChatScreen from './ChatScreen'
import { sendMessageStream, ChatResponse } from '../api/chat'
import { UserInfo } from '../api/auth'

// Reload und Tab-schliessen: solange ein Rapport offen ist, fragt der Browser nach.
// Der Hauptweg (Nav-Kacheln, Zurück-Pfeil, Android-Zurück) läuft über App.tsx und
// confirmLeaveRapport — der ist in rapportStart.test.ts abgedeckt. Hier geht es nur
// darum, dass der ChatScreen den beforeunload-Haken zustandsabhängig setzt.

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
  feature_flags: {},
} as unknown as UserInfo

const SUMMARY: ChatResponse = {
  reply: 'Rapport für Werro Winterthur, 3.5 h. So speichern?',
  action_taken: 'confirm_pending',
  pending_summary: {
    project: 'Werro Winterthur',
    date: '18.08.2026',
    staff: [{ name: 'Kevin De Florian', hours: 3.5 }],
    items: [],
    art_der_arbeit: ['montage'],
  },
}

function renderChat(initialMessage: string | null) {
  render(
    <ChatScreen
      displayName="Kevin De Florian"
      user={USER}
      activeNav="rapport"
      initialMessage={initialMessage}
      initialProject={initialMessage ? 'Werro Winterthur' : null}
      onNavHome={() => {}}
      onNavArbeitszeit={() => {}}
      onNavProjekte={() => {}}
      onNavProfile={() => {}}
      onLoggedOut={() => {}}
    />
  )
}

/** Feuert beforeunload und meldet, ob jemand widersprochen hat. */
function fireBeforeUnload(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(sendMessageStream).mockImplementation(async function* () {
    yield { type: 'result', result: SUMMARY }
  })
})

describe('ChatScreen — Verlassen ohne Speichern', () => {
  it('hält den Reload an, solange der Rapport auf «Speichern» wartet', async () => {
    renderChat('Neuer Rapport für Projekt "Werro Winterthur"')
    await screen.findByRole('button', { name: 'Speichern' })

    expect(fireBeforeUnload()).toBe(true)
  })

  it('lässt den Reload durch, wenn nichts erfasst ist', () => {
    renderChat(null)

    expect(fireBeforeUnload()).toBe(false)
  })
})

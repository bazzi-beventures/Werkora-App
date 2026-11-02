import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatScreen from './ChatScreen'
import { confirmReport, sendMessageStream, ChatResponse } from '../api/chat'
import { UserInfo } from '../api/auth'

// Garantiefall im Rapport-Chat (WW-33): der Server belegt aus dem Projekt vor
// (`pending_summary.is_warranty`), die Übersicht zeigt es, «Ändern» führt in den
// Schritt «Was wurde gemacht?», und beim Speichern geht der Schalter mit.

vi.mock('./SignaturePad', () => ({ default: () => <div data-testid="signature-pad" /> }))

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

const USER = {
  authorized_user_id: 'user-1', display_name: 'Kevin De Florian', role: 'user',
  tenant_id: 'tenant-1', enabled_modules: ['ai'], feature_flags: {},
} as unknown as UserInfo

function summary(isWarranty: boolean | undefined): ChatResponse {
  return {
    reply: 'Rapport für Werro Winterthur, 2 h. So speichern?',
    action_taken: 'confirm_pending',
    pending_summary: {
      project: 'Werro Winterthur', date: '02.11.2026',
      staff: [{ name: 'Kevin De Florian', hours: 2 }], items: [],
      art_der_arbeit: ['Reparatur'],   // vorbelegt → kein Zwischenschritt
      ...(isWarranty === undefined ? {} : { is_warranty: isWarranty }),
    },
  }
}

function renderChat(isWarranty: boolean | undefined) {
  vi.mocked(sendMessageStream).mockImplementation(async function* () {
    yield { type: 'result', result: summary(isWarranty) }
  })
  vi.mocked(confirmReport).mockResolvedValue({ reply: 'Gespeichert.', action_taken: 'report_saved', report_id: 9 })
  return render(
    <ChatScreen displayName="Kevin De Florian" user={USER} activeNav="rapport"
      initialMessage={'Neuer Rapport für Projekt "Werro Winterthur"'}
      initialProject="Werro Winterthur"
      onNavHome={() => {}} onNavArbeitszeit={() => {}} onNavProjekte={() => {}}
      onNavProfile={() => {}} onLoggedOut={() => {}} />,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('ChatScreen — Garantiefall', () => {
  it('zeigt die Vorbelegung in der Übersicht und speichert sie mit', async () => {
    const user = userEvent.setup()
    renderChat(true)

    await screen.findByRole('button', { name: 'Speichern' })
    expect(screen.getByText(/Garantiefall/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(confirmReport).toHaveBeenCalled())
    expect(vi.mocked(confirmReport).mock.calls[0][0]).toMatchObject({ is_warranty: true })
  })

  it('über «Ändern» abgewählt geht false mit', async () => {
    const user = userEvent.setup()
    renderChat(true)

    await screen.findByRole('button', { name: 'Speichern' })
    await user.click(screen.getByRole('button', { name: 'Ändern' }))
    await user.click(screen.getByRole('button', { name: /Garantiefall/ }))
    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(screen.queryByText(/· Garantiefall/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(confirmReport).toHaveBeenCalled())
    expect(vi.mocked(confirmReport).mock.calls[0][0]).toMatchObject({ is_warranty: false })
  })

  it('Alt-Server ohne Feld: nichts gesagt, der Server entscheidet', async () => {
    const user = userEvent.setup()
    renderChat(undefined)

    await user.click(await screen.findByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(confirmReport).toHaveBeenCalled())
    expect(vi.mocked(confirmReport).mock.calls[0][0]?.is_warranty).toBeUndefined()
  })
})

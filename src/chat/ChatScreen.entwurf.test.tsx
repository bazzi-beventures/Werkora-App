import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatScreen from './ChatScreen'
import { saveDraft } from './rapportDraft'
import * as rapportDraft from './rapportDraft'
import { sendMessageStream } from '../api/chat'
import { UserInfo } from '../api/auth'

// Sicherungsnetz für den Umbau der Entwurfs-Wiederherstellung (§2 Folgethemen,
// ChatScreen). Der Lazy-Init des Entwurfs lief bisher als Ref-Zuweisung im
// Render-Rumpf — der React Compiler meldet das zu Recht. Vor dem Umbau auf einen
// useState-Initializer pinnen diese Tests, was dabei erhalten bleiben MUSS:
//
//   1. Ein gespeicherter Entwurf wird beim Mounten wiederhergestellt.
//   2. Er wird GENAU EINMAL geladen, nicht bei jedem Render neu — sonst würde
//      ein Re-Render getippten Text wieder mit dem Stand von der Platte
//      überschreiben.
//   3. Der ID-Zähler wird über die wiederhergestellten IDs gehoben. Sonst
//      bekommt die nächste Nachricht eine ID, die es schon gibt, und React
//      rendert bei doppelten Keys falsch.
//   4. Ohne Entwurf steht die Begrüssung da.

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

/** Entwurf mit zwei Nachrichten, deren IDs bewusst hoch liegen. */
function entwurfAblegen(ids: number[] = [41, 42]) {
  saveDraft('user-1', {
    messages: ids.map((id, i) => ({
      id,
      role: i % 2 === 0 ? 'user' : 'bot',
      text: `Wiederhergestellte Nachricht ${id}`,
      timestamp: '08:00',
    })),
    pendingConfirm: false,
    pendingDisambiguation: false,
    pendingQuoteQuestion: false,
    pendingSignReportId: null,
    pendingProject: 'Werro Winterthur',
    downloadReportId: null,
    reportSigned: false,
    workTypesCollected: false,
    collectedWorkTypes: [],
    suggestedWorkTypes: [],
    kleinCollected: false,
    ersatzCollected: false,
    collectedKlein: null,
    collectedErsatz: [],
    summaryItems: [],
  } as never, Date.now())
}

function renderChat() {
  return render(
    <ChatScreen
      displayName="Kevin De Florian"
      user={USER}
      activeNav="rapport"
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
  vi.restoreAllMocks()
  vi.mocked(sendMessageStream).mockImplementation(async function* () {
    yield { type: 'result', result: { reply: 'Antwort vom Bot', action_taken: 'none' } }
  })
})

afterEach(() => {
  localStorage.clear()
})

describe('ChatScreen — Entwurfs-Wiederherstellung', () => {
  it('stellt einen gespeicherten Entwurf beim Mounten wieder her', async () => {
    entwurfAblegen()
    renderChat()

    expect(await screen.findByText('Wiederhergestellte Nachricht 41')).toBeInTheDocument()
    expect(screen.getByText('Wiederhergestellte Nachricht 42')).toBeInTheDocument()
    // Die Begrüssung darf den Entwurf nicht verdrängen.
    expect(screen.queryByText(/Sage z\.B\./)).not.toBeInTheDocument()
  })

  it('zeigt ohne Entwurf die Begrüssung', async () => {
    renderChat()

    expect(await screen.findByText(/Sage z\.B\./)).toBeInTheDocument()
  })

  it('lädt den Entwurf genau einmal, nicht bei jedem Render', async () => {
    // Würde bei jedem Render neu geladen, überschriebe der Stand von der Platte
    // laufend, was der Monteur gerade tippt.
    entwurfAblegen()
    const spy = vi.spyOn(rapportDraft, 'loadDraft')
    const user = userEvent.setup()
    renderChat()
    await screen.findByText('Wiederhergestellte Nachricht 41')

    const nachMount = spy.mock.calls.length
    // Der Spy muss den Mount-Aufruf ueberhaupt gesehen haben — sonst waere der
    // Vergleich unten 0 === 0 und der Test bewiese nichts.
    expect(nachMount).toBeGreaterThan(0)

    // Mehrere Re-Render durch Tippen erzwingen.
    const feld = screen.getByRole('textbox')
    await user.type(feld, 'noch etwas Text')

    expect(spy.mock.calls.length).toBe(nachMount)
  })

  it('hebt den ID-Zähler über die wiederhergestellten IDs', async () => {
    // Ohne das Anheben bekaeme die naechste Nachricht eine bereits vergebene ID,
    // und React rendert bei doppelten Keys falsch.
    //
    // Das Modul wird hier BEWUSST frisch geladen: `_idCounter` lebt auf
    // Modulebene und steht nach den Tests oben schon bei 3-4. Mit dem
    // Standard-Import koennten niedrige Entwurfs-IDs gar nicht kollidieren und
    // der Test waere gruen, egal was der Code tut.
    vi.resetModules()
    const { default: FrischerChatScreen } = await import('./ChatScreen')
    entwurfAblegen([1, 2])

    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    render(
      <FrischerChatScreen
        displayName="Kevin De Florian"
        user={USER}
        activeNav="rapport"
        onNavHome={() => {}}
        onNavArbeitszeit={() => {}}
        onNavProjekte={() => {}}
        onNavProfile={() => {}}
        onLoggedOut={() => {}}
      />
    )
    await screen.findByText('Wiederhergestellte Nachricht 1')

    await user.type(screen.getByRole('textbox'), 'Neue Nachricht{Enter}')
    await waitFor(() => expect(screen.getByText('Neue Nachricht')).toBeInTheDocument())

    const keyWarnungen = fehler.mock.calls
      .map(args => args.map(String).join(' '))
      .filter(m => /same key|unique "key"|duplicate key/i.test(m))
    expect(keyWarnungen).toEqual([])
  })
})

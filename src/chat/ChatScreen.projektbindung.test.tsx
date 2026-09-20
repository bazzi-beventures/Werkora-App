import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatScreen from './ChatScreen'
import { sendMessageStream, ChatResponse } from '../api/chat'
import { draftKey } from './rapportDraft'
import { UserInfo } from '../api/auth'

// Der laufende Rapport nennt sein Projekt bei JEDEM Turn.
//
// Gemeldet am 18.09.26 aus der Mitarbeiter-App: «ich wollte gerade einen Rapport
// ausfüllen und irgendwie hat er mich wieder ganz woanders hingebracht, zu ganz
// anderen Projekten». Der Rapport landete auf einem fremden Auftrag und wurde vom
// Monteur gleich wieder gelöscht.
//
// Ursache damals: die Bindung lag im Prozess-Speicher und war nach jedem Deploy
// weg. Das ist seit 20260913 behoben — sie liegt in `pwa_chat_state`. Offen blieb
// der Fall, den `ChatState.load` bewusst offen behandelt: ist die Ablage nicht
// erreichbar, gilt der Zustand als leer. Der Riegel `stick_to_active_project`
// beginnt mit `if not active: return chosen` und wirkt dann nicht mehr — der Bot
// hört das Projekt wieder aus der einen letzten Nachricht heraus, und «8 Stunden
// für Peter» legt den Rapport auf «Storen Peter, Chur».
//
// Der Client schickte das Projekt bisher nur mit der STARTnachricht. Jetzt geht es
// bei jedem Folge-Turn mit (`resume_*`). Der Server setzt es nur ein, wenn er selbst
// keine Bindung hat — ein im Gespräch vollzogener Wechsel gewinnt weiterhin
// (Server-Seite: tests/unit/test_chat_projekt_bindung.py).

vi.mock('./SignaturePad', () => ({
  default: () => <div data-testid="signature-pad" />,
}))

vi.mock('../api/chat', async () => {
  const actual = await vi.importActual<typeof import('../api/chat')>('../api/chat')
  return {
    ...actual,
    sendMessageStream: vi.fn(),
    chooseProject: vi.fn(),
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
  authorized_user_id: 'user-1',
  display_name: 'Hans Muster',
  role: 'user',
  tenant_id: 'tenant-1',
  enabled_modules: ['ai'],
  feature_flags: {},
} as unknown as UserInfo

const ANTWORT: ChatResponse = { reply: 'Alles klar.', action_taken: null }

/** Der Entwurf eines laufenden Rapports, wie er im localStorage liegt. */
function entwurfMit(pendingProject: string, pendingProjectId: string | null) {
  localStorage.setItem(draftKey('user-1'), JSON.stringify({
    messages: [
      { id: 1, role: 'bot', text: 'Hallo', timestamp: '08:00' },
      { id: 2, role: 'user', text: 'Neuer Rapport', timestamp: '08:01' },
    ],
    kleinCollected: false, ersatzCollected: false, collectedKlein: null,
    collectedErsatz: [], summaryItems: [], pendingConfirm: false,
    pendingDisambiguation: false, pendingQuoteQuestion: false,
    pendingSignReportId: null, downloadReportId: null,
    pendingProject, pendingProjectId,
    savedAt: Date.now(),
  }))
}

function renderChat(props: Partial<{ initialMessage: string; initialProject: string; initialProjectId: string }> = {}) {
  return render(
    <ChatScreen
      displayName="Hans Muster"
      user={USER}
      activeNav="rapport"
      onNavHome={() => {}}
      onNavArbeitszeit={() => {}}
      onNavProjekte={() => {}}
      onNavProfile={() => {}}
      onLoggedOut={() => {}}
      {...props}
    />
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.mocked(sendMessageStream).mockImplementation(async function* () {
    yield { type: 'result', result: ANTWORT }
  })
})

describe('ChatScreen — Projekt bei jedem Turn', () => {
  it('schickt die Bindung aus dem Entwurf mit, wenn der Monteur nur noch Stunden nachreicht', async () => {
    const user = userEvent.setup()
    entwurfMit('Sanierung Storen Müller', 'p1')
    renderChat()

    await user.type(screen.getByRole('textbox'), '8 Stunden für Peter{Enter}')

    expect(sendMessageStream).toHaveBeenCalledWith(
      '8 Stunden für Peter', undefined, undefined,
      { project: 'Sanierung Storen Müller', projectId: 'p1' },
    )
  })

  it('lässt die Startnachricht ungebunden durchgehen — dort gilt das Startprojekt', async () => {
    entwurfMit('Sanierung Storen Müller', 'p1')
    renderChat({
      initialMessage: 'Neuer Rapport für Projekt "Storen Peter, Chur"',
      initialProject: 'Storen Peter, Chur',
      initialProjectId: 'p2',
    })

    await screen.findByText('Alles klar.')
    expect(sendMessageStream).toHaveBeenCalledWith(
      'Neuer Rapport für Projekt "Storen Peter, Chur"', 'Storen Peter, Chur', 'p2', undefined,
    )
  })

  it('hält die id im Entwurf, wenn der Monteur im Gespräch das Projekt wechselt', async () => {
    const user = userEvent.setup()
    entwurfMit('Sanierung Storen Müller', 'p1')
    vi.mocked(sendMessageStream).mockImplementation(async function* () {
      yield {
        type: 'result',
        result: {
          reply: 'Bericht so speichern?',
          action_taken: 'confirm_pending',
          pending_summary: {
            project: 'Storen Peter, Chur',
            project_id: 'p2',
            date: '18.09.2026',
            staff: [{ name: 'Hans Muster', hours: 8 }],
            items: [],
          },
        } as ChatResponse,
      }
    })
    renderChat()

    await user.type(screen.getByRole('textbox'), 'Nein, das war Storen Peter, Chur{Enter}')
    await screen.findByText(/Bericht so speichern/)

    const draft = JSON.parse(localStorage.getItem(draftKey('user-1'))!)
    expect(draft.pendingProject).toBe('Storen Peter, Chur')
    // Ohne das trüge der Entwurf den neuen Namen und die ALTE id — und die
    // Wiederaufnahme zöge den Rapport sonst zurück auf «Müller».
    expect(draft.pendingProjectId).toBe('p2')
  })

  it('schickt ohne id den Namen mit — Entwürfe aus der Vorversion', async () => {
    const user = userEvent.setup()
    entwurfMit('Sanierung Storen Müller', null)
    renderChat()

    await user.type(screen.getByRole('textbox'), '8 Stunden{Enter}')

    expect(sendMessageStream).toHaveBeenCalledWith(
      '8 Stunden', undefined, undefined,
      { project: 'Sanierung Storen Müller', projectId: null },
    )
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatScreen from './ChatScreen'
import { confirmReport, sendMessageStream, ChatResponse } from '../api/chat'
import { UserInfo } from '../api/auth'

// Teilrapport im Chat (docs/specs/teilrapport.md §6.1 / §3.10).
//
// Der Monteur erfasst jeden Tag einen Teilrapport — gleicher Weg, gleiche Positionen,
// nur ohne Unterschriftsschritt. Drei Dinge müssen stimmen:
//
// 1. Ohne Feature ist alles wie bisher: kein Abschluss-Schalter, «Speichern».
// 2. Die Vorauswahl kommt vom Server (`preselect_partial`): hat das Projekt schon
//    einen freien Teilrapport, ist «Teilrapport» angehakt — sonst «Unterschrift jetzt».
// 3. Wurde als Teilrapport gespeichert, erscheint KEIN Unterschriftspad, sondern der
//    Hinweis samt PDF-Knopf. Massgeblich ist dabei die Server-Antwort, nicht die
//    Auswahl im Client — sonst zeigte die PWA einen Zustand, den der Server nicht hat.

// SignaturePad als Stub: das echte Pad greift in einem rAF-Callback auf den
// 2D-Kontext des Canvas zu, den jsdom nicht liefert — das wäre eine unbehandelte
// Ausnahme neben den Zusicherungen, ohne dass hier das Zeichnen geprüft würde.
// Was hier zählt, ist ob es überhaupt dasteht.
vi.mock('./SignaturePad', () => ({
  default: ({ reportId }: { reportId: number }) => (
    <div data-testid="signature-pad">Unterschrift für Rapport {reportId}</div>
  ),
}))

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

function makeUser(teilrapport: boolean): UserInfo {
  return {
    authorized_user_id: 'user-1',
    display_name: 'Kevin De Florian',
    role: 'user',
    tenant_id: 'tenant-1',
    enabled_modules: ['ai'],
    feature_flags: teilrapport ? { teilrapport: { enabled: true } } : {},
  } as unknown as UserInfo
}

function summary(preselectPartial: boolean): ChatResponse {
  return {
    reply: 'Rapport für Werro Winterthur, 3.5 h. So speichern?',
    action_taken: 'confirm_pending',
    pending_summary: {
      project: 'Werro Winterthur',
      date: '18.08.2026',
      staff: [{ name: 'Kevin De Florian', hours: 3.5 }],
      items: [],
      art_der_arbeit: ['montage'],   // vorbelegt → kein Leistungsart-Zwischenschritt
      preselect_partial: preselectPartial,
    },
  }
}

function renderChat(user: UserInfo) {
  return render(
    <ChatScreen
      displayName="Kevin De Florian"
      user={user}
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

function mockSummary(preselectPartial = false) {
  vi.mocked(sendMessageStream).mockImplementation(async function* () {
    yield { type: 'result', result: summary(preselectPartial) }
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('ChatScreen — Abschluss-Wahl', () => {
  it('zeigt ohne Feature keinen Abschluss-Schalter', async () => {
    mockSummary()
    renderChat(makeUser(false))

    await screen.findByRole('button', { name: 'Speichern' })
    expect(screen.queryByRole('button', { name: 'Teilrapport' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unterschrift jetzt' })).not.toBeInTheDocument()
  })

  it('wählt ohne offenen Teilrapport «Unterschrift jetzt» vor', async () => {
    mockSummary(false)
    renderChat(makeUser(true))

    const jetzt = await screen.findByRole('button', { name: 'Unterschrift jetzt' })
    expect(jetzt).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Teilrapport' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument()
  })

  it('wählt «Teilrapport» vor, wenn das Projekt schon einen offenen hat', async () => {
    mockSummary(true)
    renderChat(makeUser(true))

    const teil = await screen.findByRole('button', { name: 'Teilrapport' })
    expect(teil).toHaveAttribute('aria-pressed', 'true')
    // Der Speichern-Knopf sagt, was passiert — «Speichern» allein liesse offen,
    // ob gleich das Unterschriftspad kommt.
    expect(screen.getByRole('button', { name: 'Teilrapport speichern' })).toBeInTheDocument()
  })

  it('schickt is_partial nur, wenn Teilrapport gewählt ist', async () => {
    mockSummary(false)
    vi.mocked(confirmReport).mockResolvedValue({
      reply: 'Bericht gespeichert! (ID: 7)', action_taken: 'report_saved', report_id: 7,
    })
    const user = userEvent.setup()
    renderChat(makeUser(true))

    await user.click(await screen.findByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(confirmReport).toHaveBeenCalled())
    expect(vi.mocked(confirmReport).mock.calls[0][0]).toMatchObject({ is_partial: false })
  })

  it('schickt is_partial, wenn der Monteur auf Teilrapport umschaltet', async () => {
    mockSummary(false)
    vi.mocked(confirmReport).mockResolvedValue({
      reply: 'Teilrapport gespeichert! (ID: 7)',
      action_taken: 'report_saved', report_id: 7, is_partial: true,
    })
    const user = userEvent.setup()
    renderChat(makeUser(true))

    await user.click(await screen.findByRole('button', { name: 'Teilrapport' }))
    await user.click(screen.getByRole('button', { name: 'Teilrapport speichern' }))

    await waitFor(() => expect(confirmReport).toHaveBeenCalled())
    expect(vi.mocked(confirmReport).mock.calls[0][0]).toMatchObject({ is_partial: true })
  })
})

describe('ChatScreen — nach dem Speichern eines Teilrapports', () => {
  it('zeigt statt des Unterschriftspads den Hinweis auf den Gesamtrapport', async () => {
    mockSummary(true)
    vi.mocked(confirmReport).mockResolvedValue({
      reply: 'Teilrapport gespeichert! (ID: 7)',
      action_taken: 'report_saved', report_id: 7, is_partial: true,
    })
    const user = userEvent.setup()
    renderChat(makeUser(true))

    await user.click(await screen.findByRole('button', { name: 'Teilrapport speichern' }))

    expect(await screen.findByText(/die Unterschrift holst du am Schluss/)).toBeInTheDocument()
    // Kein Unterschriftspad — der Teilrapport wird nicht einzeln unterschrieben.
    expect(screen.queryByTestId('signature-pad')).not.toBeInTheDocument()
    // Das PDF gibt es trotzdem: der Monteur soll den Tag belegen können.
    expect(await screen.findByRole('button', { name: /PDF/ })).toBeInTheDocument()
  })

  it('zeigt das Unterschriftspad, wenn der Server den Rapport NICHT als Teilrapport gespeichert hat', async () => {
    // Der Client hatte Teilrapport gewählt, der Server hat das Flag verworfen
    // (Feature beim Mandanten aus). Massgeblich ist die Antwort.
    mockSummary(true)
    vi.mocked(confirmReport).mockResolvedValue({
      reply: 'Bericht gespeichert! (ID: 7)',
      action_taken: 'report_saved', report_id: 7, is_partial: false,
    })
    const user = userEvent.setup()
    renderChat(makeUser(true))

    await user.click(await screen.findByRole('button', { name: 'Teilrapport speichern' }))

    expect(await screen.findByTestId('signature-pad')).toBeInTheDocument()
    expect(screen.queryByText(/die Unterschrift holst du am Schluss/)).not.toBeInTheDocument()
  })
})

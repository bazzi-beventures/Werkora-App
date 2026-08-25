import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatScreen, { projectChoiceLabel } from './ChatScreen'
import { sendMessageStream, chooseProject, ChatResponse } from '../api/chat'
import { UserInfo } from '../api/auth'

// Projekt-Auswahl bei gleichnamigen Projekten.
//
// Gemeldeter Fehler: Zwei Liegenschaften desselben Kunden heissen «Müller Seuzach».
// Der Bot fragte per Freitext nach der Projektnummer, der Monteur antwortete mit der
// Adresse («Holderweg 4») — und das Sprachmodell reimte sich daraus die falsche
// Nummer zusammen und rapportierte auf die andere Liegenschaft.
//
// Deshalb: ein Knopf je Kandidat, Antwort ist die Projekt-id. Zwischen Frage und
// Antwort steht kein Modell mehr. Solange die Auswahl offen ist, ist die Eingabe
// gesperrt — sonst redete der Monteur am Picker vorbei und alles wäre wie vorher.

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
  display_name: 'Sahin Yalcin',
  role: 'user',
  tenant_id: 'tenant-1',
  enabled_modules: ['ai'],
  feature_flags: {},
} as unknown as UserInfo

const CHOICE: ChatResponse = {
  reply: "Es gibt mehrere Projekte mit dem Namen 'Müller Seuzach'. Welches meinst du?",
  action_taken: 'project_choice',
  project_choice: [
    {
      project_id: 'p-holderweg', name: 'Müller Seuzach', project_number: '2600042',
      object_name: 'Müller', object_address: 'Holderweg 4, 8472 Seuzach',
    },
    {
      project_id: 'p-breitestrasse', name: 'Müller Seuzach', project_number: '2600492',
      object_name: 'Müller', object_address: 'Breitestrasse 29, 8472 Seuzach',
    },
  ],
}

const CONFIRM: ChatResponse = {
  reply: 'Rapport für Müller Seuzach, 0.75 h. So speichern?',
  action_taken: 'confirm_pending',
  pending_summary: {
    project: 'Müller Seuzach',
    date: '24.08.2026',
    staff: [{ name: 'Sahin Yalcin', hours: 0.75 }],
    items: [],
    art_der_arbeit: ['reparatur'],
  },
}

function renderChat() {
  return render(
    <ChatScreen
      displayName="Sahin Yalcin"
      user={USER}
      activeNav="rapport"
      initialMessage={'Neuer Rapport für Projekt "Müller Seuzach"'}
      initialProject="Müller Seuzach"
      initialProjectId="p-holderweg"
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
  vi.clearAllMocks()
  vi.mocked(sendMessageStream).mockImplementation(async function* () {
    yield { type: 'result', result: CHOICE }
  })
})

describe('projectChoiceLabel', () => {
  it('nennt Nummer UND Adresse — daran unterscheidet der Monteur die Liegenschaften', () => {
    expect(projectChoiceLabel(CHOICE.project_choice![0])).toBe(
      '2600042 — Müller, Holderweg 4, 8472 Seuzach'
    )
  })

  it('kommt ohne Objekt/Adresse aus', () => {
    expect(projectChoiceLabel({
      project_id: 'p', name: 'X', project_number: '2600001',
    })).toBe('2600001')
  })
})

describe('ChatScreen — Projekt-Auswahl', () => {
  it('schickt die Projekt-id der Startnachricht mit, nicht nur den Namen', async () => {
    renderChat()
    await screen.findByRole('button', { name: /2600042/ })

    expect(sendMessageStream).toHaveBeenCalledWith(
      'Neuer Rapport für Projekt "Müller Seuzach"', 'Müller Seuzach', 'p-holderweg'
    )
  })

  it('bietet je Kandidat einen Knopf und sperrt solange die Eingabe', async () => {
    renderChat()

    await screen.findByRole('button', { name: /2600042 — Müller, Holderweg 4/ })
    expect(screen.getByRole('button', { name: /2600492 — Müller, Breitestrasse 29/ })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Nachricht schreiben/)).toBeDisabled()
  })

  it('antwortet mit der id des angetippten Projekts', async () => {
    const user = userEvent.setup()
    vi.mocked(chooseProject).mockResolvedValue(CONFIRM)
    renderChat()

    await user.click(await screen.findByRole('button', { name: /2600042/ }))

    expect(chooseProject).toHaveBeenCalledWith('p-holderweg')
    // Danach steht der Bestätigungsschritt — und die Eingabe ist wieder frei für
    // den Weg, den sie vorher hatte.
    await screen.findByRole('button', { name: 'Speichern' })
  })

  it('lässt die Auswahl nach einem Fehler stehen, statt den Rapport ins Leere laufen zu lassen', async () => {
    const user = userEvent.setup()
    vi.mocked(chooseProject).mockRejectedValue(new Error('offline'))
    renderChat()

    await user.click(await screen.findByRole('button', { name: /2600042/ }))

    expect(await screen.findByRole('button', { name: /2600042/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2600492/ })).toBeInTheDocument()
  })
})

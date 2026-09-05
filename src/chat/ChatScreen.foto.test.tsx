import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import ChatScreen from './ChatScreen'
import { sendMessageStream, uploadPhoto } from '../api/chat'
import { ApiError } from '../api/client'
import { DB_NAME, countPending, enqueuePhoto } from '../api/photoQueue'
import { UserInfo } from '../api/auth'

// Offline-Foto-Puffer im Rapport-Chat — docs/specs/offline-modus.md §4.1/§6.
//
// Der Kern: Der Foto-Knopf ist die AUSNAHME von der Offline-Sperre. Tippen und
// Sprechen brauchen das LLM und bleiben gesperrt; ein Foto braucht nur Platz.
// Auf dem Dach im Funkloch ist genau diese Aufnahme die, die nicht warten kann.

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

const jpeg = (name = 'dach.jpg') =>
  new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' })

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
    />,
  )
}

/** Der versteckte Datei-Input hinter dem Kamera-Knopf. */
function fotoAufnehmen(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  return act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

function resetDb(): Promise<void> {
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  localStorage.clear()
  vi.mocked(uploadPhoto).mockReset()
  vi.mocked(sendMessageStream).mockImplementation(async function* () {
    yield { type: 'result', result: { reply: 'Antwort vom Bot', action_taken: 'none' } }
  })
  setOnline(true)
  await resetDb()
})

afterEach(() => {
  localStorage.clear()
  setOnline(true)
})

describe('Rapport-Foto offline', () => {
  it('lässt den Foto-Knopf offline bedienbar, während der Rest gesperrt bleibt', async () => {
    setOnline(false)
    renderChat()
    await screen.findByText(/Sage z\.B\./)

    // Ohne diese Ausnahme wäre die Aufnahme gar nicht erst möglich.
    expect(screen.getByTitle('Foto aufnehmen')).toBeEnabled()
    // Der Chat selbst braucht das LLM und bleibt gesperrt.
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByTitle('Aufnahme starten')).toBeDisabled()
  })

  it('merkt ein offline aufgenommenes Foto und sagt, dass es später hochgeht', async () => {
    setOnline(false)
    renderChat()
    await screen.findByText(/Sage z\.B\./)

    await fotoAufnehmen(jpeg())

    expect(await screen.findByText(/wird hochgeladen, sobald du wieder Verbindung hast/))
      .toBeInTheDocument()
    // Der Satz darf nur stehen, wenn das Foto wirklich liegt.
    await waitFor(async () => expect(await countPending('user-1')).toBe(1))
    expect(uploadPhoto).not.toHaveBeenCalled()
  })

  it('zeigt an, wie viele Fotos auf die Verbindung warten', async () => {
    setOnline(false)
    renderChat()
    await screen.findByText(/Sage z\.B\./)

    await fotoAufnehmen(jpeg('a.jpg'))
    expect(await screen.findByText(/Ein Foto wartet auf die Verbindung/)).toBeInTheDocument()

    await fotoAufnehmen(jpeg('b.jpg'))
    expect(await screen.findByText(/2 Fotos warten auf die Verbindung/)).toBeInTheDocument()
  })

  it('puffert auch, wenn der Browser online meldet, die Leitung aber nicht trägt', async () => {
    // Funkloch mit Empfangsbalken: `navigator.onLine` sagt true, der Upload
    // scheitert trotzdem. Genau hier ging das Foto bisher verloren.
    vi.mocked(uploadPhoto).mockRejectedValue(new ApiError(0, 'network'))
    renderChat()
    await screen.findByText(/Sage z\.B\./)

    await fotoAufnehmen(jpeg())

    expect(await screen.findByText(/wird hochgeladen, sobald du wieder Verbindung hast/))
      .toBeInTheDocument()
    await waitFor(async () => expect(await countPending('user-1')).toBe(1))
  })

  it('lädt online sofort hoch, statt zu puffern', async () => {
    vi.mocked(uploadPhoto).mockResolvedValue({ reply: 'Foto gespeichert (1 Foto).', action_taken: 'photo_added' })
    renderChat()
    await screen.findByText(/Sage z\.B\./)

    await fotoAufnehmen(jpeg())

    expect(await screen.findByText('Foto gespeichert (1 Foto).')).toBeInTheDocument()
    expect(await countPending('user-1')).toBe(0)
  })

  it('liefert wartende Fotos beim Öffnen des Chats nach', async () => {
    // Die Verbindung kann zurückgekommen sein, während die App gar nicht lief —
    // dann feuert nie ein `online`-Event.
    await enqueuePhoto('user-1', jpeg('gestern.jpg'))
    vi.mocked(uploadPhoto).mockResolvedValue({ reply: 'Foto gespeichert (1 Foto).', action_taken: 'photo_added' })

    renderChat()

    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/ist jetzt hochgeladen/)).toBeInTheDocument()
    expect(await countPending('user-1')).toBe(0)
  })

  it('rührt ein wartendes Foto nicht an, solange kein Netz da ist', async () => {
    setOnline(false)
    await enqueuePhoto('user-1', jpeg('gestern.jpg'))

    renderChat()

    expect(await screen.findByText(/Ein Foto wartet auf die Verbindung/)).toBeInTheDocument()
    expect(uploadPhoto).not.toHaveBeenCalled()
  })

  it('holt das Nachliefern nach, wenn der Monteur die App wieder nach vorn holt', async () => {
    // `navigator.onLine` springt im Funkloch mit Empfangsbalken nie auf false.
    // Ohne diesen zweiten Anlass läge das eben gepufferte Foto so lange still,
    // wie der Chat offen bleibt.
    vi.mocked(uploadPhoto).mockRejectedValueOnce(new ApiError(0, 'network'))
    renderChat()
    await screen.findByText(/Sage z\.B\./)
    await fotoAufnehmen(jpeg())
    await screen.findByText(/wird hochgeladen, sobald du wieder Verbindung hast/)

    vi.mocked(uploadPhoto).mockResolvedValue({ reply: 'Foto gespeichert (1 Foto).', action_taken: 'photo_added' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(await screen.findByText(/ist jetzt hochgeladen/)).toBeInTheDocument()
    await waitFor(async () => expect(await countPending('user-1')).toBe(0))
  })

  it('sagt es, wenn ein Foto endgültig nicht durchgeht', async () => {
    // Stillschweigend verschwinden wäre das Schlimmste: der Monteur wartet
    // sonst auf einen Upload, den es nicht mehr gibt.
    await enqueuePhoto('user-1', jpeg('kaputt.jpg'))
    vi.mocked(uploadPhoto).mockRejectedValue(new ApiError(400, 'not_an_image'))

    renderChat()

    expect(await screen.findByText(/liess sich nicht hochladen/)).toBeInTheDocument()
    await waitFor(async () => expect(await countPending('user-1')).toBe(0))
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { getMe, getTenantInfo, UserInfo } from './api/auth'
import { _resetBackHandlers } from './shared/backButton'

// Hardware-/Browser-Zurück in der Mitarbeiter-App: eine Ebene zurück statt
// pauschal auf die Hauptmaske.
//
// Der Test geht bewusst durch das echte App.tsx und nicht durch die reine
// Verlaufslogik (die hat ihre eigenen Tests in shared/navHistory.test.ts).
// Geprüft wird die Verdrahtung: dass jeder Nav-Callback über `go` läuft, dass
// der popstate-Handler den Verlauf abträgt und dass die Reihenfolge
// Overlay → Screen stimmt. Genau das kann eine reine Funktion nicht zeigen.
vi.mock('./api/auth', async () => {
  const actual = await vi.importActual<typeof import('./api/auth')>('./api/auth')
  return { ...actual, getMe: vi.fn(), getTenantInfo: vi.fn() }
})

vi.mock('./screens/HomeScreen', () => ({
  default: (p: { onNavArbeitszeit: () => void; onNavProjekte: () => void }) => (
    <div>
      <span>home-stub</span>
      <button onClick={p.onNavArbeitszeit}>zu-arbeitszeit</button>
      <button onClick={p.onNavProjekte}>zu-projekte</button>
    </div>
  ),
}))

vi.mock('./screens/ArbeitsZeitScreen', () => ({
  default: (p: { onNavHome: () => void; onOpenBericht: (t: string) => void }) => (
    <div>
      <span>arbeitszeit-stub</span>
      <button onClick={() => p.onOpenBericht('monthly')}>zu-bericht</button>
      <button onClick={p.onNavHome}>zu-home</button>
    </div>
  ),
}))

vi.mock('./screens/BerichtScreen', () => ({ default: () => <div>bericht-stub</div> }))

// Ein Screen mit Overlay: prüft, dass ein offenes Overlay den Zurück-Druck vor
// dem Screen-Verlauf abfängt.
vi.mock('./screens/ProjekteScreen', async () => {
  const { useState } = await import('react')
  const { useBackButton } = await import('./shared/backButton')
  // Grossgeschriebener Name: sonst erkennt die react-hooks-Regel die Funktion
  // nicht als Komponente und schlägt im ESLint-Gate an.
  const ProjekteStub = () => {
    const [open, setOpen] = useState(true)
    useBackButton(open, () => setOpen(false))
    return (
      <div>
        <span>projekte-stub</span>
        <span>{open ? 'overlay-offen' : 'overlay-zu'}</span>
      </div>
    )
  }
  return { default: ProjekteStub }
})

vi.mock('./auth/PinScreen', () => ({ default: () => <div>pin-stub</div> }))
vi.mock('./auth/LoginScreen', () => ({ default: () => <div>login-stub</div> }))
vi.mock('./api/registerSW', () => ({ registerPwaUpdates: () => {} }))

const mockGetMe = vi.mocked(getMe)
const mockTenant = vi.mocked(getTenantInfo)

function user(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    authorized_user_id: 'u1',
    username: 'monteur',
    display_name: 'Monteur',
    email: null,
    staff_id: 's1',
    staff_name: 'Monteur',
    tenant_id: 't1',
    role: 'mitarbeiter',
    consent_version: '1',
    consent_required: false,
    enabled_modules: ['timekeeping', 'hr'],
    ...overrides,
  }
}

function pressBack() {
  act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
}

beforeEach(() => {
  localStorage.clear()
  _resetBackHandlers()
  vi.clearAllMocks()
  mockTenant.mockRejectedValue(new Error('kein Branding im Test'))
  mockGetMe.mockResolvedValue(user())
})

describe('App — Zurück führt zur vorherigen Ansicht', () => {
  it('trägt den Verlauf Schritt für Schritt ab', async () => {
    render(<App />)
    await screen.findByText('home-stub')

    await userEvent.click(screen.getByText('zu-arbeitszeit'))
    await screen.findByText('arbeitszeit-stub')
    await userEvent.click(screen.getByText('zu-bericht'))
    await screen.findByText('bericht-stub')

    // Früher wäre hier direkt die Hauptmaske gekommen.
    pressBack()
    await screen.findByText('arbeitszeit-stub')

    pressBack()
    await screen.findByText('home-stub')
  })

  it('verschluckt den Druck auf der Hauptmaske — die App bleibt offen', async () => {
    render(<App />)
    await screen.findByText('home-stub')

    pressBack()
    await waitFor(() => expect(screen.getByText('home-stub')).toBeInTheDocument())
  })

  it('macht den Rundweg nicht zum Vorwärts-Knopf', async () => {
    // home → arbeitszeit → (Nav-Leiste) home: der Hinweg ist bereits rückgängig
    // gemacht. Zurück darf jetzt NICHT wieder nach arbeitszeit führen.
    render(<App />)
    await screen.findByText('home-stub')

    await userEvent.click(screen.getByText('zu-arbeitszeit'))
    await screen.findByText('arbeitszeit-stub')
    await userEvent.click(screen.getByText('zu-home'))
    await screen.findByText('home-stub')

    pressBack()
    await waitFor(() => expect(screen.getByText('home-stub')).toBeInTheDocument())
  })

  it('schliesst zuerst ein offenes Overlay, erst danach greift der Verlauf', async () => {
    render(<App />)
    await screen.findByText('home-stub')

    await userEvent.click(screen.getByText('zu-projekte'))
    await screen.findByText('overlay-offen')

    pressBack()
    await screen.findByText('overlay-zu')
    // Der Screen steht noch — das Overlay hat den Druck verbraucht.
    expect(screen.getByText('projekte-stub')).toBeInTheDocument()

    pressBack()
    await screen.findByText('home-stub')
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { getMe, getTenantInfo, UserInfo } from './api/auth'
import { getBreadcrumbs, clearBreadcrumbs } from './shared/breadcrumbs'

// Der Boot-Pfad der App: von `screen === 'loading'` auf den ersten echten Screen.
//
// Warum es diese Datei gibt: am 2026-08-24 stand in App.tsx ein `useEffect`
// UNTERHALB der frühen Returns (`if (screen === 'loading') return …`). Im ersten
// Render wurde er nie erreicht, ab dem Wechsel auf 'pin'/'home' plötzlich schon —
// React zählt dann mehr Hooks als zuvor, wirft Fehler #310 und unmountet den
// gesamten Baum. Ergebnis auf Staging: eine komplett weisse Seite. Alle Tests
// waren grün, weil kein einziger diesen Übergang durchlief — sie rendern immer
// nur einzelne Screens. Genau diese Lücke schliesst dieser Test.
//
// Die Bildschirme hinter dem Boot sind bewusst gestubbt: geprüft wird der
// Übergang in App.tsx, nicht was HomeScreen lädt.
vi.mock('./api/auth', async () => {
  const actual = await vi.importActual<typeof import('./api/auth')>('./api/auth')
  return { ...actual, getMe: vi.fn(), getTenantInfo: vi.fn() }
})
vi.mock('./screens/HomeScreen', () => ({ default: () => <div>home-stub</div> }))
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
    enabled_modules: [],
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  clearBreadcrumbs()
  vi.clearAllMocks()
  mockTenant.mockRejectedValue(new Error('kein Branding im Test'))
})

describe('App — Boot-Übergang aus dem Ladebildschirm', () => {
  it('zeigt den PIN-Screen, wenn keine Sitzung besteht (kein leerer Baum)', async () => {
    mockGetMe.mockRejectedValue(new Error('401'))

    const { container } = render(<App />)
    expect(screen.getByText('Laden…')).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('pin-stub')).toBeInTheDocument())
    // Die eigentliche Regression: bei Fehler #310 räumt React den Baum leer.
    expect(container.innerHTML).not.toBe('')
  })

  it('zeigt die Startseite, wenn eine Sitzung besteht (kein leerer Baum)', async () => {
    mockGetMe.mockResolvedValue(user())

    const { container } = render(<App />)
    await waitFor(() => expect(screen.getByText('home-stub')).toBeInTheDocument())
    expect(container.innerHTML).not.toBe('')
  })

  it('blendet die Hilfe-Blase ein, sobald Modul und Flag gesetzt sind', async () => {
    mockGetMe.mockResolvedValue(user({
      enabled_modules: ['support'],
      feature_flags: { support_pwa: { enabled: true } },
    }))

    render(<App />)
    await waitFor(() => expect(screen.getByText('home-stub')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /hilfe/i })).toBeInTheDocument()
  })

  it('hält den Screenwechsel als Breadcrumb fest', async () => {
    mockGetMe.mockResolvedValue(user())

    render(<App />)
    // Auf die Spur warten, nicht auf den Bildschirm: `trackNav` läuft in einem
    // Effekt, und unter Last (voller Testlauf) kann der sichtbare Stub eine
    // Runde vor dessen Ausführung da sein. Die Zusage bleibt dieselbe.
    await waitFor(() => expect(getBreadcrumbs().map(b => b.detail)).toEqual(['loading', 'home']))
    expect(screen.getByText('home-stub')).toBeInTheDocument()
  })
})

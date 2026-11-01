import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PinScreen from './PinScreen'
import { ApiError } from '../api/client'
import { loginWithPassword, requestPasswordReset } from '../api/admin'
import { passkeySupported, registerPasskey } from './webauthn'
import { SK } from '../api/storageKeys'

// Nur die Auth-API mocken. TenantLogo wird aus ../App importiert (zieht sonst die
// gesamte App in den Test) → durch einen leichten Stub ersetzen.
vi.mock('../api/admin', () => ({
  loginWithPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
}))
vi.mock('../App', () => ({ TenantLogo: () => null }))
// Nur die Browser-Zeremonie mocken — Fehlertexte und das Merken der Identität
// laufen echt, die sind ja der Gegenstand.
vi.mock('./webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./webauthn')>()),
  registerPasskey: vi.fn(),
  passkeySupported: vi.fn(() => true),
}))

const mockLogin = vi.mocked(loginWithPassword)
const mockReset = vi.mocked(requestPasswordReset)
const mockRegister = vi.mocked(registerPasskey)
const mockSupported = vi.mocked(passkeySupported)

const PW_PLACEHOLDER = '••••••••'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockSupported.mockReturnValue(true)
})

function renderScreen() {
  const onLoggedIn = vi.fn()
  render(<PinScreen logoUrl="logo.png" onLoggedIn={onLoggedIn} />)
  return { onLoggedIn, user: userEvent.setup() }
}

describe('PinScreen — Login', () => {
  it('meldet erfolgreich an: speichert tenant_slug und ruft onLoggedIn', async () => {
    mockLogin.mockResolvedValue({ tenant_slug: 'acme' })
    const { onLoggedIn, user } = renderScreen()

    await user.type(screen.getByPlaceholderText('benutzername'), 'testuser')
    await user.type(screen.getByPlaceholderText(PW_PLACEHOLDER), 'geheim123')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled())
    expect(mockLogin).toHaveBeenCalledWith('testuser', 'geheim123')
    expect(localStorage.getItem('tenantSlug')).toBe('acme')
  })

  it('zeigt bei 401 "Benutzername oder Passwort falsch."', async () => {
    mockLogin.mockRejectedValue(new ApiError(401, 'unauthorized'))
    const { onLoggedIn, user } = renderScreen()

    await user.type(screen.getByPlaceholderText('benutzername'), 'wrong')
    await user.type(screen.getByPlaceholderText(PW_PLACEHOLDER), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    expect(await screen.findByText('Benutzername oder Passwort falsch.')).toBeInTheDocument()
    expect(onLoggedIn).not.toHaveBeenCalled()
  })

  it('zeigt bei 429 die Rate-Limit-Meldung', async () => {
    mockLogin.mockRejectedValue(new ApiError(429, 'too many'))
    const { user } = renderScreen()

    await user.type(screen.getByPlaceholderText('benutzername'), 'user')
    await user.type(screen.getByPlaceholderText(PW_PLACEHOLDER), 'pass')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    expect(await screen.findByText('Zu viele Versuche. Bitte warte 15 Minuten.')).toBeInTheDocument()
  })

  it('hält den Anmelden-Button deaktiviert, solange Felder leer sind', async () => {
    const { user } = renderScreen()
    const button = screen.getByRole('button', { name: 'Anmelden' })

    expect(button).toBeDisabled()
    await user.type(screen.getByPlaceholderText('benutzername'), 'user')
    expect(button).toBeDisabled()
    await user.type(screen.getByPlaceholderText(PW_PLACEHOLDER), 'pass')
    expect(button).toBeEnabled()
  })
})

describe('PinScreen — Passwort-Sichtbarkeit', () => {
  it('schaltet zwischen Passwort- und Klartext-Anzeige um', async () => {
    const { user } = renderScreen()
    const input = screen.getByPlaceholderText(PW_PLACEHOLDER)
    expect(input).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Passwort anzeigen' }))
    expect(input).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Passwort verbergen' }))
    expect(input).toHaveAttribute('type', 'password')
  })
})

describe('PinScreen — Passwort vergessen', () => {
  it('sendet den Reset-Link (E-Mail kleingeschrieben) und zeigt die Bestätigung', async () => {
    mockReset.mockResolvedValue(undefined)
    const { user } = renderScreen()

    await user.click(screen.getByRole('button', { name: 'Passwort vergessen?' }))
    await user.type(screen.getByPlaceholderText('name@firma.ch'), 'User@Firma.ch')
    await user.click(screen.getByRole('button', { name: 'Link senden' }))

    await waitFor(() => expect(mockReset).toHaveBeenCalledWith('user@firma.ch'))
    expect(await screen.findByText(/Falls ein Konto mit dieser E-Mail existiert/)).toBeInTheDocument()
  })
})


describe('PinScreen — Begrüssung folgt dem Logo', () => {
  // Nach dem Abmelden bleibt der Mandanten-Slug im localStorage, das Firmenlogo
  // steht also weiter über dem Formular. Stand darunter fest «Willkommen bei
  // Werkora», las sich der Screen als «Gehlhaar-Logo + fremder Markenname».
  //
  // Auf app.werkora.ch ist der localStorage dagegen leer — dort ist genau der
  // neutrale Werkora-Einstieg gewollt. Beide Faelle gehoeren gepinnt, sonst
  // repariert der naechste Fix den einen auf Kosten des anderen.

  it('nennt Werkora, solange der Mandant unbekannt ist', () => {
    render(<PinScreen logoUrl="" onLoggedIn={vi.fn()} />)
    expect(screen.getByText(/Willkommen bei/)).toBeInTheDocument()
    expect(screen.getByText(/Werkora/)).toBeInTheDocument()
  })

  it('grüsst zurück, sobald der Mandant bekannt ist', () => {
    render(<PinScreen logoUrl="logo.png" tenantName="Gehlhaar AG" onLoggedIn={vi.fn()} />)
    expect(screen.getByText('Willkommen zurück')).toBeInTheDocument()
    expect(screen.queryByText(/Werkora/)).not.toBeInTheDocument()
  })

  it('bleibt bei Werkora, wenn ein Logo ohne Mandantennamen ankommt', () => {
    // Verteidigt die Bedingung gegen die naheliegende Vereinfachung auf
    // `logoUrl`: der Name ist das Signal «Mandant bekannt», nicht das Bild.
    render(<PinScreen logoUrl="logo.png" onLoggedIn={vi.fn()} />)
    expect(screen.getByText(/Willkommen bei/)).toBeInTheDocument()
  })
})


describe('PinScreen — Passkey mit Einmal-PIN einrichten', () => {
  // Bis 20261101 gab es diesen Weg nicht: die Einrichtungsmaske war nirgends
  // eingebunden, und kein Code merkte sich die Identität für den Passkey-Login.
  // Ein Konto ohne Passwort («nur Passkey-Login») kam damit gar nicht hinein.

  const SETUP_LINK = 'Erstes Mal auf diesem Gerät? Passkey mit Einmal-PIN einrichten'

  async function openSetup() {
    const ctx = renderScreen()
    await ctx.user.click(screen.getByRole('button', { name: SETUP_LINK }))
    return ctx
  }

  it('richtet den Passkey ein, merkt sich die Identität und meldet an', async () => {
    mockRegister.mockResolvedValue({ authorizedUserId: 'u-1', tenantSlug: 'acme', displayName: 'Peter Muster' })
    const { onLoggedIn, user } = await openSetup()

    await user.type(screen.getByLabelText('Benutzername'), 'PMuster')
    await user.type(screen.getByLabelText('Einmal-PIN'), '123456')
    await user.click(screen.getByRole('button', { name: 'Passkey einrichten' }))

    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled())
    expect(mockRegister).toHaveBeenCalledWith('pmuster', '123456', expect.any(String))
    // Genau das fehlte: ohne diese Schlüssel bietet der nächste Start keinen Passkey-Login an.
    expect(localStorage.getItem(SK.AUTHORIZED_USER_ID)).toBe('u-1')
    expect(localStorage.getItem(SK.TENANT_SLUG)).toBe('acme')
    expect(localStorage.getItem(SK.DISPLAY_NAME)).toBe('Peter Muster')
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('nimmt nur sechs Ziffern an und gibt den Knopf erst dann frei', async () => {
    const { user } = await openSetup()
    const button = screen.getByRole('button', { name: 'Passkey einrichten' })

    await user.type(screen.getByLabelText('Benutzername'), 'pmuster')
    await user.type(screen.getByLabelText('Einmal-PIN'), '12a34')
    expect(screen.getByLabelText('Einmal-PIN')).toHaveValue('1234')
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText('Einmal-PIN'), '5678')
    expect(screen.getByLabelText('Einmal-PIN')).toHaveValue('123456')
    expect(button).toBeEnabled()
  })

  it('erklärt eine ungültige oder abgelaufene PIN und merkt sich nichts', async () => {
    mockRegister.mockRejectedValue(new ApiError(400, 'invalid_pin'))
    const { onLoggedIn, user } = await openSetup()

    await user.type(screen.getByLabelText('Benutzername'), 'pmuster')
    await user.type(screen.getByLabelText('Einmal-PIN'), '000000')
    await user.click(screen.getByRole('button', { name: 'Passkey einrichten' }))

    expect(await screen.findByText(/Benutzername oder PIN ungültig/)).toBeInTheDocument()
    expect(onLoggedIn).not.toHaveBeenCalled()
    expect(localStorage.getItem(SK.AUTHORIZED_USER_ID)).toBeNull()
  })

  it('meldet einen abgebrochenen Biometrie-Dialog verständlich', async () => {
    mockRegister.mockRejectedValue(new DOMException('cancel', 'NotAllowedError'))
    const { user } = await openSetup()

    await user.type(screen.getByLabelText('Benutzername'), 'pmuster')
    await user.type(screen.getByLabelText('Einmal-PIN'), '123456')
    await user.click(screen.getByRole('button', { name: 'Passkey einrichten' }))

    expect(await screen.findByText(/Einrichtung abgebrochen/)).toBeInTheDocument()
  })

  it('sagt ohne Passkey-Unterstützung, was stattdessen geht', async () => {
    mockSupported.mockReturnValue(false)
    const { user } = await openSetup()

    await user.type(screen.getByLabelText('Benutzername'), 'pmuster')
    await user.type(screen.getByLabelText('Einmal-PIN'), '123456')
    expect(screen.getByText(/unterstützt keine Passkeys/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Passkey einrichten' })).toBeDisabled()
  })

  it('führt zurück zur Anmeldung mit Passwort', async () => {
    const { user } = await openSetup()
    await user.click(screen.getByRole('button', { name: 'Zurück zur Anmeldung mit Passwort' }))
    expect(screen.getByPlaceholderText(PW_PLACEHOLDER)).toBeInTheDocument()
  })
})

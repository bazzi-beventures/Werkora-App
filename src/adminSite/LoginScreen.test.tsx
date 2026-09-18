/**
 * Anmeldung der Betreiber-Seite (docs/specs/admin-werkora-ch.md §6.3).
 *
 * Der eine Fall, der hier wirklich zählt: ein Konto, das kein Betreiber-Konto
 * ist, wird nach dem Login **wieder abgemeldet**. Ohne das hinge auf dieser
 * Origin ein gültiges Cookie, mit dem man nichts tun kann, und die Seite zeigte
 * einen Rahmen, in dem jede Kachel 403 sagt.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const loginWithPassword = vi.fn()
const getMe = vi.fn()
const logout = vi.fn()

const requestPasswordReset = vi.fn()
vi.mock('../api/admin/staff', () => ({
  loginWithPassword: (u: string, p: string) => loginWithPassword(u, p),
  requestPasswordReset: (e: string) => requestPasswordReset(e),
}))
vi.mock('../api/auth', () => ({
  getMe: () => getMe(),
  logout: () => logout(),
}))

import LoginScreen from './LoginScreen'
import { ApiError } from '../api/client'

const BETREIBER = { display_name: 'Luca', role: 'superadmin' }

function anmelden() {
  fireEvent.change(screen.getByLabelText('Benutzername'), { target: { value: 'luca' } })
  fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'geheim' } })
  fireEvent.click(screen.getByRole('button', { name: /anmelden/i }))
}

beforeEach(() => {
  loginWithPassword.mockReset().mockResolvedValue({ tenant_slug: 'werkora' })
  getMe.mockReset().mockResolvedValue(BETREIBER)
  logout.mockReset().mockResolvedValue(undefined)
})

describe('LoginScreen', () => {
  it('meldet ein Superadmin-Konto an', async () => {
    const onLoggedIn = vi.fn()
    render(<LoginScreen onLoggedIn={onLoggedIn} />)
    anmelden()
    await waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith(BETREIBER))
    expect(logout).not.toHaveBeenCalled()
  })

  it('wirft ein Nicht-Betreiber-Konto wieder hinaus', async () => {
    getMe.mockResolvedValue({ display_name: 'Chef', role: 'management' })
    const onLoggedIn = vi.fn()
    render(<LoginScreen onLoggedIn={onLoggedIn} />)
    anmelden()

    expect(await screen.findByText('Diese Seite ist für Betreiber-Konten.')).toBeTruthy()
    await waitFor(() => expect(logout).toHaveBeenCalled())
    expect(onLoggedIn).not.toHaveBeenCalled()
  })

  it('zeigt den Serverfehler statt eines allgemeinen Satzes', async () => {
    loginWithPassword.mockRejectedValue(new Error('Benutzername oder Passwort falsch.'))
    render(<LoginScreen onLoggedIn={vi.fn()} />)
    anmelden()
    expect(await screen.findByText('Benutzername oder Passwort falsch.')).toBeTruthy()
  })

  it('bietet den «Passwort vergessen»-Weg an', () => {
    // Bis 20260918 fehlte er: die Reset-Seite verlinkte danach in die
    // Mandanten-App, fuer ein Betreiberkonto eine Sackgasse. Behoben in
    // public_password_reset.py (§6.3), damit ist der Einwand weg — und ohne
    // diesen Weg bleibt bei einem vergessenen Passwort nur eine Migration.
    render(<LoginScreen onLoggedIn={vi.fn()} />)
    expect(screen.getByRole('button', { name: /vergessen/i })).toBeInTheDocument()
  })
})


describe('LoginScreen — rohe Fehlercodes', () => {
  /**
   * `apiFetch` reicht ein String-Detail unveraendert als `Error.message`
   * durch. Ohne Zuordnung stand «invalid_credentials» woertlich unter dem
   * Formular — im einzigen Fehlerfall, den ein Anmeldeschirm kennt.
   */
  it('uebersetzt invalid_credentials', async () => {
    loginWithPassword.mockRejectedValue(new ApiError(401, 'invalid_credentials'))
    render(<LoginScreen onLoggedIn={vi.fn()} />)
    anmelden()

    expect(await screen.findByText('Benutzername oder Passwort stimmt nicht.')).toBeTruthy()
    expect(screen.queryByText('invalid_credentials')).toBeNull()
  })

  it('uebersetzt die Umgebungs-Schranke', async () => {
    loginWithPassword.mockRejectedValue(new ApiError(401, 'tenant_unavailable'))
    render(<LoginScreen onLoggedIn={vi.fn()} />)
    anmelden()

    expect(await screen.findByText('Dieses Konto gehört nicht zu dieser Umgebung.')).toBeTruthy()
  })
})

describe('LoginScreen — Passwort vergessen', () => {
  function zumReset() {
    render(<LoginScreen onLoggedIn={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /vergessen/i }))
  }

  it('fordert den Link fuer die eingegebene Adresse an', async () => {
    requestPasswordReset.mockResolvedValue(undefined)
    zumReset()

    fireEvent.change(screen.getByLabelText('E-Mail-Adresse'), {
      target: { value: ' luca.bazzi@beventures.ch ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Link senden' }))

    await waitFor(() =>
      expect(requestPasswordReset).toHaveBeenCalledWith('luca.bazzi@beventures.ch'),
    )
  })

  it('bestaetigt gleich, ob es die Adresse gibt oder nicht', async () => {
    // Das Backend antwortet aus demselben Grund generisch. Hier zu
    // unterscheiden machte seine Muehe zunichte (User-Enumeration).
    requestPasswordReset.mockResolvedValue(undefined)
    zumReset()

    fireEvent.change(screen.getByLabelText('E-Mail-Adresse'), {
      target: { value: 'gibtsnicht@example.ch' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Link senden' }))

    expect(await screen.findByText(/Wenn es zu dieser Adresse ein Konto gibt/)).toBeTruthy()
    expect(screen.queryByLabelText('E-Mail-Adresse')).toBeNull()
  })

  it('meldet die Bremse im Klartext', async () => {
    requestPasswordReset.mockRejectedValue(new ApiError(429, 'rate_limited'))
    zumReset()

    fireEvent.change(screen.getByLabelText('E-Mail-Adresse'), {
      target: { value: 'luca.bazzi@beventures.ch' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Link senden' }))

    expect(
      await screen.findByText('Zu viele Versuche. Bitte in 15 Minuten nochmals probieren.'),
    ).toBeTruthy()
  })

  it('der Weg zurueck fuehrt wieder zur Anmeldung', () => {
    zumReset()
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(screen.getByLabelText('Benutzername')).toBeInTheDocument()
  })
})

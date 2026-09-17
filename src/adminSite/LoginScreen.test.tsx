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

vi.mock('../api/admin/staff', () => ({
  loginWithPassword: (u: string, p: string) => loginWithPassword(u, p),
}))
vi.mock('../api/auth', () => ({
  getMe: () => getMe(),
  logout: () => logout(),
}))

import LoginScreen from './LoginScreen'

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

  it('bietet keinen «Passwort vergessen»-Weg an', () => {
    // Der Reset-Link führt in die Mandanten-App; für ein Betreiberkonto wäre er
    // eine Sackgasse (§6.3).
    render(<LoginScreen onLoggedIn={vi.fn()} />)
    expect(screen.queryByText(/vergessen/i)).toBeNull()
  })
})

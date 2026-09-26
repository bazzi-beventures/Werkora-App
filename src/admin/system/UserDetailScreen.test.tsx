/**
 * Zugangs-PIN für einen BESTEHENDEN Zugang.
 *
 * Der Knopf ist der einzige Weg zu einem Passkey auf einem zweiten Gerät: die
 * Registrierung verlangt eine gültige PIN, und `NewPersonScreen` vergibt sie nur
 * beim Anlegen. Solange er fehlte, beschrieb das Handbuch an drei Stellen einen
 * Knopf, den es nicht gab — und der Hilfe-Bot gab die Beschreibung getreu weiter.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UserDetailScreen from './UserDetailScreen'
import { generateUserPin } from '../../api/admin/users'
import type { AuthUser } from '../../api/admin/users'

vi.mock('../../api/admin/users', () => ({
  anonymizeUser: vi.fn(),
  generateUserPin: vi.fn(),
  saveUser: vi.fn(),
  setUserPassword: vi.fn(),
}))

const mockGeneratePin = vi.mocked(generateUserPin)

const USER = {
  id: 'au-7',
  email: 'max@firma.ch',
  display_name: 'Max Muster',
  role: 'monteur',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  consent_version: null,
  consent_current: false,
  username: 'ghmaxm',
} as AuthUser

beforeEach(() => vi.clearAllMocks())

function renderScreen() {
  render(<UserDetailScreen user={USER} actingRole="management" onClose={() => {}} onSaved={() => {}} />)
}

describe('UserDetailScreen — Zugangs-PIN', () => {
  it('erzeugt eine PIN für das geöffnete Konto und zeigt sie an', async () => {
    mockGeneratePin.mockResolvedValue({ pin: '473812', expires_at: '2026-09-22T07:30:00Z' })
    const user = userEvent.setup()
    renderScreen()

    await user.click(screen.getByRole('button', { name: 'PIN generieren' }))

    expect(mockGeneratePin).toHaveBeenCalledWith('au-7')
    expect(await screen.findByText('473812')).toBeInTheDocument()
  })

  it('zeigt die PIN nur einmal — der Knopf verschwindet danach', async () => {
    mockGeneratePin.mockResolvedValue({ pin: '473812', expires_at: '2026-09-22T07:30:00Z' })
    const user = userEvent.setup()
    renderScreen()

    await user.click(screen.getByRole('button', { name: 'PIN generieren' }))
    await screen.findByText('473812')

    // Kein zweiter Klick: die PIN steht nur im State, ein erneutes Erzeugen
    // würde die eben weitergegebene still entwerten (DELETE + INSERT im Backend).
    expect(screen.queryByRole('button', { name: 'PIN generieren' })).toBeNull()
  })

  it('meldet den Backend-Fehler im Klartext, statt still nichts zu tun', async () => {
    mockGeneratePin.mockRejectedValue(new Error('user_not_editable'))
    const user = userEvent.setup()
    renderScreen()

    await user.click(screen.getByRole('button', { name: 'PIN generieren' }))

    expect(await screen.findByText('user_not_editable')).toBeInTheDocument()
  })
})

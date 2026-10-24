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
import { generateUserPin, setUserPermissions } from '../../api/admin/users'
import type { AuthUser } from '../../api/admin/users'

vi.mock('../../api/admin/users', () => ({
  anonymizeUser: vi.fn(),
  generateUserPin: vi.fn(),
  saveUser: vi.fn(),
  setUserPassword: vi.fn(),
  setUserPermissions: vi.fn(),
}))

const mockGeneratePin = vi.mocked(generateUserPin)
const mockSetPermissions = vi.mocked(setUserPermissions)

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

// docs/specs/ferien-freigabe-recht.md §5
describe('UserDetailScreen — Zusatzrechte', () => {
  it('fehlt ohne Freigabe von oben (kein Beta-Feature oder keine Management-Rolle)', () => {
    renderScreen()
    expect(screen.queryByText(/Zusatzrechte/)).toBeNull()
  })

  it('setzt «Ferien freigeben» sofort und mit der ganzen Liste', async () => {
    mockSetPermissions.mockResolvedValue(['absence_approve'])
    const user = userEvent.setup()
    render(<UserDetailScreen user={USER} actingRole="management" permissionOptions={['absence_approve']} onClose={() => {}} onSaved={() => {}} />)

    const box = screen.getByRole('checkbox', { name: /Ferien freigeben/ })
    expect(box).not.toBeChecked()
    await user.click(box)

    expect(mockSetPermissions).toHaveBeenCalledWith('au-7', ['absence_approve'])
    expect(await screen.findByRole('checkbox', { name: /Ferien freigeben/ })).toBeChecked()
  })

  it('entzieht ein vorhandenes Recht', async () => {
    mockSetPermissions.mockResolvedValue([])
    const user = userEvent.setup()
    render(<UserDetailScreen user={{ ...USER, permissions: ['absence_approve'] }} actingRole="management"
      permissionOptions={['absence_approve']} onClose={() => {}} onSaved={() => {}} />)

    await user.click(screen.getByRole('checkbox', { name: /Ferien freigeben/ }))
    expect(mockSetPermissions).toHaveBeenCalledWith('au-7', [])
  })

  // docs/specs/lieferschein-erfassung.md §3.5
  it('zeigt nur die vergebbaren Rechte — «Wareneingang» ohne das Ferien-Feature', async () => {
    mockSetPermissions.mockResolvedValue(['absence_approve', 'wareneingang'])
    const user = userEvent.setup()
    render(<UserDetailScreen user={{ ...USER, permissions: ['absence_approve'] }} actingRole="management"
      permissionOptions={['wareneingang']} onClose={() => {}} onSaved={() => {}} />)

    expect(screen.queryByRole('checkbox', { name: /Ferien freigeben/ })).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: /Wareneingang/ }))
    // Das vorhandene, hier nicht vergebbare Recht geht mit — der Server lässt es stehen.
    expect(mockSetPermissions).toHaveBeenCalledWith('au-7', ['absence_approve', 'wareneingang'])
  })
})

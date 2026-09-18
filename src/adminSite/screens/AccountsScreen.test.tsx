/**
 * Konten — der Screen, der die SQL-Migration fürs Passwort ersetzt.
 *
 * Zwei Zusicherungen tragen ihn, und beide sind Mandantentreue:
 * der gewählte Mandant geht in den Aufruf, und der Screen bietet nur diese
 * eine Aktion an. Rolle, Status und Name bleiben beim Admin des Mandanten
 * (§5.1) — ein Knopf mehr hier wäre Kontenverwaltung durch den Betreiber.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const listUsers = vi.fn()
const setUserPassword = vi.fn()
vi.mock('../tenantScopedApi', () => ({
  listUsers: (...a: unknown[]) => listUsers(...a),
  setUserPassword: (...a: unknown[]) => setUserPassword(...a),
}))

import AccountsScreen from './AccountsScreen'

const GEHLHAAR = 't-1'
const KONTEN = [
  {
    id: 'u-1', email: 'chef@gehlhaar.ch', display_name: 'Anna Gehlhaar', role: 'management',
    is_active: true, created_at: '2026-01-01', consent_version: '1.1', consent_current: true,
    username: 'anna', beta_tester: false,
  },
  {
    id: 'u-2', email: null, display_name: 'Bruno Meier', role: 'user',
    is_active: true, created_at: '2026-01-01', consent_version: '1.1', consent_current: true,
    username: 'bruno', beta_tester: false,
  },
]

beforeEach(() => {
  listUsers.mockReset().mockResolvedValue(KONTEN)
  setUserPassword.mockReset().mockResolvedValue(undefined)
})

describe('AccountsScreen', () => {
  it('lädt die Konten des gewählten Mandanten', async () => {
    render(<AccountsScreen tenantId={GEHLHAAR} />)

    expect(await screen.findByText('Anna Gehlhaar')).toBeInTheDocument()
    expect(screen.getByText('Bruno Meier')).toBeInTheDocument()
    expect(listUsers).toHaveBeenCalledWith(GEHLHAAR)
  })

  it('setzt das Passwort beim gewählten Mandanten und beim richtigen Konto', async () => {
    render(<AccountsScreen tenantId={GEHLHAAR} />)
    await screen.findByText('Bruno Meier')

    const zeilen = screen.getAllByRole('button', { name: 'Passwort setzen' })
    await userEvent.click(zeilen[1])

    expect(screen.getByText('Passwort für Bruno Meier')).toBeInTheDocument()

    const neu = 'Baustelle-Winterthur-42'
    await userEvent.type(screen.getByLabelText('Neues Passwort'), neu)
    await userEvent.type(screen.getByLabelText('Neues Passwort wiederholen'), neu)
    // Der Knopf im Dialog heisst wie die in den Zeilen — sonst trifft die
    // Abfrage vier Stück.
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Passwort setzen' }))

    await waitFor(() => expect(setUserPassword).toHaveBeenCalledWith(GEHLHAAR, 'u-2', neu))
  })

  it('bietet keine andere Änderung am Konto an', async () => {
    // §5.1: die Betreiber-Seite verwaltet die Konten eines Kunden nicht.
    render(<AccountsScreen tenantId={GEHLHAAR} />)
    await screen.findByText('Anna Gehlhaar')

    expect(screen.queryByRole('button', { name: /Löschen|Bearbeiten|Speichern|Rolle/ })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('ein Ladefehler bleibt eine Meldung, kein Absturz', async () => {
    listUsers.mockRejectedValue(new Error('Server weg'))
    render(<AccountsScreen tenantId={GEHLHAAR} />)

    expect(await screen.findByText('Server weg')).toBeInTheDocument()
  })

  it('ein Mandant ohne Konten sagt das', async () => {
    listUsers.mockResolvedValue([])
    render(<AccountsScreen tenantId={GEHLHAAR} />)

    expect(await screen.findByText('Dieser Mandant hat keine aktiven Konten.')).toBeInTheDocument()
  })
})

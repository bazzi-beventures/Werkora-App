import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewPersonScreen from './NewPersonScreen'
import { createUser } from '../../api/admin/users'
import { getStaffRoles, upsertStaff, upsertStaffRole } from '../../api/admin/staff'

vi.mock('../../api/admin/users', () => ({ createUser: vi.fn() }))
vi.mock('../../api/admin/staff', () => ({
  getStaffRoles: vi.fn(),
  upsertStaff: vi.fn(),
  upsertStaffRole: vi.fn(),
}))

const mockCreateUser = vi.mocked(createUser)
const mockRoles = vi.mocked(getStaffRoles)
const mockUpsertStaff = vi.mocked(upsertStaff)
const mockUpsertRole = vi.mocked(upsertStaffRole)

const ROLES = [
  { name: 'Monteur', hourly_rate: 95 },
  { name: 'Polier', hourly_rate: 110 },
] as unknown as Awaited<ReturnType<typeof getStaffRoles>>

const CREATED = {
  status: 'success',
  message: 'angelegt',
  authorized_user_id: 'au-1',
  username: 'ghmaxm',
  staff_id: 'st-1',
  pin: null,
  pin_expires_at: null,
  warnings: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRoles.mockResolvedValue(ROLES)
})

describe('NewPersonScreen', () => {
  it('schickt Konto und Personaldaten in einem Request', async () => {
    mockCreateUser.mockResolvedValue(CREATED)
    const user = userEvent.setup()
    render(<NewPersonScreen actingRole="management" onClose={() => {}} onSaved={() => {}} />)

    await screen.findByRole('option', { name: 'Monteur' })
    await user.type(screen.getByLabelText('Name *'), 'Max Muster')
    await user.type(screen.getByLabelText('E-Mail'), 'max@firma.ch')
    await user.selectOptions(screen.getByLabelText('Funktion'), 'Monteur')
    await user.clear(screen.getByLabelText('Pensum (%)'))
    await user.type(screen.getByLabelText('Pensum (%)'), '80')
    await user.type(screen.getByLabelText('Kürzel'), 'MM')
    await user.click(screen.getByRole('button', { name: 'Anlegen' }))

    await waitFor(() => expect(mockCreateUser).toHaveBeenCalledTimes(1))
    const payload = mockCreateUser.mock.calls[0][0]
    expect(payload.display_name).toBe('Max Muster')
    expect(payload.email).toBe('max@firma.ch')
    expect(payload.staff?.funktion).toBe('Monteur')
    expect(payload.staff?.pensum).toBe(80)
    expect(payload.staff?.kuerzel).toBe('MM')
    // Ein einziger Aufruf: die Personaldaten laufen nicht als zweiter Request nach.
    expect(mockUpsertStaff).not.toHaveBeenCalled()
  })

  it('zeigt Benutzername und PIN nach dem Anlegen, statt sofort zu schliessen', async () => {
    mockCreateUser.mockResolvedValue({ ...CREATED, pin: '481920' })
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(<NewPersonScreen actingRole="management" onClose={() => {}} onSaved={onSaved} />)

    await screen.findByRole('option', { name: 'Monteur' })
    await user.type(screen.getByLabelText('Name *'), 'Max Muster')
    await user.click(screen.getByLabelText('Zugangs-PIN erzeugen'))
    await user.click(screen.getByRole('button', { name: 'Anlegen' }))

    // Der PIN ist einmalig — er darf nicht mit dem Screen verschwinden.
    expect(await screen.findByText('481920')).toBeInTheDocument()
    expect(screen.getByText('ghmaxm')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Fertig' }))
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('benennt Teilerfolge des Backends', async () => {
    mockCreateUser.mockResolvedValue({
      ...CREATED,
      staff_id: null,
      warnings: [{ code: 'staff_profile_failed', message: 'Personaldaten konnten nicht gespeichert werden.' }],
    })
    const user = userEvent.setup()
    render(<NewPersonScreen actingRole="management" onClose={() => {}} onSaved={() => {}} />)

    await screen.findByRole('option', { name: 'Monteur' })
    await user.type(screen.getByLabelText('Name *'), 'Max Muster')
    await user.click(screen.getByRole('button', { name: 'Anlegen' }))

    expect(await screen.findByText('Personaldaten konnten nicht gespeichert werden.')).toBeInTheDocument()
  })

  it('legt eine neue Funktion an, bevor der Mitarbeiter darauf zeigt', async () => {
    mockCreateUser.mockResolvedValue(CREATED)
    mockUpsertRole.mockResolvedValue({ status: 'success', message: 'ok' })
    const user = userEvent.setup()
    render(<NewPersonScreen actingRole="management" onClose={() => {}} onSaved={() => {}} />)

    await screen.findByRole('option', { name: 'Monteur' })
    await user.type(screen.getByLabelText('Name *'), 'Max Muster')
    await user.selectOptions(screen.getByLabelText('Funktion'), '__new__')
    await user.type(await screen.findByLabelText('Name der Funktion *'), 'Sanitärmonteur')
    await user.type(screen.getByLabelText('Verrechnungssatz (CHF/h) *'), '105')
    await user.click(screen.getByRole('button', { name: 'Anlegen' }))

    await waitFor(() => expect(mockCreateUser).toHaveBeenCalledTimes(1))
    expect(mockUpsertRole).toHaveBeenCalledWith('Sanitärmonteur', 105)
    expect(mockCreateUser.mock.calls[0][0].staff?.funktion).toBe('Sanitärmonteur')
    // Reihenfolge: ohne Satz gäbe es einen Mitarbeiter mit Funktion, aber ohne Stundensatz.
    expect(mockUpsertRole.mock.invocationCallOrder[0])
      .toBeLessThan(mockCreateUser.mock.invocationCallOrder[0])
  })

  it('bietet einem Admin das Anlegen einer Funktion nicht an', async () => {
    render(<NewPersonScreen actingRole="admin" onClose={() => {}} onSaved={() => {}} />)
    await screen.findByRole('option', { name: 'Monteur' })
    expect(screen.queryByRole('option', { name: /Neue Funktion anlegen/ })).not.toBeInTheDocument()
  })

  it('legt ohne Login nur die Stammdaten an', async () => {
    mockUpsertStaff.mockResolvedValue({ id: 'st-9' } as unknown as Awaited<ReturnType<typeof upsertStaff>>)
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(<NewPersonScreen actingRole="management" origin="staff" onClose={() => {}} onSaved={onSaved} />)

    await screen.findByRole('option', { name: 'Monteur' })
    // Aus der Mitarbeiterliste startet die Login-Frage abgewählt.
    expect(screen.getByLabelText('Login anlegen')).not.toBeChecked()
    await user.type(screen.getByLabelText('Name *'), 'Temporär Kraft')
    await user.selectOptions(screen.getByLabelText('Funktion'), 'Polier')
    await user.click(screen.getByRole('button', { name: 'Anlegen' }))

    await waitFor(() => expect(mockUpsertStaff).toHaveBeenCalledTimes(1))
    expect(mockUpsertStaff.mock.calls[0][0]).toMatchObject({ name: 'Temporär Kraft', funktion: 'Polier' })
    expect(mockCreateUser).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('blockiert das Anlegen bei zu kurzem Passwort', async () => {
    const user = userEvent.setup()
    render(<NewPersonScreen actingRole="management" onClose={() => {}} onSaved={() => {}} />)

    await screen.findByRole('option', { name: 'Monteur' })
    await user.type(screen.getByLabelText('Name *'), 'Max Muster')
    await user.type(screen.getByLabelText('Passwort (optional)'), 'kurz')

    expect(screen.getByRole('button', { name: 'Anlegen' })).toBeDisabled()
    expect(mockCreateUser).not.toHaveBeenCalled()
  })
})

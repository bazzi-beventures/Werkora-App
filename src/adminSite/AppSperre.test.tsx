/**
 * App-Sperre der Betreiber-Seite (docs/specs/admin-werkora-ch.md §15).
 *
 * Was hier festgehalten wird: in der App öffnet das Passwort allein nie die
 * Seite — nach der Anmeldung kommt immer noch der Fingerabdruck (einrichten
 * oder bestätigen). Und ein Gerät ohne Passkeys bleibt zu, statt die Sperre
 * stillschweigend zu überspringen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiError } from '../api/client'
import { SK } from '../api/storageKeys'

const getMe = vi.fn()
const logout = vi.fn()
vi.mock('../api/auth', () => ({
  getMe: () => getMe(),
  logout: () => logout(),
}))

const loginWithPassword = vi.fn()
vi.mock('../api/admin/staff', () => ({
  loginWithPassword: (u: string, p: string) => loginWithPassword(u, p),
  requestPasswordReset: vi.fn(),
}))

let unterstuetzt = true
vi.mock('../auth/webauthn', () => ({
  passkeySupported: () => unterstuetzt,
}))

const einrichten = vi.fn()
const entsperren = vi.fn()
vi.mock('./adminPasskey', async (importOriginal) => {
  const echt = await importOriginal<typeof import('./adminPasskey')>()
  return {
    ...echt,
    adminPasskeyEinrichten: () => einrichten(),
    adminPasskeyEntsperren: (k: unknown) => entsperren(k),
  }
})

vi.mock('./MfaBestaetigung', () => ({
  default: ({ onBestaetigt, user }: { onBestaetigt: (u: unknown) => void; user: { display_name: string } }) => (
    <button type="button" onClick={() => onBestaetigt({ ...user, mfa: { pflicht: true, bestaetigt: true, methode: 'wiederherstellung' } })}>
      Anmeldung bestätigen
    </button>
  ),
}))

import AppSperre from './AppSperre'
import { SchonEingerichtet } from './adminPasskey'

const KONTO = { authorizedUserId: 'u-1', tenantSlug: 'werkora', displayName: 'Luca' }
const BETREIBER = { authorized_user_id: 'u-1', display_name: 'Luca', role: 'superadmin' }

function kontoAufDemGeraet() {
  localStorage.setItem(SK.ADMIN_PASSKEY_KONTO, JSON.stringify(KONTO))
}

function mitPasswortAnmelden() {
  fireEvent.change(screen.getByLabelText('Benutzername'), { target: { value: 'luca' } })
  fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'geheim' } })
  fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }))
}

beforeEach(() => {
  localStorage.clear()
  unterstuetzt = true
  getMe.mockReset().mockResolvedValue(BETREIBER)
  logout.mockReset().mockResolvedValue(undefined)
  loginWithPassword.mockReset().mockResolvedValue({ tenant_slug: 'werkora' })
  einrichten.mockReset().mockResolvedValue(KONTO)
  entsperren.mockReset().mockResolvedValue(undefined)
})

describe('AppSperre', () => {
  it('mit Konto auf dem Gerät: fragt beim Erscheinen gleich nach dem Fingerabdruck', async () => {
    kontoAufDemGeraet()
    const onEntsperrt = vi.fn()
    render(<AppSperre onEntsperrt={onEntsperrt} />)
    await waitFor(() => expect(onEntsperrt).toHaveBeenCalledWith(BETREIBER))
    expect(entsperren).toHaveBeenCalledWith(KONTO)
  })

  it('verlangt das Gerät einen Fingertipp, steht still der Knopf da', async () => {
    kontoAufDemGeraet()
    entsperren.mockRejectedValueOnce(new DOMException('kein Tipp', 'NotAllowedError'))
    const onEntsperrt = vi.fn()
    render(<AppSperre onEntsperrt={onEntsperrt} />)

    const knopf = await screen.findByRole('button', { name: 'Mit Fingerabdruck entsperren' })
    await waitFor(() => expect((knopf as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText(/Abgebrochen/)).toBeNull()

    fireEvent.click(knopf)
    await waitFor(() => expect(onEntsperrt).toHaveBeenCalledWith(BETREIBER))
    expect(entsperren).toHaveBeenCalledTimes(2)
  })

  it('erstes Mal: Passwort allein öffnet die App nicht — erst der eingerichtete Fingerabdruck', async () => {
    const onEntsperrt = vi.fn()
    render(<AppSperre onEntsperrt={onEntsperrt} />)
    mitPasswortAnmelden()

    const knopf = await screen.findByRole('button', { name: 'Fingerabdruck einrichten' })
    expect(onEntsperrt).not.toHaveBeenCalled()

    fireEvent.click(knopf)
    await waitFor(() => expect(onEntsperrt).toHaveBeenCalledWith(BETREIBER))
    expect(einrichten).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem(SK.ADMIN_PASSKEY_KONTO)!)).toEqual(KONTO)
  })

  it('Passwort-Weg mit vorhandenem Fingerabdruck: bestätigen statt neu einrichten', async () => {
    kontoAufDemGeraet()
    entsperren.mockRejectedValueOnce(new DOMException('kein Tipp', 'NotAllowedError'))
    const onEntsperrt = vi.fn()
    render(<AppSperre onEntsperrt={onEntsperrt} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Mit Passwort anmelden' }))
    mitPasswortAnmelden()
    fireEvent.click(await screen.findByRole('button', { name: 'Mit Fingerabdruck bestätigen' }))

    await waitFor(() => expect(onEntsperrt).toHaveBeenCalledWith(BETREIBER))
    expect(einrichten).not.toHaveBeenCalled()
  })

  it('Passkey serverseitig weg: Konto vergessen, über Passwort neu einrichten', async () => {
    kontoAufDemGeraet()
    entsperren.mockRejectedValueOnce(new ApiError(404, 'no_credentials_registered'))
    const onEntsperrt = vi.fn()
    render(<AppSperre onEntsperrt={onEntsperrt} />)

    expect(await screen.findByText(/kein Fingerabdruck mehr hinterlegt/)).toBeTruthy()
    expect(screen.getByLabelText('Passwort')).toBeTruthy()
    expect(localStorage.getItem(SK.ADMIN_PASSKEY_KONTO)).toBeNull()
    expect(onEntsperrt).not.toHaveBeenCalled()
  })

  it('Gerät hat den Passkey schon: Konto übernehmen, danach damit bestätigen', async () => {
    einrichten.mockRejectedValueOnce(new SchonEingerichtet(KONTO))
    const onEntsperrt = vi.fn()
    render(<AppSperre onEntsperrt={onEntsperrt} />)
    mitPasswortAnmelden()

    fireEvent.click(await screen.findByRole('button', { name: 'Fingerabdruck einrichten' }))
    const bestaetigen = await screen.findByRole('button', { name: 'Mit Fingerabdruck bestätigen' })
    expect(screen.getByText(/schon eingerichtet/)).toBeTruthy()
    expect(onEntsperrt).not.toHaveBeenCalled()

    fireEvent.click(bestaetigen)
    await waitFor(() => expect(onEntsperrt).toHaveBeenCalledWith(BETREIBER))
    expect(entsperren).toHaveBeenCalledWith(KONTO)
  })

  it('zu alte Anmeldung beim Einrichten: zurück zum Passwort', async () => {
    einrichten.mockRejectedValueOnce(new ApiError(403, 'fresh_login_required'))
    render(<AppSperre onEntsperrt={vi.fn()} />)
    mitPasswortAnmelden()
    fireEvent.click(await screen.findByRole('button', { name: 'Fingerabdruck einrichten' }))

    expect(await screen.findByText(/Anmeldung ist zu lange her/)).toBeTruthy()
    expect(screen.getByLabelText('Passwort')).toBeTruthy()
  })

  it('Gerät ohne Passkeys: bleibt zu, kein Weg hinein', () => {
    unterstuetzt = false
    kontoAufDemGeraet()
    render(<AppSperre onEntsperrt={vi.fn()} />)
    expect(screen.getByText(/im Browser öffnen/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByLabelText('Passwort')).toBeNull()
    expect(entsperren).not.toHaveBeenCalled()
  })

  it('nach bewusstem Abmelden: keine sofortige Abfrage, erst auf Knopfdruck', async () => {
    kontoAufDemGeraet()
    const onEntsperrt = vi.fn()
    render(<AppSperre onEntsperrt={onEntsperrt} sofortFragen={false} />)
    const knopf = screen.getByRole('button', { name: 'Mit Fingerabdruck entsperren' })
    expect(entsperren).not.toHaveBeenCalled()
    fireEvent.click(knopf)
    await waitFor(() => expect(onEntsperrt).toHaveBeenCalledWith(BETREIBER))
  })

  it('MFA-Pflicht, neues Gerät: erst bestätigen, dann Fingerabdruck einrichten', async () => {
    // docs/specs/betreiber-mfa.md §5.3, E7: das Passwort allein richtet
    // keinen neuen Passkey ein.
    getMe.mockResolvedValue({ ...BETREIBER, mfa: { pflicht: true, bestaetigt: false, methode: null } })
    const onEntsperrt = vi.fn()
    render(<AppSperre onEntsperrt={onEntsperrt} />)
    mitPasswortAnmelden()

    fireEvent.click(await screen.findByRole('button', { name: 'Anmeldung bestätigen' }))
    expect(einrichten).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Fingerabdruck einrichten' }))
    await waitFor(() => expect(onEntsperrt).toHaveBeenCalled())
    expect(einrichten).toHaveBeenCalledTimes(1)
  })

  it('Server verlangt Bestätigung beim Einrichten: zurück zur Bestätigung', async () => {
    einrichten.mockRejectedValueOnce(new ApiError(403, 'bestaetigung_erforderlich'))
    render(<AppSperre onEntsperrt={vi.fn()} />)
    mitPasswortAnmelden()
    fireEvent.click(await screen.findByRole('button', { name: 'Fingerabdruck einrichten' }))
    expect(await screen.findByRole('button', { name: 'Anmeldung bestätigen' })).toBeTruthy()
  })

  it('über der laufenden Seite als Dialog', async () => {
    kontoAufDemGeraet()
    entsperren.mockReturnValue(new Promise(() => { /* hängt */ }))
    render(<AppSperre onEntsperrt={vi.fn()} ueberlagert />)
    expect(screen.getByRole('dialog', { name: 'Werkora Admin gesperrt' })).toBeTruthy()
  })
})

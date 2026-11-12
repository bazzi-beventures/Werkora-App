/**
 * Weiche der Betreiber-Seite für die MFA-Pflicht (docs/specs/betreiber-mfa.md §6.9).
 *
 * Passwort stimmt, Bestätigung fehlt: dann gibt es nur «Anmeldung bestätigen»
 * — und es lädt nichts, was die Seite sonst braucht (Mandanten, Zähler), weil
 * der Server dort ohnehin 403 sagt. Ein 403 `mfa_required` mitten in der
 * Arbeit führt zur selben Bestätigung.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const getMe = vi.fn()
vi.mock('../api/auth', () => ({ getMe: () => getMe(), logout: vi.fn() }))
const zaehler = vi.fn()
vi.mock('../api/featureRequests', () => ({ fetchNewRequestCount: () => { zaehler(); return Promise.resolve({ count: 0 }) } }))
vi.mock('../api/support', () => ({ fetchOpenSupportCount: () => Promise.resolve({ count: 0 }) }))
const scopeAktiv: boolean[] = []
vi.mock('./useTenantScope', () => ({
  useTenantScope: (aktiv: boolean) => {
    scopeAktiv.push(aktiv)
    return { tenantId: null, tenant: null, tenants: [], selectTenant: vi.fn() }
  },
}))
vi.mock('./AdminSiteShell', () => ({ default: () => <div>Seite der Betreiber</div>, SCREEN_TITEL: {} }))
vi.mock('./appSperreRegeln', () => ({ istAppModus: () => false, useSperreBeiRueckkehr: () => {} }))

const BESTAETIGT = { authorized_user_id: 'u-1', display_name: 'Luca', role: 'superadmin',
  mfa: { pflicht: true, bestaetigt: true, methode: 'passkey' } }
const HALB = { ...BESTAETIGT, mfa: { pflicht: true, bestaetigt: false, methode: null } }

vi.mock('./MfaBestaetigung', () => ({
  default: ({ onBestaetigt }: { onBestaetigt: (u: unknown) => void }) => (
    <button type="button" onClick={() => onBestaetigt(BESTAETIGT)}>Anmeldung bestätigen</button>
  ),
}))

import AdminSite from './AdminSite'

beforeEach(() => {
  getMe.mockReset()
  zaehler.mockReset()
  scopeAktiv.length = 0
})

describe('AdminSite — MFA-Pflicht', () => {
  it('halbe Sitzung: nur die Bestätigung, nichts lädt', async () => {
    getMe.mockResolvedValue(HALB)
    render(<AdminSite />)
    const knopf = await screen.findByRole('button', { name: 'Anmeldung bestätigen' })
    expect(screen.queryByText('Seite der Betreiber')).toBeNull()
    expect(scopeAktiv.every((a) => a === false)).toBe(true)
    expect(zaehler).not.toHaveBeenCalled()

    fireEvent.click(knopf)
    expect(await screen.findByText('Seite der Betreiber')).toBeTruthy()
    expect(scopeAktiv[scopeAktiv.length - 1]).toBe(true)
  })

  it('403 mfa_required mitten in der Arbeit führt zur Bestätigung', async () => {
    getMe.mockResolvedValue(BESTAETIGT)
    render(<AdminSite />)
    await screen.findByText('Seite der Betreiber')
    act(() => { window.dispatchEvent(new CustomEvent('auth:mfa-required')) })
    expect(await screen.findByRole('button', { name: 'Anmeldung bestätigen' })).toBeTruthy()
  })

  it('Konto ohne Pflicht: wie bisher', async () => {
    getMe.mockResolvedValue({ ...BESTAETIGT, mfa: { pflicht: false, bestaetigt: false, methode: null } })
    render(<AdminSite />)
    expect(await screen.findByText('Seite der Betreiber')).toBeTruthy()
  })
})

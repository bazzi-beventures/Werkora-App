/**
 * Einbindung der App-Sperre in die Betreiber-Seite (docs/specs/admin-werkora-ch.md §15).
 *
 * Die Sperre selbst testet AppSperre.test.tsx; hier geht es um die Weiche:
 * im Browser-Tab bleibt der Start, wie er war (vorhandenes Cookie gilt), als
 * App zählt das Cookie nicht — die alte Sitzung wird beendet, und hinein geht
 * es nur über die Sperre. Bei der Rückkehr aus dem Hintergrund legt sie sich
 * ÜBER die Seite, statt sie abzubauen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const getMe = vi.fn()
const logout = vi.fn()
vi.mock('../api/auth', () => ({
  getMe: () => getMe(),
  logout: () => logout(),
}))
vi.mock('../api/featureRequests', () => ({ fetchNewRequestCount: () => Promise.resolve({ count: 0 }) }))
vi.mock('../api/support', () => ({ fetchOpenSupportCount: () => Promise.resolve({ count: 0 }) }))
vi.mock('./useTenantScope', () => ({
  useTenantScope: () => ({ tenantId: null, tenant: null, tenants: [], selectTenant: vi.fn() }),
}))
vi.mock('./AdminSiteShell', () => ({
  default: () => <div>Seite der Betreiber</div>,
  SCREEN_TITEL: {},
}))

let appModus = false
let sperreAktiv = false
let sperren: () => void = () => {}
vi.mock('./appSperreRegeln', () => ({
  istAppModus: () => appModus,
  useSperreBeiRueckkehr: (aktiv: boolean, cb: () => void) => {
    sperreAktiv = aktiv
    sperren = cb
  },
}))

const BETREIBER = { authorized_user_id: 'u-1', display_name: 'Luca', role: 'superadmin' }

vi.mock('./AppSperre', () => ({
  default: ({ onEntsperrt, ueberlagert }: { onEntsperrt: (u: unknown) => void; ueberlagert?: boolean }) => (
    <button type="button" onClick={() => onEntsperrt(BETREIBER)}>
      {ueberlagert ? 'Sperre über der Seite' : 'Sperre statt der Seite'}
    </button>
  ),
}))

import AdminSite from './AdminSite'

beforeEach(() => {
  appModus = false
  sperreAktiv = false
  getMe.mockReset().mockResolvedValue(BETREIBER)
  logout.mockReset().mockResolvedValue(undefined)
})

describe('AdminSite — App-Sperre', () => {
  it('im Browser-Tab: vorhandene Sitzung gilt, keine Sperre', async () => {
    render(<AdminSite />)
    expect(await screen.findByText('Seite der Betreiber')).toBeTruthy()
    expect(logout).not.toHaveBeenCalled()
    expect(sperreAktiv).toBe(false)
  })

  it('als App: alte Sitzung beenden, hinein nur über die Sperre', async () => {
    appModus = true
    render(<AdminSite />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sperre statt der Seite' }))
    expect(logout).toHaveBeenCalledTimes(1)
    expect(getMe).not.toHaveBeenCalled()
    expect(await screen.findByText('Seite der Betreiber')).toBeTruthy()
  })

  it('als App: Rückkehr aus dem Hintergrund legt die Sperre über die Seite', async () => {
    appModus = true
    render(<AdminSite />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sperre statt der Seite' }))
    await screen.findByText('Seite der Betreiber')
    await waitFor(() => expect(sperreAktiv).toBe(true))

    act(() => sperren())
    const sperre = await screen.findByRole('button', { name: 'Sperre über der Seite' })
    // Die Seite darunter bleibt stehen — ungespeicherte Eingaben gehen nicht verloren.
    expect(screen.getByText('Seite der Betreiber')).toBeTruthy()
    expect(sperreAktiv).toBe(false)

    fireEvent.click(sperre)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sperre über der Seite' })).toBeNull())
    expect(screen.getByText('Seite der Betreiber')).toBeTruthy()
  })
})

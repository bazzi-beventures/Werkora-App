/**
 * «Mein Profil» im Admin — Push-Schalter wie in der Mitarbeiter-App, erreichbar
 * über den eigenen Namen in der Leiste (docs/specs/feature-anfragen.md §5.9).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const push = {
  getPushState: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}
vi.mock('../../api/push', () => ({
  getPushState: () => push.getPushState(),
  enablePush: () => push.enablePush(),
  disablePush: () => push.disablePush(),
}))
const logout = vi.fn()
vi.mock('../../api/auth', () => ({ logout: () => logout() }))

import AdminProfileScreen from './AdminProfileScreen'
import AdminSidebar from '../AdminSidebar'
import type { UserInfo } from '../../api/auth'

const USER = {
  authorized_user_id: 'u-1', username: 'luca', display_name: 'Luca Bazzi',
  email: 'luca.bazzi@beventures.ch', staff_id: 's-1', staff_name: 'Luca Bazzi',
  tenant_id: 't-1', role: 'superadmin', consent_version: null, consent_required: false,
  enabled_modules: [],
} as unknown as UserInfo

function renderProfile(user: UserInfo = USER) {
  const onLoggedOut = vi.fn()
  const onToggleTheme = vi.fn()
  render(<AdminProfileScreen user={user} tenantName="Gehlhaar GmbH" theme="light"
                             onToggleTheme={onToggleTheme} onLoggedOut={onLoggedOut} />)
  return { onLoggedOut, onToggleTheme }
}

beforeEach(() => {
  vi.clearAllMocks()
  push.getPushState.mockResolvedValue('unsubscribed')
  push.enablePush.mockResolvedValue(undefined)
  push.disablePush.mockResolvedValue(undefined)
  logout.mockResolvedValue(undefined)
})

describe('AdminProfileScreen', () => {
  it('zeigt Konto und Firma', async () => {
    renderProfile()
    expect(screen.getByText('luca.bazzi@beventures.ch')).toBeTruthy()
    expect(screen.getByText('Gehlhaar GmbH')).toBeTruthy()
    expect(screen.getAllByText('Superadmin').length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getByText('Aus')).toBeTruthy())
  })

  it('Push einschalten und wieder aus', async () => {
    renderProfile()
    const sw = await screen.findByRole('switch', { name: 'Push-Benachrichtigungen' })
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(false))
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    await waitFor(() => expect(push.enablePush).toHaveBeenCalled())
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'))
    fireEvent.click(sw)
    await waitFor(() => expect(push.disablePush).toHaveBeenCalled())
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('false'))
  })

  it('Fehler beim Einschalten erscheint in der Maske, nicht als alert', async () => {
    push.enablePush.mockRejectedValue(new Error('Benachrichtigungen wurden nicht erlaubt.'))
    renderProfile()
    const sw = await screen.findByRole('switch', { name: 'Push-Benachrichtigungen' })
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(sw)
    expect((await screen.findByRole('alert')).textContent).toContain('nicht erlaubt')
  })

  it('im Browser blockiert: Schalter gesperrt, mit Hinweis', async () => {
    push.getPushState.mockResolvedValue('denied')
    renderProfile()
    expect(await screen.findByText('Im Browser blockiert')).toBeTruthy()
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Website-Einstellungen/)).toBeTruthy()
  })

  it('Konto ohne Personaleintrag: Hinweis, dass keine Push ankommt', async () => {
    renderProfile({ ...USER, staff_id: null } as UserInfo)
    expect(await screen.findByRole('note')).toBeTruthy()
    expect(screen.getByRole('note').textContent).toContain('keinem Personaleintrag')
  })

  it('mit Personaleintrag kein Hinweis', async () => {
    renderProfile()
    await screen.findByText('Aus')
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('Abmelden', async () => {
    const { onLoggedOut } = renderProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Abmelden' }))
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalled())
  })
})

describe('AdminSidebar — Name führt ins Profil', () => {
  it('Klick auf den Namen navigiert zu «profile»', () => {
    const onNav = vi.fn()
    render(<AdminSidebar screen="dashboard" onNav={onNav} onLoggedOut={vi.fn()} onSwitchToUser={vi.fn()}
                         displayName="Luca Bazzi" role="superadmin" tenantName="Gehlhaar GmbH"
                         enabledModules={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Luca Bazzi/ }))
    expect(onNav).toHaveBeenCalledWith('profile')
  })
})

/**
 * Push-Empfang auf der Betreiber-Seite (docs/specs/support-antwort.md §13).
 *
 * Geprüft wird, dass die Seite ihr Gerät als `admin` anmeldet — sonst landete
 * die Support-Push weiter in der Werkora-App statt hier.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const getPushState = vi.fn()
const enablePush = vi.fn()
const disablePush = vi.fn()
const sendTestPush = vi.fn()

vi.mock('../api/push', () => ({
  getPushState: () => getPushState(),
  enablePush: (app: string) => enablePush(app),
  disablePush: () => disablePush(),
  sendTestPush: (app: string) => sendTestPush(app),
}))

import AdminPushToggle from './AdminPushToggle'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminPushToggle', () => {
  it('meldet das Gerät als Betreiber-Seite an', async () => {
    getPushState.mockResolvedValue('unsubscribed')
    enablePush.mockResolvedValue(undefined)
    render(<AdminPushToggle />)
    fireEvent.click(await screen.findByRole('button', { name: 'Push aktivieren' }))
    await waitFor(() => expect(enablePush).toHaveBeenCalledWith('admin'))
    expect(await screen.findByText(/ist auf diesem Gerät aktiv/)).not.toBeNull()
  })

  it('testet die Geräte der Betreiber-Seite', async () => {
    getPushState.mockResolvedValue('subscribed')
    sendTestPush.mockResolvedValue({ sent: 1, queued: false })
    render(<AdminPushToggle />)
    fireEvent.click(await screen.findByRole('button', { name: 'Test' }))
    await waitFor(() => expect(sendTestPush).toHaveBeenCalledWith('admin'))
    expect(await screen.findByText('Test gesendet.')).not.toBeNull()
  })

  it('sagt es, wenn der Browser blockiert', async () => {
    getPushState.mockResolvedValue('denied')
    render(<AdminPushToggle />)
    expect(await screen.findByText(/im Browser blockiert/)).not.toBeNull()
  })
})

/**
 * «Anmeldung bestätigen» (docs/specs/betreiber-mfa.md §5.2).
 *
 * Erst nach der Bestätigung geht die Seite auf. Nach dem Handy-Weg bietet der
 * Schirm «Diesen Computer merken» an, nach einem Code «neuen Passkey einrichten».
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiError } from '../api/client'

const getMe = vi.fn()
vi.mock('../api/auth', () => ({ getMe: () => getMe() }))

let unterstuetzt = true
vi.mock('../auth/webauthn', () => ({ passkeySupported: () => unterstuetzt }))

const bestaetige = vi.fn()
const loeseCodeEin = vi.fn()
vi.mock('./betreiberMfa', async (importOriginal) => {
  const echt = await importOriginal<typeof import('./betreiberMfa')>()
  return {
    ...echt,
    bestaetigeMitPasskey: (art: string) => bestaetige(art),
    loeseCodeEin: (c: string) => loeseCodeEin(c),
  }
})

const einrichten = vi.fn()
vi.mock('./adminPasskey', async (importOriginal) => {
  const echt = await importOriginal<typeof import('./adminPasskey')>()
  return { ...echt, adminPasskeyEinrichten: () => einrichten() }
})

import MfaBestaetigung from './MfaBestaetigung'
import type { UserInfo } from '../api/auth'

const HALB = { display_name: 'Luca', role: 'superadmin', mfa: { pflicht: true, bestaetigt: false, methode: null } } as unknown as UserInfo
const BESTAETIGT = { ...HALB, mfa: { pflicht: true, bestaetigt: true, methode: 'passkey' } } as unknown as UserInfo

beforeEach(() => {
  unterstuetzt = true
  getMe.mockReset().mockResolvedValue(BESTAETIGT)
  bestaetige.mockReset().mockResolvedValue(undefined)
  loeseCodeEin.mockReset().mockResolvedValue(9)
  einrichten.mockReset().mockResolvedValue({})
})

describe('MfaBestaetigung', () => {
  it('Handy per QR, dann «Diesen Computer merken?» — «Nicht jetzt» öffnet die Seite', async () => {
    const onBestaetigt = vi.fn()
    render(<MfaBestaetigung user={HALB} onBestaetigt={onBestaetigt} onAbmelden={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mit dem Handy (QR-Code)' }))
    expect(await screen.findByText('Diesen Computer merken?')).toBeTruthy()
    expect(bestaetige).toHaveBeenCalledWith('handy')
    expect(onBestaetigt).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Nicht jetzt' }))
    expect(onBestaetigt).toHaveBeenCalledWith(BESTAETIGT)
  })

  it('Computer merken legt einen Passkey an und öffnet dann die Seite', async () => {
    const onBestaetigt = vi.fn()
    render(<MfaBestaetigung user={HALB} onBestaetigt={onBestaetigt} onAbmelden={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mit dem Handy (QR-Code)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Passkey auf diesem Gerät einrichten' }))
    await waitFor(() => expect(onBestaetigt).toHaveBeenCalledWith(BESTAETIGT))
    expect(einrichten).toHaveBeenCalledTimes(1)
  })

  it('mit diesem Computer: kein Angebot, direkt hinein', async () => {
    const onBestaetigt = vi.fn()
    render(<MfaBestaetigung user={HALB} onBestaetigt={onBestaetigt} onAbmelden={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Mit diesem Computer/ }))
    await waitFor(() => expect(onBestaetigt).toHaveBeenCalledWith(BESTAETIGT))
    expect(bestaetige).toHaveBeenCalledWith('computer')
  })

  it('Wiederherstellungscode: danach neuen Passkey anbieten, Codes-Stand zeigen', async () => {
    const onBestaetigt = vi.fn()
    render(<MfaBestaetigung user={HALB} onBestaetigt={onBestaetigt} onAbmelden={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wiederherstellungscode verwenden' }))
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'k7qxm-2pd9r' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    expect(await screen.findByText('Neuen Passkey einrichten')).toBeTruthy()
    expect(screen.getByText(/Noch 9 Wiederherstellungscodes übrig/)).toBeTruthy()
    expect(loeseCodeEin).toHaveBeenCalledWith('k7qxm-2pd9r')
    fireEvent.click(screen.getByRole('button', { name: 'Später' }))
    expect(onBestaetigt).toHaveBeenCalledWith(BESTAETIGT)
  })

  it('falscher Code: Meldung, Seite bleibt zu', async () => {
    loeseCodeEin.mockRejectedValue(new ApiError(400, 'Der Code stimmt nicht oder wurde schon benutzt.', 'code_ungueltig'))
    const onBestaetigt = vi.fn()
    render(<MfaBestaetigung user={HALB} onBestaetigt={onBestaetigt} onAbmelden={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wiederherstellungscode verwenden' }))
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'AAAAA-00000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    expect(await screen.findByText('Der Code stimmt nicht oder wurde schon benutzt.')).toBeTruthy()
    expect(onBestaetigt).not.toHaveBeenCalled()
  })

  it('in der App: ein Knopf, kein Handy-QR, kein Angebot danach', async () => {
    const onBestaetigt = vi.fn()
    render(<MfaBestaetigung user={HALB} appModus onBestaetigt={onBestaetigt} onAbmelden={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Mit dem Handy (QR-Code)' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mit Passkey bestätigen' }))
    await waitFor(() => expect(onBestaetigt).toHaveBeenCalledWith(BESTAETIGT))
    expect(bestaetige).toHaveBeenCalledWith('auto')
  })

  it('Browser ohne Passkeys: nur der Code-Weg', () => {
    unterstuetzt = false
    render(<MfaBestaetigung user={HALB} onBestaetigt={vi.fn()} onAbmelden={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Mit dem Handy (QR-Code)' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Wiederherstellungscode verwenden' })).toBeTruthy()
  })
})

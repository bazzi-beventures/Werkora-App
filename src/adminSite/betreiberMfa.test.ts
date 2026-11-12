/**
 * Bestätigung des Betreiber-Kontos (docs/specs/betreiber-mfa.md §6.4).
 *
 * Die QR-Bestätigung baut Werkora nicht selbst: «Mit dem Handy» bittet den
 * Browser per `hints: ['hybrid']` um seinen eigenen QR-Code. Hier wird
 * festgehalten, dass die Knöpfe genau das schicken — und dass die Verwaltung
 * bei einer zu alten Bestätigung einmal bestätigt und dann wiederholt.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiError } from '../api/client'

const apiFetch = vi.fn()
vi.mock('../api/client', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../api/client')>()
  return { ...echt, apiFetch: (...a: unknown[]) => apiFetch(...a) }
})

import { bestaetigeMitPasskey, brauchtBestaetigung, mitBestaetigung } from './betreiberMfa'

const OPTIONEN = {
  challenge: 'Y2hhbGxlbmdl',
  rpId: 'admin.werkora.ch',
  allowCredentials: [{ id: 'Y3JlZA', type: 'public-key', transports: ['internal', 'hybrid'] }],
  userVerification: 'required',
  timeout: 120000,
}

const getCredential = vi.fn()

function geraetSigniert() {
  const buf = new Uint8Array([1, 2, 3]).buffer
  getCredential.mockResolvedValue({
    id: 'Y3JlZA', rawId: buf, type: 'public-key',
    response: { clientDataJSON: buf, authenticatorData: buf, signature: buf, userHandle: null },
  })
}

beforeEach(() => {
  apiFetch.mockReset().mockImplementation(async (pfad: string) => (
    pfad.endsWith('passkey-begin') ? OPTIONEN : { status: 'ok' }
  ))
  getCredential.mockReset()
  geraetSigniert()
  Object.defineProperty(navigator, 'credentials', {
    value: { get: getCredential }, configurable: true,
  })
})

describe('bestaetigeMitPasskey', () => {
  it.each([
    ['handy', ['hybrid']],
    ['computer', ['client-device']],
  ] as const)('%s schickt hints %j', async (art, hints) => {
    await bestaetigeMitPasskey(art)
    const { publicKey } = getCredential.mock.calls[0][0]
    expect(publicKey.hints).toEqual(hints)
    expect(publicKey.rpId).toBe('admin.werkora.ch')
    expect(publicKey.userVerification).toBe('required')
    // Die Transportwege gehen mit — so kennt der Browser den Handy-Weg.
    expect(publicKey.allowCredentials[0].transports).toEqual(['internal', 'hybrid'])
    expect(apiFetch).toHaveBeenLastCalledWith('/pwa/auth/mfa/passkey-complete', expect.anything())
  })

  it('auto lässt den Browser wählen (App am Handy)', async () => {
    await bestaetigeMitPasskey('auto')
    expect(getCredential.mock.calls[0][0].publicKey.hints).toBeUndefined()
  })

  it.each([
    ['platform', 'lokal'],
    ['cross-platform', 'anderes_geraet'],
    [undefined, 'unbekannt'],
  ] as const)('authenticatorAttachment %s → %s', async (attachment, erwartet) => {
    const buf = new Uint8Array([1, 2, 3]).buffer
    getCredential.mockResolvedValue({
      id: 'Y3JlZA', rawId: buf, type: 'public-key', authenticatorAttachment: attachment,
      response: { clientDataJSON: buf, authenticatorData: buf, signature: buf, userHandle: null },
    })
    await expect(bestaetigeMitPasskey('handy')).resolves.toBe(erwartet)
  })
})

describe('mitBestaetigung', () => {
  it('bestätigt einmal mit Passkey und wiederholt dann', async () => {
    const aktion = vi.fn()
      .mockRejectedValueOnce(new ApiError(403, 'Bitte zuerst mit Passkey bestätigen.', 'bestaetigung_erforderlich'))
      .mockResolvedValueOnce('fertig')
    await expect(mitBestaetigung(aktion)).resolves.toBe('fertig')
    expect(aktion).toHaveBeenCalledTimes(2)
    expect(getCredential).toHaveBeenCalledTimes(1)
  })

  it('andere Fehler gehen durch, ohne Passkey-Abfrage', async () => {
    const aktion = vi.fn().mockRejectedValue(new ApiError(409, 'Das ist der letzte Faktor.', 'letzter_faktor'))
    await expect(mitBestaetigung(aktion)).rejects.toBeInstanceOf(ApiError)
    expect(getCredential).not.toHaveBeenCalled()
  })
})

describe('brauchtBestaetigung', () => {
  it('erkennt beide Formen des Servers', () => {
    // betreiber_mfa.py: {code, message}; admin_passkey.py: nackter Code.
    expect(brauchtBestaetigung(new ApiError(403, 'Bitte …', 'bestaetigung_erforderlich'))).toBe(true)
    expect(brauchtBestaetigung(new ApiError(403, 'bestaetigung_erforderlich'))).toBe(true)
    expect(brauchtBestaetigung(new ApiError(403, 'Anmeldung noch nicht bestätigt.', 'mfa_required'))).toBe(true)
    expect(brauchtBestaetigung(new ApiError(403, 'superadmin_required'))).toBe(false)
  })
})

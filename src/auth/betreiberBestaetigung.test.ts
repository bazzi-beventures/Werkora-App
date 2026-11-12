/**
 * Mandanten-App: der Hinweis für Betreiber-Konten erscheint nur bei
 * `superadmin` mit Pflicht und unbestätigter Sitzung — für alle anderen
 * Konten ändert sich in der App nichts (docs/specs/betreiber-mfa.md §6.10).
 */
import { describe, it, expect } from 'vitest'
import type { UserInfo } from '../api/auth'
import { brauchtBetreiberBestaetigung } from './betreiberBestaetigung'

const konto = (role: string, mfa: UserInfo['mfa']) => ({ role, mfa }) as unknown as UserInfo

describe('brauchtBetreiberBestaetigung', () => {
  it('nur Betreiber mit Pflicht und ohne Bestätigung', () => {
    expect(brauchtBetreiberBestaetigung(konto('superadmin', { pflicht: true, bestaetigt: false, methode: null }))).toBe(true)
    expect(brauchtBetreiberBestaetigung(konto('superadmin', { pflicht: true, bestaetigt: true, methode: 'passkey' }))).toBe(false)
    expect(brauchtBetreiberBestaetigung(konto('superadmin', { pflicht: false, bestaetigt: false, methode: null }))).toBe(false)
    expect(brauchtBetreiberBestaetigung(konto('management', null))).toBe(false)
    expect(brauchtBetreiberBestaetigung(konto('user', undefined))).toBe(false)
    expect(brauchtBetreiberBestaetigung(null)).toBe(false)
  })
})

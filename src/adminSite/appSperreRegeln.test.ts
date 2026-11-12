/**
 * Wann die App-Sperre der Betreiber-Seite greift (docs/specs/admin-werkora-ch.md §15).
 *
 * Zwei Dinge, an denen alles hängt: die Sperre gilt NUR als installierte App
 * (im Browser-Tab bleibt es beim Passwort + Cookie), und sie kommt bei der
 * Rückkehr aus dem Hintergrund nach einer Minute wieder — gemessen an der
 * Wanduhr, weil iOS Timer im Hintergrund einfriert.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  SPERRE_NACH_MS,
  gemerktesKonto,
  istAppModus,
  kontoMerken,
  kontoVergessen,
  useSperreBeiRueckkehr,
} from './appSperreRegeln'
import { SK } from '../api/storageKeys'

function setzeStandalone(wert: boolean | undefined) {
  Object.defineProperty(window.navigator, 'standalone', { value: wert, configurable: true })
}

function setzeDisplayMode(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: standalone && q === '(display-mode: standalone)',
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function sichtbarkeit(zustand: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { value: zustand, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('istAppModus', () => {
  afterEach(() => setzeStandalone(undefined))

  it('im Browser-Tab: keine Sperre', () => {
    setzeStandalone(undefined)
    setzeDisplayMode(false)
    expect(istAppModus()).toBe(false)
  })

  it('installiert (display-mode: standalone): Sperre', () => {
    setzeStandalone(undefined)
    setzeDisplayMode(true)
    expect(istAppModus()).toBe(true)
  })

  it('iOS-Home-Bildschirm (navigator.standalone): Sperre', () => {
    setzeStandalone(true)
    setzeDisplayMode(false)
    expect(istAppModus()).toBe(true)
  })
})

describe('gemerktes Konto', () => {
  beforeEach(() => localStorage.clear())

  it('hin und zurück', () => {
    const k = { authorizedUserId: 'u-1', tenantSlug: 'werkora', displayName: 'Luca' }
    kontoMerken(k)
    expect(gemerktesKonto()).toEqual(k)
    kontoVergessen()
    expect(gemerktesKonto()).toBeNull()
  })

  it('ein kaputter Eintrag gilt als keiner', () => {
    localStorage.setItem(SK.ADMIN_PASSKEY_KONTO, '{kein json')
    expect(gemerktesKonto()).toBeNull()
    localStorage.setItem(SK.ADMIN_PASSKEY_KONTO, JSON.stringify({ tenantSlug: 'werkora' }))
    expect(gemerktesKonto()).toBeNull()
  })
})

describe('useSperreBeiRueckkehr', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-12T08:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    sichtbarkeit('visible')
  })

  it('kurzer Abstecher sperrt nicht', () => {
    const onSperren = vi.fn()
    renderHook(() => useSperreBeiRueckkehr(true, onSperren))
    sichtbarkeit('hidden')
    vi.setSystemTime(Date.now() + SPERRE_NACH_MS - 1_000)
    sichtbarkeit('visible')
    expect(onSperren).not.toHaveBeenCalled()
  })

  it('nach einer Minute im Hintergrund sperrt die Rückkehr', () => {
    const onSperren = vi.fn()
    renderHook(() => useSperreBeiRueckkehr(true, onSperren))
    sichtbarkeit('hidden')
    vi.setSystemTime(Date.now() + SPERRE_NACH_MS)
    sichtbarkeit('visible')
    expect(onSperren).toHaveBeenCalledTimes(1)
  })

  it('inaktiv (Browser-Tab, nicht angemeldet) passiert nichts', () => {
    const onSperren = vi.fn()
    renderHook(() => useSperreBeiRueckkehr(false, onSperren))
    sichtbarkeit('hidden')
    vi.setSystemTime(Date.now() + 10 * SPERRE_NACH_MS)
    sichtbarkeit('visible')
    expect(onSperren).not.toHaveBeenCalled()
  })
})

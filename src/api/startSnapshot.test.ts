import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  clearStartSnapshots, loadStartSnapshot, saveBrandingSnapshot, saveMeSnapshot, withTimeout,
} from './startSnapshot'
import type { TenantInfo, UserInfo } from './auth'

// docs/specs/pwa-neuladen.md §3.5

const me = (id: string) => ({ authorized_user_id: id, display_name: id }) as unknown as UserInfo
const branding = { name: 'Muster AG', brand_color: '#123456' } as unknown as TenantInfo

describe('Start-Snapshot', () => {
  beforeEach(() => localStorage.clear())

  it('je Konto: /pwa/me und Branding getrennt nachgeführt', () => {
    saveMeSnapshot(me('u1'))
    saveBrandingSnapshot('u1', branding)
    const s = loadStartSnapshot('u1')
    expect(s?.me?.display_name).toBe('u1')
    expect(s?.branding?.name).toBe('Muster AG')
    expect(loadStartSnapshot('u2')).toBeNull()
    expect(loadStartSnapshot(null)).toBeNull()
  })

  it('ein /pwa/me eines anderen Kontos unter dem Key gilt nicht', () => {
    localStorage.setItem('start-snapshot:u1', JSON.stringify({ me: me('u2'), branding: null }))
    expect(loadStartSnapshot('u1')?.me).toBeNull()
  })

  it('kaputter Inhalt: kein Snapshot statt Absturz', () => {
    localStorage.setItem('start-snapshot:u1', '{kaputt')
    expect(loadStartSnapshot('u1')).toBeNull()
  })

  it('Abmelden räumt alle Snapshots weg, sonst nichts', () => {
    saveMeSnapshot(me('u1'))
    saveMeSnapshot(me('u2'))
    localStorage.setItem('anderes', 'x')
    clearStartSnapshots()
    expect(loadStartSnapshot('u1')).toBeNull()
    expect(loadStartSnapshot('u2')).toBeNull()
    expect(localStorage.getItem('anderes')).toBe('x')
  })
})

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('liefert den Wert, wenn er rechtzeitig kommt', async () => {
    await expect(withTimeout(Promise.resolve(7), 5000)).resolves.toEqual({ timedOut: false, value: 7 })
  })

  it('meldet den Ablauf, ohne das Versprechen abzubrechen', async () => {
    const p = withTimeout(new Promise(() => {}), 5000)
    vi.advanceTimersByTime(5000)
    await expect(p).resolves.toEqual({ timedOut: true })
  })

  it('reicht einen Fehler durch', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 5000)).rejects.toThrow('x')
  })
})

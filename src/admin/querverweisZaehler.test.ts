import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ABLIEFERN_MS, MAX_ANZAHL, MAX_EINTRAEGE, liefereAb, nimmBlock, zaehleSprung,
} from './querverweisZaehler'
import type { AdminScreen } from './useAdminNav'

describe('querverweisZaehler', () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response('{"status":"ok"}')))

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockClear()
    nimmBlock()
  })
  afterEach(() => {
    liefereAb()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('zählt gleiche Sprünge zusammen und trennt nach Weg', () => {
    zaehleSprung('projects', 'project-schedule', 'link')
    zaehleSprung('projects', 'project-schedule', 'link')
    zaehleSprung('dashboard', 'project-schedule', 'menu')
    expect(nimmBlock()).toEqual([
      { von: 'projects', nach: 'project-schedule', weg: 'link', anzahl: 2 },
      { von: 'dashboard', nach: 'project-schedule', weg: 'menu', anzahl: 1 },
    ])
  })

  it('ein Sprung auf denselben Screen zählt nicht', () => {
    zaehleSprung('projects', 'projects', 'link')
    expect(nimmBlock()).toEqual([])
  })

  it('liefert nach einer Minute gebündelt ab — ohne Konto, mit keepalive', () => {
    zaehleSprung('projects', 'customers', 'link')
    zaehleSprung('customers', 'projects', 'link')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(ABLIEFERN_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/pwa\/admin\/querverweise$/)
    expect(init.keepalive).toBe(true)
    expect(JSON.parse(String(init.body))).toEqual({
      eintraege: [
        { von: 'projects', nach: 'customers', weg: 'link', anzahl: 1 },
        { von: 'customers', nach: 'projects', weg: 'link', anzahl: 1 },
      ],
    })
  })

  it('liefert beim Verstecken der Seite sofort ab, ein leerer Puffer schickt nichts', () => {
    zaehleSprung('tasks', 'projects', 'link')
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('hält die Deckel des Servers ein', () => {
    for (let i = 0; i < MAX_ANZAHL + 10; i++) zaehleSprung('projects', 'quotes', 'link')
    for (let i = 0; i < MAX_EINTRAEGE + 10; i++) {
      zaehleSprung(`screen-${i}` as AdminScreen, 'projects', 'link')
    }
    const block = nimmBlock()
    expect(block).toHaveLength(MAX_EINTRAEGE)
    expect(block[0].anzahl).toBe(MAX_ANZAHL)
  })

  it('ein Netzfehler bleibt still', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')))
    zaehleSprung('projects', 'invoices', 'link')
    expect(() => liefereAb()).not.toThrow()
    await Promise.resolve()
  })
})

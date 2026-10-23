import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// docs/specs/pwa-neuladen.md §3.2: die Rückkehr in die App (auch die aus Kamera
// oder Dateiauswahl) prüft höchstens alle 15 Minuten auf ein neues sw.js. Ein
// gefundenes Update lädt die Seite ohne Rückfrage neu — jede ungedrosselte
// Prüfung war eine Gelegenheit, den Monteur mitten im Rapport zu unterbrechen.

let onRegistered: ((url: string, reg: { update: () => Promise<void> }) => void) | undefined
vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts: { onRegisteredSW: typeof onRegistered }) => { onRegistered = opts.onRegisteredSW },
}))

import { registerPwaUpdates, updatePruefungFaellig, UPDATE_PRUEF_ABSTAND_MS } from './registerSW'

describe('updatePruefungFaellig', () => {
  it('prüft beim ersten Mal und nach Ablauf des Abstands', () => {
    expect(updatePruefungFaellig(1000, null)).toBe(true)
    expect(updatePruefungFaellig(UPDATE_PRUEF_ABSTAND_MS, 0)).toBe(true)
  })

  it('prüft nicht innerhalb des Abstands', () => {
    expect(updatePruefungFaellig(UPDATE_PRUEF_ABSTAND_MS - 1, 0)).toBe(false)
  })
})

describe('registerPwaUpdates', () => {
  const update = vi.fn(() => Promise.resolve())
  // Die Handler direkt abgreifen statt Events zu feuern: Listener auf
  // document/window überleben den einzelnen Test, und jedes beforeEach
  // registrierte sonst einen weiteren.
  let handler: Record<string, () => void>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T08:00:00Z'))
    update.mockClear()
    handler = {}
    const greife = (name: string, fn: unknown) => { handler[name] = fn as () => void }
    vi.spyOn(document, 'addEventListener').mockImplementation(greife)
    vi.spyOn(window, 'addEventListener').mockImplementation(greife)
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
    registerPwaUpdates()
    onRegistered?.('sw.js', { update })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const zurueck = () => handler.visibilitychange()

  it('prüft beim Zurückkehren nicht, solange die Registrierung frisch ist', () => {
    vi.advanceTimersByTime(60 * 1000)
    zurueck()
    expect(update).not.toHaveBeenCalled()
  })

  it('prüft nach 15 Minuten wieder — und danach erst 15 Minuten später', () => {
    vi.advanceTimersByTime(UPDATE_PRUEF_ABSTAND_MS)
    zurueck()
    expect(update).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5 * 60 * 1000)
    zurueck()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('prüft beim Wieder-online-Gehen ungedrosselt', () => {
    handler.online()
    expect(update).toHaveBeenCalledTimes(1)
  })
})

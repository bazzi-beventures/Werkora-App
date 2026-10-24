import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import viteConfig from '../../vite.config.ts?raw'

// docs/specs/pwa-neuladen.md §3.1/§3.2: die Rückkehr in die App prüft höchstens
// alle 15 Minuten auf ein neues sw.js, und ein gefundenes Update lädt erst neu,
// wenn es niemanden stört — beim Kaltstart, nach ≥ 30 min im Hintergrund oder
// nach 10 min Leerlauf, und nie, solange `canReloadNow()` Nein sagt.

type Registered = (url: string, reg: { update: () => Promise<void> }) => void
let onRegistered: Registered | undefined
let onNeedRefresh: (() => void) | undefined
const updateSW = vi.fn((_reload?: boolean) => Promise.resolve())
vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts: { onRegisteredSW: Registered; onNeedRefresh: () => void }) => {
    onRegistered = opts.onRegisteredSW
    onNeedRefresh = opts.onNeedRefresh
    return updateSW
  },
}))

import {
  KALTSTART_FENSTER_MS, LEERLAUF_NACH_MS, RUECKKEHR_NACH_MS, UPDATE_PRUEF_ABSTAND_MS,
  registerPwaUpdates, updateJetztAnwenden, updatePruefungFaellig, type UpdateLage,
} from './registerSW'
import {
  beginMutation, endMutation, registerReloadBlocker, resetReloadGuard, setClientUpdateUrgent,
} from './reloadGuard'

describe('Ratchet: kein Zwangs-Reload', () => {
  it('vite.config.ts steht auf «prompt», nicht auf «autoUpdate», und ohne skipWaiting', () => {
    expect(viteConfig).not.toMatch(/registerType:\s*'autoUpdate'/)
    expect(viteConfig).toMatch(/registerType:\s*'prompt'/)
    expect(viteConfig).not.toMatch(/skipWaiting:\s*true/)
  })
})

describe('updatePruefungFaellig', () => {
  it('prüft beim ersten Mal und nach Ablauf des Abstands', () => {
    expect(updatePruefungFaellig(1000, null)).toBe(true)
    expect(updatePruefungFaellig(UPDATE_PRUEF_ABSTAND_MS, 0)).toBe(true)
  })

  it('prüft nicht innerhalb des Abstands', () => {
    expect(updatePruefungFaellig(UPDATE_PRUEF_ABSTAND_MS - 1, 0)).toBe(false)
  })
})

describe('updateJetztAnwenden', () => {
  const T0 = 1_000_000_000
  const lage = (over: Partial<UpdateLage>): UpdateLage => ({
    jetzt: T0 + 60 * 1000, gestartet: T0, letzteEingabe: T0 + 5000, rueckkehr: null,
    sichtbar: true, dringend: false, frei: true, ...over,
  })

  it('Kaltstart: kurz nach dem Laden und noch keine Eingabe', () => {
    expect(updateJetztAnwenden(lage({ jetzt: T0 + 3000, letzteEingabe: null }))).toBe(true)
    expect(updateJetztAnwenden(lage({ jetzt: T0 + KALTSTART_FENSTER_MS + 1, letzteEingabe: null })))
      .toBe(false)
    // Schon getippt: kein Kaltstart mehr.
    expect(updateJetztAnwenden(lage({ jetzt: T0 + 3000, letzteEingabe: T0 + 2000 }))).toBe(false)
  })

  it('Rückkehr erst nach 30 Minuten weg — dringend nach jeder', () => {
    const zurueck = { at: T0 + 50 * 1000, wegMs: RUECKKEHR_NACH_MS }
    expect(updateJetztAnwenden(lage({ rueckkehr: zurueck }))).toBe(true)
    const kurz = { at: T0 + 50 * 1000, wegMs: 5 * 60 * 1000 }
    expect(updateJetztAnwenden(lage({ rueckkehr: kurz }))).toBe(false)
    expect(updateJetztAnwenden(lage({ rueckkehr: kurz, dringend: true }))).toBe(true)
  })

  it('Rückkehr zählt nicht mehr, sobald seither jemand etwas angetippt hat', () => {
    const zurueck = { at: T0 + 50 * 1000, wegMs: RUECKKEHR_NACH_MS }
    expect(updateJetztAnwenden(lage({ rueckkehr: zurueck, letzteEingabe: T0 + 55 * 1000 })))
      .toBe(false)
  })

  it('Leerlauf: 10 Minuten sichtbar ohne Eingabe', () => {
    expect(updateJetztAnwenden(lage({ jetzt: T0 + 5000 + LEERLAUF_NACH_MS }))).toBe(true)
    expect(updateJetztAnwenden(lage({ jetzt: T0 + 5000 + LEERLAUF_NACH_MS - 1 }))).toBe(false)
    expect(updateJetztAnwenden(lage({ jetzt: T0 + 5000 + LEERLAUF_NACH_MS, sichtbar: false })))
      .toBe(false)
  })

  it('nie, solange etwas verloren ginge', () => {
    expect(updateJetztAnwenden(lage({ jetzt: T0 + 3000, letzteEingabe: null, frei: false })))
      .toBe(false)
    expect(updateJetztAnwenden(lage({ jetzt: T0 + LEERLAUF_NACH_MS * 3, frei: false }))).toBe(false)
  })
})

describe('registerPwaUpdates', () => {
  const update = vi.fn(() => Promise.resolve())
  // Die Handler direkt abgreifen statt Events zu feuern: Listener auf
  // document/window überleben den einzelnen Test, und jedes beforeEach
  // registrierte sonst einen weiteren.
  let handler: Record<string, () => void>
  let sichtbar: DocumentVisibilityState

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T08:00:00Z'))
    update.mockClear()
    updateSW.mockClear()
    resetReloadGuard()
    handler = {}
    sichtbar = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => sichtbar)
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

  const zurueck = () => { sichtbar = 'visible'; handler.visibilitychange() }
  const weg = () => { sichtbar = 'hidden'; handler.visibilitychange() }
  const tippt = () => handler.pointerdown()

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

  it('ein beim Start wartendes Update greift sofort', () => {
    vi.advanceTimersByTime(2000)
    onNeedRefresh?.()
    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('ein Update mitten in der Arbeit wartet — bis zur Rückkehr nach 30 Minuten', () => {
    vi.advanceTimersByTime(60 * 1000)
    tippt()
    onNeedRefresh?.()
    expect(updateSW).not.toHaveBeenCalled()
    // Kurz weg (Kamera): kein Reload.
    weg()
    vi.advanceTimersByTime(2 * 60 * 1000)
    zurueck()
    expect(updateSW).not.toHaveBeenCalled()
    tippt()
    // Lange weg: beim Zurückkommen.
    weg()
    vi.advanceTimersByTime(RUECKKEHR_NACH_MS)
    zurueck()
    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('Rückkehr, deren Prüfung erst danach ein Update findet, greift auch', () => {
    vi.advanceTimersByTime(60 * 1000)
    tippt()
    weg()
    vi.advanceTimersByTime(RUECKKEHR_NACH_MS)
    zurueck()
    vi.advanceTimersByTime(3000)
    onNeedRefresh?.()
    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('dringend: schon nach kurzer Abwesenheit', () => {
    vi.advanceTimersByTime(60 * 1000)
    tippt()
    onNeedRefresh?.()
    setClientUpdateUrgent(true)
    weg()
    vi.advanceTimersByTime(60 * 1000)
    zurueck()
    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('Leerlauf: nach 10 Minuten ohne Eingabe', () => {
    vi.advanceTimersByTime(60 * 1000)
    tippt()
    onNeedRefresh?.()
    vi.advanceTimersByTime(LEERLAUF_NACH_MS - 60 * 1000)
    expect(updateSW).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2 * 60 * 1000)
    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('nie bei angefangenem Rapport oder laufendem Upload', () => {
    vi.advanceTimersByTime(2000)
    const abmelden = registerReloadBlocker(() => true)
    onNeedRefresh?.()
    vi.advanceTimersByTime(LEERLAUF_NACH_MS * 2)
    expect(updateSW).not.toHaveBeenCalled()
    abmelden()
    beginMutation()
    vi.advanceTimersByTime(2 * 60 * 1000)
    expect(updateSW).not.toHaveBeenCalled()
    endMutation()
    vi.advanceTimersByTime(60 * 1000)
    expect(updateSW).toHaveBeenCalledWith(true)
  })
})

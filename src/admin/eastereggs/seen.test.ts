import { beforeEach, describe, expect, it, vi } from 'vitest'
import { alreadySeen, markSeen } from './seen'

// Spec docs/specs/eastereggs.md §4

const USER = 'user-1'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('Merkliste der gefeierten Meilensteine', () => {
  it('kennt vor dem ersten Mal nichts', () => {
    expect(alreadySeen('projects', USER, 100)).toBe(false)
  })

  it('merkt einen gefeierten Meilenstein', () => {
    markSeen('projects', USER, 100)
    expect(alreadySeen('projects', USER, 100)).toBe(true)
  })

  it('lässt den nächsten Meilenstein wieder zu', () => {
    markSeen('projects', USER, 100)
    expect(alreadySeen('projects', USER, 200)).toBe(false)
  })

  it('reicht übersprungene Meilensteine NICHT nach', () => {
    // Wer bei 300 wieder hereinschaut, soll die 200 nicht nachgeliefert
    // bekommen — gefeiert wird der aktuelle Stand oder gar nichts.
    markSeen('projects', USER, 300)
    expect(alreadySeen('projects', USER, 200)).toBe(true)
  })

  it('hält die beiden Eier auseinander', () => {
    markSeen('projects', USER, 100)
    expect(alreadySeen('revenue', USER, 100)).toBe(false)
  })

  it('hält die Konten auseinander — Bürorechner teilen sich einen Browser', () => {
    markSeen('projects', USER, 100)
    expect(alreadySeen('projects', 'user-2', 100)).toBe(false)
  })

  it('gilt bei gesperrtem Speicher als «noch nichts gesehen»', () => {
    // Die andere Richtung wäre schlimmer: dann liefe das Ei nie, und niemand
    // fände heraus, warum.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blockiert') })
    expect(alreadySeen('projects', USER, 100)).toBe(false)
  })

  it('reisst bei gesperrtem Speicher nichts mit', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('voll') })
    expect(() => markSeen('projects', USER, 100)).not.toThrow()
  })

  it('ignoriert einen unlesbaren Wert im Speicher', () => {
    localStorage.setItem(`easteregg-projects:${USER}`, 'kaputt')
    expect(alreadySeen('projects', USER, 100)).toBe(false)
  })
})

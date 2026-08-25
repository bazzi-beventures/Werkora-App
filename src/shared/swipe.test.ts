import { describe, expect, it } from 'vitest'
import { SWIPE_MIN_PX, swipeDirection } from './swipe'

describe('swipeDirection', () => {
  it('erkennt die Richtung ab der Mindeststrecke', () => {
    expect(swipeDirection(-SWIPE_MIN_PX, 0)).toBe('left')
    expect(swipeDirection(SWIPE_MIN_PX, 0)).toBe('right')
  })

  it('ignoriert kurze Berührungen — ein Tippen ist kein Wischen', () => {
    expect(swipeDirection(-20, 0)).toBeNull()
    expect(swipeDirection(SWIPE_MIN_PX - 1, 0)).toBeNull()
  })

  it('ignoriert das schräge Scrollen durch eine lange Liste', () => {
    // Waagrecht weit genug, aber senkrecht noch weiter: der Daumen scrollt.
    expect(swipeDirection(-60, 120)).toBeNull()
    expect(swipeDirection(60, -120)).toBeNull()
    // Umgekehrt: deutlich waagrecht, leichter Bogen nach unten — das zählt.
    expect(swipeDirection(-90, 20)).toBe('left')
  })
})

import { describe, expect, it } from 'vitest'
import { stepParticle, type Particle } from './particles'

// Die Physik beider Animationen. Prüfbar, weil der Schritt rein ist —
// am Canvas selbst liesse sich das nur mit dem Auge kontrollieren.

const OPTS = { gravity: 900, drag: 0.985, floor: 400 }

function teilchen(over: Partial<Particle> = {}): Particle {
  return {
    x: 100, y: 100, vx: 200, vy: -300,
    rot: 0, vrot: 1, spin: 0, vspin: 2,
    spawnAt: 0, age: 0, ...over,
  }
}

describe('stepParticle', () => {
  it('beschleunigt nach unten', () => {
    const p = teilchen({ vy: 0 })
    stepParticle(p, 0.1, OPTS)
    expect(p.vy).toBeCloseTo(90)
  })

  it('bremst die Seitwärtsbewegung', () => {
    const p = teilchen({ vx: 200 })
    stepParticle(p, 0.1, OPTS)
    expect(p.vx).toBeLessThan(200)
  })

  it('dreht und taumelt weiter', () => {
    const p = teilchen()
    stepParticle(p, 0.5, OPTS)
    expect(p.rot).toBeCloseTo(0.5)
    expect(p.spin).toBeCloseTo(1)
  })

  it('meldet sich ab, sobald es unter dem Boden liegt', () => {
    const p = teilchen({ y: 399, vy: 1000 })
    expect(stepParticle(p, 0.1, OPTS)).toBe(false)
  })

  it('bleibt liegen, solange seine Zeit noch nicht gekommen ist', () => {
    // Nachzügler eines verteilten Wurfs: sie stehen still, bis `spawnAt`
    // erreicht ist — sonst platzt der ganze Schwall im ersten Frame.
    const p = teilchen({ spawnAt: 2, y: 100 })
    stepParticle(p, 0.5, OPTS)
    expect(p.y).toBe(100)
    expect(p.age).toBeCloseTo(0.5)
  })

  it('fliegt los, sobald seine Zeit gekommen ist', () => {
    const p = teilchen({ spawnAt: 0.4, y: 100 })
    stepParticle(p, 0.3, OPTS)
    expect(p.y).toBe(100)
    stepParticle(p, 0.3, OPTS)
    expect(p.y).not.toBe(100)
  })
})

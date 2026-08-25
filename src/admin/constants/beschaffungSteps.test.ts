import { describe, it, expect } from 'vitest'
import {
  BESCHAFFUNG_STEPS, beschaffungStep, enabledBeschaffungSteps, daysSince,
} from './beschaffungSteps'

describe('Beschaffungs-Katalog', () => {
  it('hat aufsteigende, eindeutige Ränge', () => {
    // Muss zu BESCHAFFUNG_STEPS in feature_registry.py passen — sonst zeigt die Liste
    // eine andere Reihenfolge als die serverseitige Sortierung über workflow_rank.
    const ranks = BESCHAFFUNG_STEPS.map(s => s.rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(new Set(ranks).size).toBe(ranks.length)
  })

  it('kennt die Schlüssel, die das Backend automatisch setzt', () => {
    // Spiegel von AUTO_STEP_BY_CATEGORY: kommt ein unbekannter Schlüssel zurück,
    // bliebe das Badge nach dem Upload leer.
    for (const key of ['ab_offen', 'lieferung_offen', 'montage_offen']) {
      expect(beschaffungStep(key)).not.toBeNull()
    }
  })

  it('liefert null für leer/unbekannt statt zu werfen', () => {
    expect(beschaffungStep(null)).toBeNull()
    expect(beschaffungStep(undefined)).toBeNull()
    expect(beschaffungStep('')).toBeNull()
    expect(beschaffungStep('aus_altem_katalog')).toBeNull()
  })
})

describe('enabledBeschaffungSteps', () => {
  it('behält Katalog-Reihenfolge statt Config-Reihenfolge', () => {
    const steps = enabledBeschaffungSteps({ steps: ['montage_offen', 'ab_offen'] })
    expect(steps.map(s => s.key)).toEqual(['ab_offen', 'montage_offen'])
  })

  it('filtert unbekannte Schlüssel weg', () => {
    const steps = enabledBeschaffungSteps({ steps: ['ab_offen', 'erfunden'] })
    expect(steps.map(s => s.key)).toEqual(['ab_offen'])
  })

  it('fällt ohne steps-Feld auf den vollen Katalog zurück', () => {
    // Alt-Override aus der Zeit vor dem steps-Feld darf kein leeres Dropdown ergeben.
    expect(enabledBeschaffungSteps({}).length).toBe(BESCHAFFUNG_STEPS.length)
    expect(enabledBeschaffungSteps(null).length).toBe(BESCHAFFUNG_STEPS.length)
  })
})

describe('daysSince', () => {
  const now = new Date('2026-07-30T12:00:00Z')

  it('zählt ganze Tage', () => {
    expect(daysSince('2026-07-24T12:00:00Z', now)).toBe(6)
    expect(daysSince('2026-07-29T11:00:00Z', now)).toBe(1)
  })

  it('gibt null unter einem Tag zurück — "seit 3 Stunden" hilft niemandem', () => {
    expect(daysSince('2026-07-30T09:00:00Z', now)).toBeNull()
    expect(daysSince(null, now)).toBeNull()
    expect(daysSince('kein datum', now)).toBeNull()
  })
})

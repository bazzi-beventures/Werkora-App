import { describe, expect, it } from 'vitest'
import { countByTab, projectsForTab, reiterOf } from './projectTabs'

// Reiter in "Meine Projekte": der Server setzt `bearbeitet`, die PWA teilt danach.
// Gemeldet (26.10.2026): ein Projekt ohne Termin mit eigenem Rapport war in der App
// unauffindbar — seither steht es unter «Bearbeitet».

const LISTE = [
  { id: 'a', bearbeitet: false },
  { id: 'b', bearbeitet: true },
  { id: 'c' },
  { id: 'd', bearbeitet: true },
]

describe('projectTabs', () => {
  it('teilt nach dem Server-Feld', () => {
    expect(projectsForTab(LISTE, 'aktuell').map(p => p.id)).toEqual(['a', 'c'])
    expect(projectsForTab(LISTE, 'bearbeitet').map(p => p.id)).toEqual(['b', 'd'])
  })

  it('ein Snapshot ohne Feld zeigt alles unter «Aktuell» — nichts verschwindet', () => {
    expect(reiterOf({})).toBe('aktuell')
  })

  it('zählt je Reiter', () => {
    expect(countByTab(LISTE)).toEqual({ aktuell: 2, bearbeitet: 2 })
    expect(countByTab([])).toEqual({ aktuell: 0, bearbeitet: 0 })
  })
})

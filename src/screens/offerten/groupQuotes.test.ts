import { describe, it, expect } from 'vitest'
import { groupQuotesByProject, quoteCountLabel } from './groupQuotes'

const q = (project_name: string, quote_number: string) => ({ project_name, quote_number })

describe('groupQuotesByProject', () => {
  it('fasst Offerten desselben Projekts zu EINER Gruppe zusammen', () => {
    const groups = groupQuotesByProject([
      q('Storen Müller', 'OF-2026-91'),
      q('Storen Müller', 'OF-2026-90'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].quotes.map(x => x.quote_number)).toEqual(['OF-2026-91', 'OF-2026-90'])
  })

  // Die Backend-Reihenfolge ist die Aussage (neueste Offerte zuerst) — hier wird
  // nicht alphabetisch umsortiert, sonst stünde der älteste Auftrag oben.
  it('behält die Backend-Reihenfolge; die Gruppe erbt die Position ihrer ersten Offerte', () => {
    const groups = groupQuotesByProject([
      q('Rollladen Meier', 'OF-2026-89'),
      q('Storen Müller', 'OF-2026-91'),
      q('Rollladen Meier', 'OF-2026-70'),
    ])
    expect(groups.map(g => g.project)).toEqual(['Rollladen Meier', 'Storen Müller'])
    expect(groups[0].quotes).toHaveLength(2)
  })

  it('sammelt Offerten ohne Projekt unter einem leeren Schlüssel', () => {
    const groups = groupQuotesByProject([q('', 'OF-1'), q('', 'OF-2')])
    expect(groups).toHaveLength(1)
    expect(groups[0].project).toBe('')
  })

  it('leere Liste → keine Gruppen', () => {
    expect(groupQuotesByProject([])).toEqual([])
  })
})

describe('quoteCountLabel', () => {
  it('unterscheidet Einzahl und Mehrzahl', () => {
    expect(quoteCountLabel(1)).toBe('1 Offerte')
    expect(quoteCountLabel(3)).toBe('3 Offerten')
  })
})

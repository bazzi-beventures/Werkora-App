import { describe, expect, it } from 'vitest'
import { zeilenAusKlicks, type QuerverweisRow } from './querverweisAuswertung'

const row = (von: string, nach: string, weg: string, hits: number, datum = '2026-11-23'): QuerverweisRow =>
  ({ tenant_id: 't', datum, von, nach, weg, hits })

describe('zeilenAusKlicks', () => {
  it('summiert Tage und rechnet den Anteil am Ziel über alle Wege', () => {
    const zeilen = zeilenAusKlicks([
      row('projects', 'project-schedule', 'link', 2, '2026-11-22'),
      row('projects', 'project-schedule', 'link', 1),
      row('dashboard', 'project-schedule', 'menu', 27),
      row('projects', 'customers', 'link', 4),
    ])
    expect(zeilen).toEqual([
      { von: 'dashboard', nach: 'project-schedule', weg: 'menu', klicks: 27, anteil_ziel_pct: 90 },
      { von: 'projects', nach: 'customers', weg: 'link', klicks: 4, anteil_ziel_pct: 100 },
      { von: 'projects', nach: 'project-schedule', weg: 'link', klicks: 3, anteil_ziel_pct: 10 },
    ])
  })

  it('leer bleibt leer', () => {
    expect(zeilenAusKlicks([])).toEqual([])
  })
})

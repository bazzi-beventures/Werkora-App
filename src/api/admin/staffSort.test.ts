import { describe, it, expect } from 'vitest'
import { sortStaffByName } from './staff'

// Die Namensreihenfolge ist reine Anzeige-Logik, aber sie hängt an jeder
// Mitarbeiter-Auswahl im Admin (Projekt-Team, Plantafel-Zeilen, Tagesplan,
// Massen-Einstempeln). Ungeordnet — also in Anlagereihenfolge aus der DB —
// sucht man in einer Liste mit 18 Monteuren jeden Namen einzeln.
describe('sortStaffByName', () => {
  it('sortiert alphabetisch nach Name', () => {
    const rows = [
      { id: '1', name: 'Marvin Walser' },
      { id: '2', name: 'Flavia Joos' },
      { id: '3', name: 'Boris Widmer' },
      { id: '4', name: 'Almin Pepic' },
    ]
    expect(sortStaffByName(rows).map(s => s.name)).toEqual([
      'Almin Pepic', 'Boris Widmer', 'Flavia Joos', 'Marvin Walser',
    ])
  })

  it('sortiert Umlaute einheimisch statt hinter Z', () => {
    const rows = [
      { id: '1', name: 'Zora Meier' },
      { id: '2', name: 'Änne Roth' },
      { id: '3', name: 'Aaron Brun' },
    ]
    expect(sortStaffByName(rows).map(s => s.name)).toEqual([
      'Aaron Brun', 'Änne Roth', 'Zora Meier',
    ])
  })

  it('lässt die Eingabeliste unangetastet', () => {
    const rows = [{ id: '1', name: 'B' }, { id: '2', name: 'A' }]
    sortStaffByName(rows)
    expect(rows.map(s => s.name)).toEqual(['B', 'A'])
  })

  it('verträgt fehlende Namen', () => {
    const rows = [
      { id: '1', name: 'Anna' },
      { id: '2', name: null },
      { id: '3', name: undefined },
    ]
    expect(() => sortStaffByName(rows)).not.toThrow()
    expect(sortStaffByName(rows)).toHaveLength(3)
  })
})

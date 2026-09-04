import { describe, expect, it } from 'vitest'
import { filterProjectsBySearch, projectMatchesSearch } from './searchProjects'

// Suche in "Meine Projekte": über Name UND Projektnummer, damit der Monteur die
// Baustelle mit dem findet, was er von dort mitbringt — den Namen vom Kunden,
// die Nummer vom Auftragsblatt.

const PROJEKTE = [
  { name: 'Müller Kleinandelfingen', project_id_text: '2600559' },
  { name: 'Siegrist Wiesendangen', project_id_text: '2600712' },
  { name: 'Walch Seuzach', project_id_text: null },
  { name: 'Müller Winterthur', project_id_text: '2612004' },
]

const namen = (q: string) => filterProjectsBySearch(PROJEKTE, q).map(p => p.name)

describe('projectMatchesSearch', () => {
  it('findet über den Namen, unabhängig von Gross-/Kleinschreibung', () => {
    expect(namen('siegrist')).toEqual(['Siegrist Wiesendangen'])
    expect(namen('SIEGRIST')).toEqual(['Siegrist Wiesendangen'])
  })

  it('findet über die Projektnummer, auch über einen Teil davon', () => {
    expect(namen('2600559')).toEqual(['Müller Kleinandelfingen'])
    expect(namen('2600')).toEqual(['Müller Kleinandelfingen', 'Siegrist Wiesendangen'])
  })

  it('ignoriert Umlaute — die Tastatur mit Handschuhen trifft sie nicht', () => {
    expect(namen('muller')).toEqual(['Müller Kleinandelfingen', 'Müller Winterthur'])
    expect(namen('müller')).toEqual(['Müller Kleinandelfingen', 'Müller Winterthur'])
  })

  it('verknüpft mehrere Begriffe mit UND, in beliebiger Reihenfolge', () => {
    // Genau der Fall, für den die Nummer mitgesucht wird: zwei Baustellen
    // desselben Kunden, unterscheidbar nur über die Nummer.
    expect(namen('muller 2612')).toEqual(['Müller Winterthur'])
    expect(namen('2612 muller')).toEqual(['Müller Winterthur'])
  })

  it('kommt mit einer fehlenden Projektnummer klar (Alt-Zeile)', () => {
    expect(namen('walch')).toEqual(['Walch Seuzach'])
    expect(projectMatchesSearch({ name: 'Walch Seuzach' }, 'walch')).toBe(true)
  })

  it('lässt die Liste bei leerem oder blankem Begriff unverändert', () => {
    expect(filterProjectsBySearch(PROJEKTE, '')).toEqual(PROJEKTE)
    expect(filterProjectsBySearch(PROJEKTE, '   ')).toEqual(PROJEKTE)
  })

  it('gibt bei fehlendem Treffer eine leere Liste zurück', () => {
    expect(namen('gibtsnicht')).toEqual([])
  })

  it('mutiert die Eingabe nicht', () => {
    const kopie = [...PROJEKTE]
    filterProjectsBySearch(PROJEKTE, 'muller')
    expect(PROJEKTE).toEqual(kopie)
  })
})

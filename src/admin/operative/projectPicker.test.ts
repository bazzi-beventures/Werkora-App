import { describe, it, expect } from 'vitest'
import { filterPickerProjects, pickerLabel } from './projectPicker'
import type { Project } from '../../api/admin/projects'

// Suche im Projekt-Picker der Einsatzplanung. Der Fall, der vorher fehlschlug:
// ein NEU angelegtes Projekt trägt seine Nummer nur in project_id_text, nicht
// im Namen — nach ihr zu suchen fand nichts.

function project(over: Partial<Project>): Project {
  return {
    id: over.id ?? 'p1',
    name: 'Projekt',
    project_id_text: null,
    customer: null,
    ...over,
  } as unknown as Project
}

// Altbestand (Nummer im Namen) und Neuanlage (Nummer nur im Feld) gemischt —
// so sieht die Liste bei Gehlhaar heute aus.
const ALT = project({ id: 'alt', name: '241556 Gsell Seuzach', project_id_text: '241556' })
const NEU = project({
  id: 'neu',
  name: 'Leerwhg. Tösstalstr. 134 Winterthur',
  project_id_text: '261301',
  customer: { name: 'Meier AG' } as Project['customer'],
})
const OHNE_NR = project({ id: 'intern', name: 'Teamsitzung' })

const ALLE = [NEU, ALT, OHNE_NR]

describe('pickerLabel', () => {
  it('stellt die Projektnummer vor den Namen', () => {
    expect(pickerLabel(NEU)).toBe('261301 Leerwhg. Tösstalstr. 134 Winterthur')
  })

  it('verdoppelt eine im Namen enthaltene Nummer nicht', () => {
    expect(pickerLabel(ALT)).toBe('241556 Gsell Seuzach')
  })
})

describe('filterPickerProjects', () => {
  it('findet ein neu angelegtes Projekt über seine Projektnummer', () => {
    expect(filterPickerProjects(ALLE, '261301').map(p => p.id)).toEqual(['neu'])
  })

  it('findet auch über den Anfang der Nummer', () => {
    expect(filterPickerProjects(ALLE, '2613').map(p => p.id)).toEqual(['neu'])
  })

  it('findet den Altbestand mit der Nummer im Namen weiterhin', () => {
    expect(filterPickerProjects(ALLE, '241556').map(p => p.id)).toEqual(['alt'])
  })

  it('sucht weiter über den Namen', () => {
    expect(filterPickerProjects(ALLE, 'gsell').map(p => p.id)).toEqual(['alt'])
  })

  it('sucht über den Kundennamen', () => {
    expect(filterPickerProjects(ALLE, 'meier').map(p => p.id)).toEqual(['neu'])
  })

  it('verknüpft mehrere Wörter mit UND, unabhängig von der Reihenfolge', () => {
    expect(filterPickerProjects(ALLE, 'seuzach gsell').map(p => p.id)).toEqual(['alt'])
    expect(filterPickerProjects(ALLE, 'gsell winterthur')).toEqual([])
  })

  it('stellt Nummern-Treffer vor Treffer mitten im Text', () => {
    const treffer = project({ id: 'zahl-im-namen', name: 'Umbau 26 Wohnungen', project_id_text: '900001' })
    const nummer = project({ id: 'nummer', name: 'Gut Neftenbach', project_id_text: '260038' })
    const sortiert = filterPickerProjects([treffer, nummer], '26').map(p => p.id)
    expect(sortiert).toEqual(['nummer', 'zahl-im-namen'])
  })

  it('gibt ohne Eingabe alles zurück, nach Anzeige-Titel sortiert', () => {
    expect(filterPickerProjects(ALLE, '').map(p => p.id)).toEqual(['alt', 'neu', 'intern'])
  })

  it('ignoriert führende und folgende Leerzeichen', () => {
    expect(filterPickerProjects(ALLE, '  gsell  ').map(p => p.id)).toEqual(['alt'])
  })

  it('liefert bei fehlendem Treffer eine leere Liste', () => {
    expect(filterPickerProjects(ALLE, 'raumschiff')).toEqual([])
  })
})

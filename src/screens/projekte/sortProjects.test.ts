import { describe, it, expect } from 'vitest'
import { compareProjectsNewestFirst, sortProjectsNewestFirst } from './sortProjects'

// Zwei Auslöser stecken in diesen Tests: die Kachelliste zeigte am selben Tag
// 11:00 vor 09:00 vor 16:00 (sie übernahm die Reihenfolge des Servers nach Name),
// und die Tage standen aufsteigend — der aktuelle Auftrag lag ganz unten.

function p(name: string, start_date: string | null, start_time: string | null = null) {
  return { name, start_date, start_time }
}

describe('compareProjectsNewestFirst', () => {
  it('sortiert innerhalb eines Tages nach Startzeit aufsteigend', () => {
    const sorted = sortProjectsNewestFirst([
      p('Müller', '2026-08-13', '11:00:00'),
      p('Siegrist', '2026-08-13', '09:00:00'),
      p('Walch', '2026-08-13', '16:00:00'),
    ])
    expect(sorted.map(x => x.name)).toEqual(['Siegrist', 'Müller', 'Walch'])
  })

  it('stellt das neueste Datum zuerst', () => {
    const sorted = sortProjectsNewestFirst([
      p('Vorgestern', '2026-08-11', '07:00:00'),
      p('Heute', '2026-08-13', '17:00:00'),
      p('Gestern', '2026-08-12', '08:00:00'),
    ])
    expect(sorted.map(x => x.name)).toEqual(['Heute', 'Gestern', 'Vorgestern'])
  })

  it('hängt Einsätze ohne Startzeit hinter die des Tages mit Zeit', () => {
    const sorted = sortProjectsNewestFirst([
      p('Ganztags', '2026-08-13', null),
      p('Nachmittag', '2026-08-13', '14:00:00'),
    ])
    expect(sorted.map(x => x.name)).toEqual(['Nachmittag', 'Ganztags'])
  })

  it('hängt Projekte ganz ohne Termin ans Ende — auch bei umgekehrter Datumsfolge', () => {
    const sorted = sortProjectsNewestFirst([
      p('Ohne Termin', null),
      p('Letzte Woche', '2026-08-06', '08:00:00'),
      p('Heute', '2026-08-13', '08:00:00'),
    ])
    expect(sorted.map(x => x.name)).toEqual(['Heute', 'Letzte Woche', 'Ohne Termin'])
  })

  it('bricht Gleichstand über den Namen — auch ganz ohne Termin', () => {
    const sorted = sortProjectsNewestFirst([
      p('Zaun', null),
      p('Abbruch', null),
      p('Bad', '2026-08-13', '08:00:00'),
      p('Anbau', '2026-08-13', '08:00:00'),
    ])
    expect(sorted.map(x => x.name)).toEqual(['Anbau', 'Bad', 'Abbruch', 'Zaun'])
  })

  it('lässt die Eingabeliste unverändert', () => {
    const input = [p('A', '2026-08-13'), p('B', '2026-08-14')]
    sortProjectsNewestFirst(input)
    expect(input.map(x => x.name)).toEqual(['A', 'B'])
  })

  it('behandelt fehlende start_time wie null (ältere API)', () => {
    const withTime = { name: 'Mit Zeit', start_date: '2026-08-13', start_time: '10:00:00' }
    const withoutField = { name: 'Ohne Feld', start_date: '2026-08-13' }
    expect(compareProjectsNewestFirst(withoutField, withTime)).toBeGreaterThan(0)
  })
})

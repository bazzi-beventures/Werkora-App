import { describe, it, expect } from 'vitest'
import {
  addressLocality, crewMembers, crewShortLabels, hasUnassignedEntries,
  neededDistancePairs, overlapConflictIds, pairKey, reassignTeam, rowEntries,
  staffShortLabel,
} from './scheduleShared'
import type { CalendarEntry } from './scheduleShared'
import type { Project } from '../../api/admin/projects'

// Reine Formatier-Helfer der Einsatzplanung — ohne DOM testbar.

describe('addressLocality', () => {
  it('nimmt die Ortschaft hinter der PLZ', () => {
    expect(addressLocality('Hofstettweg 5, 8405 Winterthur')).toBe('Winterthur')
    expect(addressLocality('8405 Winterthur')).toBe('Winterthur')
    expect(addressLocality('Hofstettweg 5\n8405 Winterthur')).toBe('Winterthur')
  })

  it('ignoriert ein angehängtes Land', () => {
    expect(addressLocality('Bahnhofstrasse 1, 8001 Zürich, Schweiz')).toBe('Zürich')
  })

  it('verwechselt eine Hausnummer nicht mit einer PLZ', () => {
    expect(addressLocality('Bahnhofstrasse 1234, Seuzach')).toBe('Seuzach')
  })

  it('gibt ohne erkennbare Ortschaft nichts zurück', () => {
    expect(addressLocality('Hofstettweg 5')).toBe('')
    expect(addressLocality('')).toBe('')
    expect(addressLocality(null)).toBe('')
  })

  it('nimmt eine reine Ortsangabe als Ortschaft', () => {
    expect(addressLocality('Winterthur')).toBe('Winterthur')
  })
})

describe('staffShortLabel', () => {
  it('nutzt das gepflegte Kürzel', () => {
    expect(staffShortLabel({ id: 's1', name: 'Marvin Walser', kuerzel: 'mw' })).toBe('MW')
  })

  it('fällt ohne Kürzel auf die Initialen zurück', () => {
    expect(staffShortLabel({ id: 's1', name: 'Marvin Walser' })).toBe('MW')
    expect(staffShortLabel({ id: 's2', name: 'Kevin De Florian' })).toBe('KD')
    expect(staffShortLabel({ id: 's3', name: 'Cher', kuerzel: '  ' })).toBe('C')
  })
})

describe('crewShortLabels', () => {
  const staff = [
    { id: 's1', name: 'Marvin Walser', kuerzel: 'MW' },
    { id: 's2', name: 'Kevin Almeida', kuerzel: 'KA' },
    { id: 's3', name: 'Boris Widmer', kuerzel: 'BW' },
    { id: 's4', name: 'Maja Joos', kuerzel: 'MJ' },
  ]
  const entry = (ids: string[]) => ({ monteur_ids: ids } as unknown as Project)

  it('liefert die Kürzel des Termin-Teams in Reihenfolge, der erste ist Lead', () => {
    expect(crewShortLabels(entry(['s2', 's1']), staff)).toEqual([
      { label: 'KA', lead: true },
      { label: 'MW', lead: false },
    ])
  })

  it('deckelt lange Teams mit +n (der Deckel ist nie Lead)', () => {
    expect(crewShortLabels(entry(['s1', 's2', 's3', 's4']), staff)).toEqual([
      { label: 'MW', lead: true },
      { label: 'KA', lead: false },
      { label: 'BW', lead: false },
      { label: '+1', lead: false },
    ])
  })

  it('ignoriert unbekannte und fehlende Monteure', () => {
    // Steht eine Karteileiche vorne, rückt der erste bekannte Monteur als Lead nach —
    // sonst hätte der Einsatz gar keinen sichtbaren Lead.
    expect(crewShortLabels(entry(['weg', 's1']), staff)).toEqual([{ label: 'MW', lead: true }])
    expect(crewShortLabels(entry([]), staff)).toEqual([])
  })
})

describe('crewMembers', () => {
  const staff = [
    { id: 's1', name: 'Marvin Walser', kuerzel: 'MW' },
    { id: 's2', name: 'Kevin Almeida', kuerzel: 'KA' },
  ]
  const entry = (ids: string[]) => ({ monteur_ids: ids } as unknown as Project)

  it('markiert genau den zuerst gewählten Monteur als Lead', () => {
    expect(crewMembers(entry(['s2', 's1']), staff)).toEqual([
      { id: 's2', name: 'Kevin Almeida', short: 'KA', lead: true },
      { id: 's1', name: 'Marvin Walser', short: 'MW', lead: false },
    ])
  })

  it('liefert für einen Einsatz ohne Team eine leere Liste', () => {
    expect(crewMembers({} as unknown as Project, staff)).toEqual([])
  })
})

describe('pairKey', () => {
  it('normalisiert das Adresspaar unabhängig von der Reihenfolge', () => {
    expect(pairKey('B-Weg 2', 'A-Weg 1')).toBe(pairKey(' A-Weg 1 ', 'B-Weg 2'))
  })

  it('gibt für leere oder identische Adressen null', () => {
    expect(pairKey('A-Weg 1', 'A-Weg 1')).toBeNull()
    expect(pairKey('', 'A-Weg 1')).toBeNull()
    expect(pairKey('A-Weg 1', null)).toBeNull()
  })
})


// ─── Zeilen-Belegung und Konflikte (H4: vorher in Plantafel UND Gantt) ────────

// Nur die Felder, die rowEntries/overlapConflictIds anfassen.
function entry(over: Partial<CalendarEntry> & { id: string }): CalendarEntry {
  return {
    start_date: '2026-06-08',
    end_date: '2026-06-08',
    start_time: null,
    end_time: null,
    monteur_ids: [],
    object_address: null,
    ...over,
  } as unknown as CalendarEntry
}

const DAY = new Date('2026-06-08T00:00:00')
const OTHER_DAY = new Date('2026-06-09T00:00:00')
const KNOWN_STAFF = new Set(['s1', 's2'])

describe('rowEntries', () => {
  it('gibt die Einsätze des Monteurs an diesem Tag, ganztägige zuerst', () => {
    const projects = [
      entry({ id: 'a', monteur_ids: ['s1'], start_time: '10:00' }),
      entry({ id: 'b', monteur_ids: ['s1'] }),                       // ganztägig
      entry({ id: 'c', monteur_ids: ['s1'], start_time: '08:00' }),
      entry({ id: 'd', monteur_ids: ['s2'], start_time: '09:00' }),  // anderer Monteur
      entry({ id: 'e', monteur_ids: ['s1'], start_date: '2026-06-09', end_date: '2026-06-09' }),
    ]
    expect(rowEntries(projects, KNOWN_STAFF, 's1', DAY).map(p => p.id)).toEqual(['b', 'c', 'a'])
  })

  it('sammelt in der Zeile «Ohne Monteur» nur Einsätze ohne bekannten Mitarbeiter', () => {
    const projects = [
      entry({ id: 'a', monteur_ids: [] }),
      entry({ id: 'b', monteur_ids: ['s1'] }),
      // Verwaiste ID (gelöschtes Konto): gehört in die Sammelzeile, sonst wäre der
      // Einsatz in keiner Ansicht sichtbar.
      entry({ id: 'c', monteur_ids: ['weg'] }),
    ]
    expect(rowEntries(projects, KNOWN_STAFF, null, DAY).map(p => p.id)).toEqual(['a', 'c'])
  })
})

describe('hasUnassignedEntries', () => {
  it('meldet einen Einsatz ohne Monteur an einem der Tage', () => {
    const projects = [entry({ id: 'a', monteur_ids: [], start_date: '2026-06-09', end_date: '2026-06-09' })]
    expect(hasUnassignedEntries(projects, KNOWN_STAFF, [DAY])).toBe(false)
    expect(hasUnassignedEntries(projects, KNOWN_STAFF, [DAY, OTHER_DAY])).toBe(true)
  })
})

describe('neededDistancePairs', () => {
  const staff = [{ id: 's1', name: 'Marvin Walser' }]

  it('paart aufeinanderfolgende getaktete Einsätze mit verschiedenen Adressen', () => {
    const projects = [
      entry({ id: 'a', monteur_ids: ['s1'], start_time: '08:00', object_address: 'A-Weg 1' }),
      entry({ id: 'b', monteur_ids: ['s1'], start_time: '10:00', object_address: 'B-Weg 2' }),
      entry({ id: 'c', monteur_ids: ['s1'], start_time: '13:00', object_address: 'C-Weg 3' }),
    ]
    expect(neededDistancePairs(projects, KNOWN_STAFF, staff, [DAY])).toEqual([
      pairKey('A-Weg 1', 'B-Weg 2'),
      pairKey('B-Weg 2', 'C-Weg 3'),
    ])
  })

  it('lässt ganztägige Einsätze und identische Adressen aus', () => {
    const projects = [
      entry({ id: 'a', monteur_ids: ['s1'], object_address: 'A-Weg 1' }),               // ganztägig
      entry({ id: 'b', monteur_ids: ['s1'], start_time: '10:00', object_address: 'B-Weg 2' }),
      entry({ id: 'c', monteur_ids: ['s1'], start_time: '13:00', object_address: 'B-Weg 2' }),
    ]
    expect(neededDistancePairs(projects, KNOWN_STAFF, staff, [DAY])).toEqual([])
  })
})

describe('overlapConflictIds', () => {
  it('findet beide Seiten einer Überschneidung', () => {
    const ids = overlapConflictIds([
      entry({ id: 'a', start_time: '08:00', end_time: '10:00' }),
      entry({ id: 'b', start_time: '09:00', end_time: '11:00' }),
      entry({ id: 'c', start_time: '11:00', end_time: '12:00' }),
    ])
    expect([...ids].sort()).toEqual(['a', 'b'])
  })

  it('rechnet ohne Endzeit mit einer Stunde', () => {
    expect([...overlapConflictIds([
      entry({ id: 'a', start_time: '08:00' }),
      entry({ id: 'b', start_time: '08:30' }),
    ])].sort()).toEqual(['a', 'b'])
    expect([...overlapConflictIds([
      entry({ id: 'a', start_time: '08:00' }),
      entry({ id: 'b', start_time: '09:00' }),
    ])]).toEqual([])
  })

  it('zählt Anschluss ohne Überlappung nicht als Konflikt', () => {
    expect([...overlapConflictIds([
      entry({ id: 'a', start_time: '08:00', end_time: '10:00' }),
      entry({ id: 'b', start_time: '10:00', end_time: '11:00' }),
    ])]).toEqual([])
  })

  it('ignoriert ganztägige Einsätze', () => {
    expect([...overlapConflictIds([
      entry({ id: 'a' }),
      entry({ id: 'b' }),
    ])]).toEqual([])
  })
})

describe('reassignTeam', () => {
  // Lag bis 2026-08 wortgleich in beiden Drop-Handlern (Plantafel + Gantt) — ein
  // Konflikt-/Team-Bugfix haette nur in einer Ansicht gewirkt.
  it('tauscht Quell-Monteur gegen Ziel-Monteur', () => {
    expect(reassignTeam(['a', 'b'], 'c', 'a')).toEqual(['b', 'c'])
  })

  it('laesst das Team unveraendert beim Drop in dieselbe Zeile', () => {
    expect(reassignTeam(['a', 'b'], 'a', 'a')).toBeUndefined()
  })

  it('aendert nichts beim Drop in «Ohne Monteur»', () => {
    expect(reassignTeam(['a'], null, 'a')).toBeUndefined()
  })

  it('fuegt hinzu, wenn der Einsatz aus der Sammelzeile kommt (kein Quell-Monteur)', () => {
    expect(reassignTeam([], 'c', null)).toEqual(['c'])
  })

  it('dupliziert einen bereits zugewiesenen Ziel-Monteur nicht', () => {
    expect(reassignTeam(['a', 'c'], 'c', 'a')).toEqual(['c'])
  })

  it('vertraegt fehlendes Team (null/undefined)', () => {
    expect(reassignTeam(null, 'c', null)).toEqual(['c'])
    expect(reassignTeam(undefined, 'c', 'a')).toEqual(['c'])
  })
})

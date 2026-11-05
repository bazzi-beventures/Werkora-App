import { describe, it, expect } from 'vitest'
import { findStaffOverlaps, formatStaffOverlaps, overlapConflictIds, VORSCHLAG_PREFIX } from './scheduleShared'
import type { CalendarEntry } from './scheduleShared'

// WW-70: Doppelbelegung vor dem Speichern — dieselbe Regel wie der rote Rahmen
// (overlapConflictIds), nur gegen einen Termin, der noch nicht gespeichert ist.

const STAFF = [{ id: 's1', name: 'Anna Muster' }, { id: 's2', name: 'Beat Beispiel' }]

function entry(over: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: 'b1', name: 'Dach Meier', project_id_text: '2601477', kind: 'project',
    start_date: '2026-11-10', end_date: '2026-11-10', start_time: '09:00', end_time: '12:00',
    monteur_ids: ['s1'],
    ...over,
  } as unknown as CalendarEntry
}

const SLOT = { start_date: '2026-11-10', start_time: '11:00', end_time: '14:00', staffIds: ['s1'] }

describe('findStaffOverlaps', () => {
  it('meldet einen Monteur, der zur selben Zeit schon eingeplant ist', () => {
    const hits = findStaffOverlaps([entry({})], SLOT, STAFF)
    expect(hits.map(h => [h.staffName, h.entry.id])).toEqual([['Anna Muster', 'b1']])
  })

  it('zählt nur Monteure, die in beiden Teams stehen', () => {
    expect(findStaffOverlaps([entry({ monteur_ids: ['s2'] })], SLOT, STAFF)).toEqual([])
    const beide = findStaffOverlaps([entry({ monteur_ids: ['s1', 's2'] })], { ...SLOT, staffIds: ['s1', 's2'] }, STAFF)
    expect(beide.map(h => h.staffName)).toEqual(['Anna Muster', 'Beat Beispiel'])
  })

  it('lässt sich berührende Zeiten durch: 09–12 und 12–14 sind kein Konflikt', () => {
    expect(findStaffOverlaps([entry({})], { ...SLOT, start_time: '12:00' }, STAFF)).toEqual([])
  })

  it('rechnet ohne Endzeit mit einer Stunde, wie der rote Rahmen', () => {
    expect(findStaffOverlaps([entry({ end_time: null })], { ...SLOT, start_time: '09:30' }, STAFF)).toHaveLength(1)
    expect(findStaffOverlaps([entry({ end_time: null })], { ...SLOT, start_time: '10:00' }, STAFF)).toEqual([])
  })

  it('ignoriert ganztägige Einträge auf beiden Seiten', () => {
    expect(findStaffOverlaps([entry({ start_time: null, end_time: null })], SLOT, STAFF)).toEqual([])
    expect(findStaffOverlaps([entry({})], { ...SLOT, start_time: null, end_time: null }, STAFF)).toEqual([])
  })

  it('prüft mehrtägige Einsätze an jedem ihrer Tage', () => {
    const mehrtaegig = entry({ start_date: '2026-11-09', end_date: '2026-11-11' })
    expect(findStaffOverlaps([mehrtaegig], SLOT, STAFF)).toHaveLength(1)
    expect(findStaffOverlaps([mehrtaegig], { ...SLOT, start_date: '2026-11-12' }, STAFF)).toEqual([])
  })

  it('lässt den Termin selbst und Vorschläge der Disposition aussen vor', () => {
    expect(findStaffOverlaps([entry({})], SLOT, STAFF, ['b1'])).toEqual([])
    expect(findStaffOverlaps([entry({ id: `${VORSCHLAG_PREFIX}v1` })], SLOT, STAFF)).toEqual([])
  })

  it('stimmt mit dem roten Rahmen im Kalender überein', () => {
    const a = entry({ id: 'x', start_time: '11:00', end_time: '14:00' })
    const b = entry({})
    expect(overlapConflictIds([a, b]).size > 0).toBe(findStaffOverlaps([b], SLOT, STAFF).length > 0)
  })
})

describe('formatStaffOverlaps', () => {
  it('nennt Monteur, Einsatz, Tag und Zeit', () => {
    const text = formatStaffOverlaps(findStaffOverlaps([entry({})], SLOT, STAFF))
    expect(text).toBe('Zur selben Zeit schon eingeplant — Anna Muster: 2601477 Dach Meier, Di., 10.11. 09:00–12:00.')
  })

  it('kürzt lange Listen', () => {
    const viele = Array.from({ length: 7 }, (_, i) => entry({ id: `b${i}` }))
    expect(formatStaffOverlaps(findStaffOverlaps(viele, SLOT, STAFF))).toMatch(/und 2 weitere\.$/)
  })
})

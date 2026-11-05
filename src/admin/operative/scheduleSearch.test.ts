import { describe, it, expect } from 'vitest'
import { searchScheduleEntries } from './scheduleSearch'
import type { CalendarEntry } from './scheduleShared'
import { VORSCHLAG_PREFIX } from './scheduleShared'

// WW-69: per Name auf den Termin. Gesucht wird über Nummer + Name, Kunde und
// Objektadresse, mehrere Wörter als UND; kommende Termine zuerst.

function entry(over: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: 'a1', name: 'EFH Macri Hettlingen', project_id_text: '2601228', kind: 'project',
    customer: { name: 'Macri Luca' }, object_address: 'Hofstettweg 5, 8442 Hettlingen',
    start_date: '2026-11-10', end_date: '2026-11-10', start_time: '07:30', end_time: '12:00',
    monteur_ids: ['s1'],
    ...over,
  } as unknown as CalendarEntry
}

const HEUTE = '2026-11-05'

describe('searchScheduleEntries', () => {
  it('findet über Kunde, Projektname, Nummer und Ort', () => {
    const e = [entry({})]
    for (const q of ['macri', 'MACRI', '2601228', 'hettlingen', 'hofstettweg', 'EFH']) {
      expect(searchScheduleEntries(e, q, HEUTE).map(h => h.entry.id), q).toEqual(['a1'])
    }
  })

  it('verknüpft mehrere Wörter mit UND, in beliebiger Reihenfolge', () => {
    const e = [entry({}), entry({ id: 'a2', name: 'MFH Breitestrasse 3', project_id_text: '2601477',
      customer: { name: 'Verwaltung Muster' }, object_address: 'Breitestrasse 3, 8472 Seuzach' } as never)]
    expect(searchScheduleEntries(e, 'hettlingen macri', HEUTE).map(h => h.entry.id)).toEqual(['a1'])
    expect(searchScheduleEntries(e, 'seuzach macri', HEUTE)).toEqual([])
  })

  it('zeigt Kunde und Ort als Zusatzzeile', () => {
    expect(searchScheduleEntries([entry({})], 'macri', HEUTE)[0].detail).toBe('Macri Luca · Hettlingen')
  })

  it('sucht erst ab zwei Zeichen', () => {
    expect(searchScheduleEntries([entry({})], 'm', HEUTE)).toEqual([])
    expect(searchScheduleEntries([entry({})], '  ', HEUTE)).toEqual([])
  })

  it('stellt kommende Termine vor vergangene: nächster oben, dann jüngster Vergangener', () => {
    const e = [
      entry({ id: 'alt', start_date: '2026-09-01', end_date: '2026-09-01' }),
      entry({ id: 'spaeter', start_date: '2026-12-01', end_date: '2026-12-01' }),
      entry({ id: 'naechster', start_date: '2026-11-10', end_date: '2026-11-10' }),
      entry({ id: 'kuerzlich', start_date: '2026-10-20', end_date: '2026-10-20' }),
    ]
    expect(searchScheduleEntries(e, 'macri', HEUTE).map(h => h.entry.id))
      .toEqual(['naechster', 'spaeter', 'kuerzlich', 'alt'])
  })

  it('zählt einen laufenden mehrtägigen Einsatz als kommend', () => {
    const h = searchScheduleEntries([entry({ start_date: '2026-11-03', end_date: '2026-11-07' })], 'macri', HEUTE)
    expect(h[0].upcoming).toBe(true)
  })

  it('lässt Vorschläge der Disposition aussen vor — sie sind keine Termine', () => {
    expect(searchScheduleEntries([entry({ id: `${VORSCHLAG_PREFIX}v1` })], 'macri', HEUTE)).toEqual([])
  })

  it('sucht nicht nach Monteur-Namen', () => {
    const e = [entry({ monteur_ids: ['s1'] })]
    expect(searchScheduleEntries(e, 'marty', HEUTE)).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { aufTag, fensterAmTag, tagTeilLabel, ueberschneidenSich } from './tagesfenster'
import { entriesOnDay, findStaffOverlaps, fmtRange, fmtTimeRange, type CalendarEntry } from './scheduleShared'

// WW-92 (Gehlhaar): «Wenn ich an einem Tag am Morgen beginne und bis zum
// anderen Tag am Mittag angebe, nimmt er mir nur immer den Morgen.» Die
// Einsatzplanung las die Uhrzeiten eines mehrtägigen Termins als Fenster für
// jeden Tag. Startzeit gilt am ersten, Endzeit am letzten Tag — so wie
// Wochenplan-PDF, Monteur-App und Kalender-Anhang es schon lasen.

const MO = new Date('2027-02-01T12:00:00')
const DI = new Date('2027-02-02T12:00:00')
const MI = new Date('2027-02-03T12:00:00')

function termin(over: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: 't1', name: 'Montage', start_date: '2027-02-01', end_date: '2027-02-02',
    start_time: '07:00', end_time: '12:00', monteur_ids: ['m1'],
    ...over,
  } as CalendarEntry
}

describe('Tagesfenster mehrtägiger Termine', () => {
  it('Mo 07:00 bis Di 12:00: Montag bis Arbeitsende, Dienstag bis Mittag', () => {
    expect(fensterAmTag(termin(), '2027-02-01')).toEqual({ start: '07:00', end: '17:00', teil: 'erster' })
    expect(fensterAmTag(termin(), '2027-02-02')).toEqual({ start: '07:00', end: '12:00', teil: 'letzter' })
  })

  it('Tage dazwischen sind ein ganzer Arbeitstag', () => {
    const t = termin({ end_date: '2027-02-03' })
    expect(fensterAmTag(t, '2027-02-02')).toEqual({ start: '07:00', end: '17:00', teil: 'mitte' })
  })

  it('eintägige Termine bleiben unverändert', () => {
    const t = termin({ end_date: '2027-02-01', start_time: '08:00', end_time: '10:00' })
    expect(aufTag(t, MO)).toBe(t)
    expect(fmtTimeRange(t)).toBe('08:00–10:00')
  })

  it('ohne Uhrzeit bleibt ein mehrtägiger Termin ganztägig', () => {
    const t = termin({ start_time: null, end_time: null })
    expect(aufTag(t, DI)).toBe(t)
  })

  it('Beginn nach Arbeitsende bekommt am ersten Tag eine Stunde', () => {
    expect(fensterAmTag(termin({ start_time: '18:30' }), '2027-02-01')?.end).toBe('19:30')
  })

  it('Ende vor Arbeitsbeginn beginnt am letzten Tag eine Stunde davor', () => {
    expect(fensterAmTag(termin({ end_time: '06:30' }), '2027-02-02')?.start).toBe('05:30')
  })

  it('projiziert je Tag, behält id und gespeicherte Zeiten', () => {
    const [mo] = entriesOnDay([termin()], MO)
    const [di] = entriesOnDay([termin()], DI)
    expect(mo).toMatchObject({ id: 't1', start_time: '07:00', end_time: '17:00', tag_teil: 'erster' })
    expect(di).toMatchObject({ id: 't1', start_time: '07:00', end_time: '12:00', tag_teil: 'letzter' })
    expect(di.termin_start_time).toBe('07:00')
    expect(di.termin_end_time).toBe('12:00')
    expect(entriesOnDay([termin()], MI)).toEqual([])
  })

  it('beschriftet die Kachel mit ab/bis statt mit dem Tagesfenster', () => {
    expect(tagTeilLabel(aufTag(termin(), MO))).toBe('ab 07:00')
    expect(tagTeilLabel(aufTag(termin(), DI))).toBe('bis 12:00')
    expect(fmtTimeRange(aufTag(termin({ end_date: '2027-02-03' }), DI))).toBe('ganzer Tag')
    expect(fmtTimeRange(termin())).toBe('ab 07:00 · bis 12:00')
  })

  it('Hover zeigt den ganzen Termin mit Datum und Uhrzeit', () => {
    expect(fmtRange(aufTag(termin(), DI))).toBe('01.02. 07:00 – 02.02. 12:00')
  })
})

describe('Überschneidung mit mehrtägigen Terminen', () => {
  it('ein Montag-Nachmittag kollidiert mit Mo 07:00 – Di 12:00', () => {
    const nachmittag = { start_date: '2027-02-01', start_time: '14:00', end_time: '16:00' }
    expect(ueberschneidenSich(termin(), nachmittag)).toBe(true)
  })

  it('ein Dienstag-Nachmittag ist frei', () => {
    const nachmittag = { start_date: '2027-02-02', start_time: '13:00', end_time: '16:00' }
    expect(ueberschneidenSich(termin(), nachmittag)).toBe(false)
  })

  it('findStaffOverlaps warnt am ersten Tag nach der Startzeit', () => {
    const staff = [{ id: 'm1', name: 'Kevin' }]
    const slot = { start_date: '2027-02-01', start_time: '15:00', end_time: '16:00', staffIds: ['m1'] }
    expect(findStaffOverlaps([termin()], slot, staff)).toHaveLength(1)
    const frei = { start_date: '2027-02-02', start_time: '13:00', end_time: '14:00', staffIds: ['m1'] }
    expect(findStaffOverlaps([termin()], frei, staff)).toHaveLength(0)
  })
})

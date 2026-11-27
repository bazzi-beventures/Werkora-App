import { describe, it, expect, vi, beforeEach } from 'vitest'
import { absenzMeldung, absenzVorpruefung, draftVorkommen, MAX_SERIES_OCCURRENCES, serienUeberschneidungen, serienVorkommen } from './serienPruefung'
import { emptyApptForm } from './scheduleScreenModel'
import type { CalendarEntry } from './scheduleShared'
import type { ScheduleAbsence } from '../../api/admin/scheduling'
import { listScheduleAbsences } from '../../api/admin'

vi.mock('../../api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/admin')>()),
  listScheduleAbsences: vi.fn(),
}))

const starts = (rule: Parameters<typeof serienVorkommen>[2], start = '2026-08-03', end: string | null = null) =>
  serienVorkommen(start, end, rule).map(v => v.start_date)

// Dieselben Fälle wie tests/unit/test_project_appointments.py (expand_recurrence) —
// die Rückfrage muss genau die Termine prüfen, die der Server gleich anlegt.
describe('serienVorkommen (Spiegel von expand_recurrence)', () => {
  it('wöchentlich', () => {
    expect(starts({ freq: 'weekly', count: 3 })).toEqual(['2026-08-03', '2026-08-10', '2026-08-17'])
  })
  it('alle zwei Wochen über interval', () => {
    expect(starts({ freq: 'weekly', interval: 2, count: 3 })).toEqual(['2026-08-03', '2026-08-17', '2026-08-31'])
  })
  it('until ist inklusiv', () => {
    expect(starts({ freq: 'weekly', until: '2026-08-17' })).toEqual(['2026-08-03', '2026-08-10', '2026-08-17'])
  })
  it('werktags überspringt das Wochenende', () => {
    expect(starts({ freq: 'workdays', count: 3 }, '2026-08-07')).toEqual(['2026-08-07', '2026-08-10', '2026-08-11'])
  })
  it('monatlich am 31. lässt den Februar ausfallen', () => {
    expect(starts({ freq: 'monthly', count: 3 }, '2027-01-31')).toEqual(['2027-01-31', '2027-03-31', '2027-05-31'])
  })
  it('behält die Dauer mehrtägiger Termine', () => {
    expect(serienVorkommen('2026-08-03', '2026-08-04', { freq: 'weekly', count: 2 })).toEqual([
      { start_date: '2026-08-03', end_date: '2026-08-04' },
      { start_date: '2026-08-10', end_date: '2026-08-11' },
    ])
  })
  it('deckelt bei MAX_SERIES_OCCURRENCES', () => {
    expect(serienVorkommen('2026-08-03', null, { freq: 'daily', until: '2099-01-01' })).toHaveLength(MAX_SERIES_OCCURRENCES)
  })
  it('läuft über die Zeitumstellung, ohne einen Tag zu verlieren', () => {
    expect(starts({ freq: 'daily', count: 3 }, '2026-10-24')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
  })
})

describe('draftVorkommen', () => {
  const neu = { ...emptyApptForm('sonstiges'), startDate: '2026-09-07', repeat: 'weekly' as const, repeatUntil: '2026-09-21' }
  it('entfaltet eine neue Serie', () => {
    expect(draftVorkommen(neu).map(v => v.start_date)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21'])
  })
  it('bleibt beim einen Termin, wenn er schon besteht oder kein Ende hat', () => {
    expect(draftVorkommen({ ...neu, id: 'a1' })).toHaveLength(1)
    expect(draftVorkommen({ ...neu, repeatUntil: '' })).toHaveLength(1)
  })
})

const STAFF = [{ id: 's1', name: 'Anna Muster' }, { id: 's2', name: 'Beat Beispiel' }]
function entry(over: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: 'b1', name: 'Dach Meier', kind: 'project',
    start_date: '2026-09-14', end_date: '2026-09-14', start_time: '08:00', end_time: '12:00',
    monteur_ids: ['s1'], ...over,
  } as unknown as CalendarEntry
}
const SLOT = { start_date: '2026-09-07', start_time: '09:00', end_time: '10:00', staffIds: ['s1'] }
const SERIE = serienVorkommen('2026-09-07', null, { freq: 'weekly', until: '2026-09-28' })

describe('serienUeberschneidungen', () => {
  it('findet einen Konflikt, der erst beim zweiten Termin liegt', () => {
    const hits = serienUeberschneidungen([entry({})], SLOT, SERIE, STAFF)
    expect(hits.map(h => [h.staffName, h.entry.id])).toEqual([['Anna Muster', 'b1']])
  })
  it('meldet jeden Einsatz nur einmal, nach Name und Tag sortiert', () => {
    const lang = entry({ id: 'lang', start_date: '2026-09-14', end_date: '2026-09-21', monteur_ids: ['s1', 's2'] })
    const hits = serienUeberschneidungen([entry({ id: 'b2', start_date: '2026-09-28', end_date: '2026-09-28' }), lang],
      { ...SLOT, staffIds: ['s1', 's2'] }, SERIE, STAFF)
    expect(hits.map(h => `${h.staffName}/${h.entry.id}`)).toEqual(['Anna Muster/lang', 'Anna Muster/b2', 'Beat Beispiel/lang'])
  })
  it('lässt ausgeschlossene Einträge und Tage ausserhalb der Serie weg', () => {
    expect(serienUeberschneidungen([entry({})], SLOT, SERIE, STAFF, ['b1'])).toEqual([])
    expect(serienUeberschneidungen([entry({ start_date: '2026-09-15', end_date: '2026-09-15' })], SLOT, SERIE, STAFF)).toEqual([])
  })
})

const FERIEN: ScheduleAbsence = {
  staff_id: 's1', staff_name: 'Anna Muster', type: 'vacation',
  date_start: '2026-09-21', date_end: '2026-09-25', half_day: null, label: 'Ferien 21.09.–25.09.2026',
}

describe('absenzMeldung', () => {
  it('meldet Ferien, die erst ein späterer Serientermin trifft — im Wortlaut des Servers', () => {
    expect(absenzMeldung([FERIEN], ['s1'], SERIE)).toBe('Absenz im Einsatzzeitraum — Anna Muster: Ferien 21.09.–25.09.2026.')
  })
  it('schweigt für andere Mitarbeiter, Lücken zwischen den Terminen und Altzeilen ohne staff_id', () => {
    expect(absenzMeldung([FERIEN], ['s2'], SERIE)).toBeNull()
    expect(absenzMeldung([{ ...FERIEN, date_start: '2026-09-15', date_end: '2026-09-18' }], ['s1'], SERIE)).toBeNull()
    expect(absenzMeldung([{ ...FERIEN, staff_id: null }], ['s1'], SERIE)).toBeNull()
  })
})

describe('absenzVorpruefung', () => {
  beforeEach(() => { vi.mocked(listScheduleAbsences).mockReset() })
  it('lädt das Fenster der ganzen Serie', async () => {
    vi.mocked(listScheduleAbsences).mockResolvedValue([FERIEN])
    expect(await absenzVorpruefung(['s1'], SERIE)).toMatch(/Anna Muster: Ferien/)
    expect(listScheduleAbsences).toHaveBeenCalledWith('2026-09-07', '2026-09-28')
  })
  it('gibt bei einem Ladefehler null zurück — dann prüft der Server', async () => {
    vi.mocked(listScheduleAbsences).mockImplementation(async () => { throw new Error('offline') })
    expect(await absenzVorpruefung(['s1'], SERIE)).toBeNull()
  })
  it('fragt ohne Team gar nicht erst', async () => {
    expect(await absenzVorpruefung([], SERIE)).toBeNull()
    expect(listScheduleAbsences).not.toHaveBeenCalled()
  })
})

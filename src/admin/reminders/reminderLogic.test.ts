import { describe, expect, it } from 'vitest'
import { addDaysISO, addMonthsISO, dueBucket, formatDue, quickDates, targetLabel } from './reminderLogic'

describe('dueBucket', () => {
  it('ordnet nach Kalendertag', () => {
    expect(dueBucket({ due_date: '2026-10-03' }, '2026-10-04')).toBe('overdue')
    expect(dueBucket({ due_date: '2026-10-04' }, '2026-10-04')).toBe('today')
    expect(dueBucket({ due_date: '2026-10-12' }, '2026-10-04')).toBe('upcoming')
  })
})

describe('formatDue', () => {
  it('ohne und mit Uhrzeit', () => {
    expect(formatDue({ due_date: '2026-10-12', due_time: null })).toBe('12.10.2026')
    expect(formatDue({ due_date: '2026-10-12', due_time: '09:30:00' })).toBe('12.10.2026, 09:30')
  })
})

describe('Datumsrechnung', () => {
  it('über die Zeitumstellung hinweg ohne Tagesverlust', () => {
    expect(addDaysISO('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDaysISO('2026-10-25', 1)).toBe('2026-10-26')
  })
  it('über den Jahreswechsel', () => {
    expect(addDaysISO('2026-12-28', 7)).toBe('2027-01-04')
  })
  it('Monatsende wird geklemmt', () => {
    expect(addMonthsISO('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonthsISO('2026-10-04', 1)).toBe('2026-11-04')
  })
  it('Schnellwahl', () => {
    expect(quickDates('2026-10-04').map(q => q.date)).toEqual([
      '2026-10-05', '2026-10-11', '2026-10-18', '2026-11-04',
    ])
  })
})

describe('targetLabel', () => {
  it('Kunde und Projekt', () => {
    expect(targetLabel({
      customer: { id: 'c', name: 'Peter Muster' },
      project: { id: 'p', name: 'Leerwhg.', project_id_text: '261301' },
    })).toBe('Peter Muster · 261301 Leerwhg.')
    expect(targetLabel({ customer: null, project: null })).toBe('')
  })
})

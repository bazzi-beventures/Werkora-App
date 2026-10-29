import { describe, expect, it } from 'vitest'
import type { Project } from '../../api/admin/projects'
import { isWeekendDay, visibleWeekDays, weekendOnlyEntries } from './scheduleShared'
import { getWeekDays } from '../utils/calendarHelpers'

// KW 44/2026: Mo 26.10. … So 1.11.
const week = getWeekDays(new Date(2026, 9, 28))

function entry(start: string, end: string = start): Project {
  return { id: start, start_date: start, end_date: end } as unknown as Project
}

describe('Wochenende ausblenden (WW-56)', () => {
  it('Sa und So sind Wochenende', () => {
    expect(week.map(isWeekendDay)).toEqual([false, false, false, false, false, true, true])
  })

  it('ausgeblendet bleiben Mo–Fr', () => {
    expect(visibleWeekDays(week, true).map(d => d.getDate())).toEqual([26, 27, 28, 29, 30])
    expect(visibleWeekDays(week, false)).toHaveLength(7)
  })

  it('zählt nur Einsätze, die allein am Wochenende liegen', () => {
    const samstag = entry('2026-10-31')
    const freitagBisMontag = entry('2026-10-30', '2026-11-02')
    const mittwoch = entry('2026-10-28')
    expect(weekendOnlyEntries([samstag, freitagBisMontag, mittwoch], week)).toBe(1)
  })
})

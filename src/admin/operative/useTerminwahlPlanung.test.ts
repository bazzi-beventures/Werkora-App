import { describe, expect, it } from 'vitest'
import { RESERVATION_PREFIX, reservationEntries, reservationHinweis } from './useTerminwahlPlanung'
import { isVorschlag } from './scheduleShared'
import type { ScheduleProject } from '../../api/admin'
import type { Reservation } from '../../api/serviceBegleitung'

// Reservationen der Terminwahl in der Plantafel (servicebegleitung.md §7.3): eigene,
// gestrichelte Einträge — keine Termine, deshalb mit dem Vorschlags-Präfix.

const P = { id: 'p-1', name: 'Bad Meier', kind: 'project', monteur_ids: ['s-9'] } as unknown as ScheduleProject
const R: Reservation = {
  id: 'o-1', project_id: 'p-1', datum: '2026-11-19', start: '08:00', ende: '10:00', monteur_ids: ['s-1'],
  status: 'reserviert', text: 'x', reserviert_bis_text: 'Mittwoch, 18. November, 12:00 Uhr',
}

describe('reservationEntries', () => {
  it('macht aus Reservationen Vorschlags-Einträge mit Frist im Etikett', () => {
    const [e] = reservationEntries(new Map([['p-1', P]]), [R])
    expect(e.id).toBe(`${RESERVATION_PREFIX}o-1`)
    expect(isVorschlag(e.id)).toBe(true)
    expect(e.monteur_ids).toEqual(['s-1'])
    expect(e.termin_badge).toBe('Reserviert bis Mittwoch, 18. November, 12:00 Uhr')
  })

  it('lässt Reservationen fremder bzw. ausgeblendeter Projekte weg', () => {
    expect(reservationEntries(new Map(), [R])).toEqual([])
  })
})

describe('reservationHinweis', () => {
  const staff = [{ id: 's-1', name: 'Marco Keller' }, { id: 's-2', name: 'Lea Gut' }] as never
  const slot = (start: string, end: string, staffIds: string[]) =>
    ({ start_date: '2026-11-19', end_date: '2026-11-19', start_time: start, end_time: end, staffIds }) as never

  it('warnt, wenn ein Termin dasselbe Team über eine Reservation legt', () => {
    const t = reservationHinweis([R], slot('09:00', '11:00', ['s-1', 's-2']), staff, () => 'Bad Meier')
    expect(t).toContain('Marco Keller: Bad Meier')
    expect(t).toContain('reserviert bis Mittwoch, 18. November, 12:00 Uhr')
    expect(t).not.toContain('Lea Gut')
  })

  it('schweigt bei anderem Monteur oder anderer Zeit', () => {
    expect(reservationHinweis([R], slot('09:00', '11:00', ['s-2']), staff, () => '')).toBeNull()
    expect(reservationHinweis([R], slot('10:00', '12:00', ['s-1']), staff, () => '')).toBeNull()
  })
})

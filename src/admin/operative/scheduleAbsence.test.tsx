import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import ProjectScheduleCalendar, { CalendarEntry } from './ProjectScheduleCalendar'
import { absenceLookup } from './scheduleShared'
import type { ScheduleAbsence } from '../../api/admin/scheduling'
import { getWeekDays, toDateStr } from '../utils/calendarHelpers'

// Absenzen in der Einsatzplanung. Bis 2026-08 lud der Screen sie gar nicht — man
// konnte jemanden in eine genehmigte Ferienwoche ziehen, ohne dass irgendetwas
// warnte. Die Markierung hier ist der Teil, der den Fehler VERHINDERT; die
// serverseitige Sperre (409 mit Rückfrage) fängt ihn ab.

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return { ...actual, resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }) }
})

const week = getWeekDays(new Date())
const MON = toDateStr(week[0])
const TUE = toDateStr(week[1])
const WED = toDateStr(week[2])

function absence(over: Partial<ScheduleAbsence> = {}): ScheduleAbsence {
  return {
    staff_id: 's1', staff_name: 'Anna Muster', type: 'vacation',
    date_start: MON, date_end: TUE, label: 'Ferien', ...over,
  }
}

describe('absenceLookup', () => {
  it('trifft den ersten und den letzten Absenztag', () => {
    const at = absenceLookup([absence({ date_start: '2026-08-24', date_end: '2026-08-28' })])
    expect(at('s1', '2026-08-24')).toBe('Ferien')
    expect(at('s1', '2026-08-26')).toBe('Ferien')
    expect(at('s1', '2026-08-28')).toBe('Ferien')
  })

  it('lässt den Tag davor und den Tag danach frei', () => {
    const at = absenceLookup([absence({ date_start: '2026-08-24', date_end: '2026-08-28' })])
    expect(at('s1', '2026-08-23')).toBeNull()
    expect(at('s1', '2026-08-29')).toBeNull()
  })

  it('bindet die Absenz an ihren Mitarbeiter', () => {
    const at = absenceLookup([absence({ date_start: '2026-08-24', date_end: '2026-08-24' })])
    expect(at('s2', '2026-08-24')).toBeNull()
  })

  it('behandelt eine Absenz ohne Enddatum als eintägig', () => {
    const at = absenceLookup([absence({ date_start: '2026-08-24', date_end: '' })])
    expect(at('s1', '2026-08-24')).toBe('Ferien')
    expect(at('s1', '2026-08-25')).toBeNull()
  })

  it('ignoriert Altzeilen ohne staff_id, statt sie irgendeiner Zeile zuzuordnen', () => {
    const at = absenceLookup([absence({ staff_id: null, date_start: '2026-08-24', date_end: '2026-08-24' })])
    expect(at('s1', '2026-08-24')).toBeNull()
  })

  it('findet die passende Absenz, wenn jemand mehrere hat', () => {
    const at = absenceLookup([
      absence({ date_start: '2026-08-03', date_end: '2026-08-07', label: 'Ferien im August' }),
      absence({ date_start: '2026-09-01', date_end: '2026-09-02', label: 'Militärdienst' }),
    ])
    expect(at('s1', '2026-09-01')).toBe('Militärdienst')
    expect(at('s1', '2026-08-20')).toBeNull()
  })
})

// ─── Markierung in der Plantafel ────────────────────────────────────────────

const STAFF = [
  { id: 's1', name: 'Anna Muster' },
  { id: 's2', name: 'Beat Beispiel' },
]

const CONFIG = {
  fields: {}, colors: {},
  views: { month: false, week: false, staff: false, plantafel: true, gantt: false },
}

function entry(over: Partial<CalendarEntry> = {}): CalendarEntry {
  const base = {
    id: 'a1', name: 'Projekt Alpha', kind: 'project',
    start_date: MON, end_date: MON, start_time: '09:00', end_time: '11:00',
    monteur_ids: ['s1'],
  } as unknown as CalendarEntry
  return { ...base, ...over }
}

function renderBoard(absences: ScheduleAbsence[]) {
  return render(
    <ProjectScheduleCalendar
      projects={[entry()]}
      staff={STAFF}
      loading={false}
      onSelect={vi.fn()}
      onReschedule={vi.fn()}
      schedulingConfig={CONFIG as never}
      absences={absences}
    />,
  )
}

function rows(container: HTMLElement) {
  return [...container.querySelectorAll('.project-cal-board-row:not(.project-cal-board-header)')]
}

describe('Plantafel-Markierung', () => {
  it('markiert die Tage des Abwesenden und nennt den Grund', () => {
    const { container } = renderBoard([
      absence({ date_start: MON, date_end: TUE, label: 'Ferien 24.08.–25.08.2026' }),
    ])
    const annaCells = [...rows(container)[0].querySelectorAll('.project-cal-board-cell')]
    expect(annaCells[0].className).toContain('absent')
    expect(annaCells[1].className).toContain('absent')
    expect(annaCells[2].className).not.toContain('absent')
    expect(annaCells[0].textContent).toContain('Ferien 24.08.–25.08.2026')
  })

  it('lässt die Zeile des anderen Monteurs unberührt', () => {
    const { container } = renderBoard([absence({ date_start: MON, date_end: WED })])
    const beatCells = [...rows(container)[1].querySelectorAll('.project-cal-board-cell')]
    expect(beatCells.every(c => !c.className.includes('absent'))).toBe(true)
  })

  it('ohne Absenzen bleibt die Tafel unverändert', () => {
    const { container } = renderBoard([])
    expect(container.querySelectorAll('.project-cal-board-cell.absent').length).toBe(0)
  })
})

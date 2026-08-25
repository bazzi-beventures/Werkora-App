import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleCalendar, { CalendarEntry } from './ProjectScheduleCalendar'
import { type SchedulingConfig } from '../../api/admin'
import { getWeekDays, toDateStr } from '../utils/calendarHelpers'
import { scheduledDayIsoSet, pillClass } from './scheduleShared'
import type { Project } from '../../api/admin/projects'

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return { ...actual, resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }) }
})

// Mini-Monatskalender: Sprung auf einen beliebigen Tag aus jeder Ansicht heraus,
// ohne sich tageweise durchzuklicken. Dazu die Punkte (Tage mit Einsätzen) und
// die schraffierte Blocker-Kachel.

const STAFF = [{ id: 's1', name: 'Anna Muster' }]

const week = getWeekDays(new Date())
const MON = toDateStr(week[0])

function entry(over: Partial<CalendarEntry>): CalendarEntry {
  const base = {
    id: 'a1',
    name: 'Projekt Alpha',
    kind: 'project',
    start_date: MON,
    end_date: MON,
    start_time: '09:00',
    end_time: '11:00',
    monteur_ids: ['s1'],
  } as unknown as CalendarEntry
  return { ...base, ...over }
}

const CONFIG: SchedulingConfig = {
  fields: {},
  colors: {},
  views: { month: false, week: false, staff: false, plantafel: true, gantt: true },
}

function renderCal(entries: CalendarEntry[] = [entry({})]) {
  return render(
    <ProjectScheduleCalendar
      projects={entries}
      staff={STAFF}
      loading={false}
      onSelect={vi.fn()}
      onReschedule={vi.fn()}
      schedulingConfig={CONFIG}
    />,
  )
}

function openPicker() {
  return userEvent.click(screen.getByTitle('Monatsübersicht öffnen und Tag wählen'))
}

describe('Mini-Monatskalender', () => {
  it('ist auch dann erreichbar, wenn die Monatsansicht abgeschaltet ist', async () => {
    renderCal()
    // Der Mandant hat month/week/staff aus — trotzdem gibt es den Datumssprung.
    expect(screen.queryByRole('button', { name: 'Monat' })).toBeNull()
    await openPicker()
    expect(screen.getByRole('dialog', { name: 'Datum wählen' })).toBeTruthy()
  })

  it('springt bei Klick auf einen Tag dorthin und schliesst sich', async () => {
    renderCal()
    const trigger = screen.getByTitle('Monatsübersicht öffnen und Tag wählen')
    await openPicker()
    // Einen Monat vorblättern und dort den 15. wählen — er liegt sicher in einer
    // anderen Woche als heute (die Plantafel betitelt sich mit der Woche).
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }))
    const dialog = screen.getByRole('dialog', { name: 'Datum wählen' })
    await userEvent.click(within(dialog).getByRole('button', { name: '15' }))

    expect(screen.queryByRole('dialog', { name: 'Datum wählen' })).toBeNull()
    const next = new Date()
    next.setDate(1)
    next.setMonth(next.getMonth() + 1)
    const mm = String(next.getMonth() + 1).padStart(2, '0')
    // Die Woche um den 15. liegt vollständig im Folgemonat.
    expect(trigger.textContent).toContain(`.${mm}.`)
  })

  it('blättert den Monat, ohne die Ansicht zu verschieben', async () => {
    renderCal()
    const trigger = screen.getByTitle('Monatsübersicht öffnen und Tag wählen')
    const before = trigger.textContent
    await openPicker()
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }))
    // Nur geblättert, nichts gewählt → die Ansicht steht noch, wo sie stand.
    expect(trigger.textContent).toBe(before)
  })

  it('markiert Tage mit Einsätzen mit einem Punkt', async () => {
    renderCal()
    await openPicker()
    const dialog = screen.getByRole('dialog', { name: 'Datum wählen' })
    const dots = dialog.querySelectorAll('.project-cal-datepicker-dot')
    // Genau der eine Einsatztag der Testdaten (sofern im gezeigten Monat).
    const monInThisMonth = new Date(MON).getMonth() === new Date().getMonth()
    expect(dots.length).toBe(monInThisMonth ? 1 : 0)
  })

  it('schliesst mit Escape', async () => {
    renderCal()
    await openPicker()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Datum wählen' })).toBeNull()
  })
})

describe('scheduledDayIsoSet', () => {
  const p = (over: Partial<Project>) => ({ start_date: null, end_date: null, ...over } as Project)

  it('zählt jeden Tag eines mehrtägigen Einsatzes', () => {
    const set = scheduledDayIsoSet([p({ start_date: '2026-08-03', end_date: '2026-08-05' })])
    expect([...set].sort()).toEqual(['2026-08-03', '2026-08-04', '2026-08-05'])
  })

  it('kommt mit fehlendem Enddatum und Einsätzen ohne Termin zurecht', () => {
    const set = scheduledDayIsoSet([
      p({ start_date: '2026-08-03' }),
      p({}),
    ])
    expect([...set]).toEqual(['2026-08-03'])
  })

  it('deckelt einen kaputten Zeitraum, statt endlos zu laufen', () => {
    // end_date im Jahr 9999 darf die Schleife nicht sprengen.
    const set = scheduledDayIsoSet([p({ start_date: '2026-08-03', end_date: '9999-01-01' })])
    expect(set.size).toBe(401) // Starttag + MAX_SPAN_DAYS
  })
})

describe('Blocker (provisorische Planung)', () => {
  it('bekommt die Schraffur-Klasse, andere Arten nicht', () => {
    expect(pillClass({ kind: 'blocker' } as Project)).toBe(' provisional')
    expect(pillClass({ kind: 'project' } as Project)).toBe('')
    expect(pillClass({ kind: 'reservation' } as Project)).toBe('')
  })

  it('zeichnet die Kachel in der Plantafel schraffiert', () => {
    const { container } = renderCal([
      entry({ id: 'b1', kind: 'blocker', name: 'evtl. Baustelle Müller' }),
    ])
    const chip = container.querySelector('.project-cal-board-chip')
    expect(chip).toBeTruthy()
    expect(chip!.className).toContain('provisional')
  })

  it('lässt fest geplante Einsätze unschraffiert', () => {
    const { container } = renderCal([entry({})])
    expect(container.querySelector('.project-cal-board-chip')!.className)
      .not.toContain('provisional')
  })
})

describe('Punkte folgen dem Monteur-Filter', () => {
  it('zeigt keinen Punkt für ausgeblendete Monteure', async () => {
    renderCal([entry({ start_date: MON, end_date: MON })])
    // Alle Monteure ausblenden → keine sichtbaren Einsätze → keine Punkte.
    await userEvent.click(screen.getByRole('button', { name: 'Alle ausblenden' }))
    await openPicker()
    const dialog = screen.getByRole('dialog', { name: 'Datum wählen' })
    expect(dialog.querySelectorAll('.project-cal-datepicker-dot').length).toBe(0)
  })
})

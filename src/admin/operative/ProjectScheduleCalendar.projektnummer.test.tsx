import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleCalendar, { CalendarEntry } from './ProjectScheduleCalendar'
import { entryTitle } from './scheduleShared'
import { toDateStr } from '../utils/calendarHelpers'

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return { ...actual, resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }) }
})

// Zwei Verhalten der Kalenderkachel:
//   1. Die Projektnummer steht vor dem Namen — auch bei neu angelegten Projekten,
//      die sie (anders als die Import-Altbestände) nur in project_id_text tragen.
//   2. Doppelklick öffnet das Projekt statt nur das Termin-Panel.

const STAFF = [{ id: 's1', name: 'Anna Muster' }]

// «Heute» statt Montag der laufenden Woche: der Montag kann im Vormonat liegen
// (z. B. am 1. September, Mo = 31. August), dann fehlt der Einsatz in der
// Monatsansicht und die Kachel-Tests laufen rot. Heute liegt immer in beiden
// Ansichten — Woche (7 Tage) wie Monat.
const TODAY = toDateStr(new Date())

function entry(over: Partial<CalendarEntry>): CalendarEntry {
  const base = {
    id: 'a1',
    name: 'Leerwhg. Tösstalstr. 134 Winterthur',
    project_id_text: '261301',
    kind: 'project',
    start_date: TODAY,
    end_date: TODAY,
    start_time: '13:30',
    end_time: '15:00',
    monteur_ids: ['s1'],
  } as unknown as CalendarEntry
  return { ...base, ...over }
}

function renderCal(over: Partial<CalendarEntry> = {}, onOpenProject?: (p: unknown) => void) {
  return render(
    <ProjectScheduleCalendar
      projects={[entry(over)]}
      staff={STAFF}
      loading={false}
      onSelect={vi.fn()}
      onOpenProject={onOpenProject as never}
      onReschedule={vi.fn()}
    />,
  )
}

describe('entryTitle', () => {
  it('stellt die Projektnummer vor den Namen', () => {
    expect(entryTitle(entry({}))).toBe('261301 Leerwhg. Tösstalstr. 134 Winterthur')
  })

  it('verdoppelt eine im Namen schon enthaltene Nummer nicht', () => {
    const p = entry({ name: '261125 Heller Winterthur Ersatz', project_id_text: '261125' })
    expect(entryTitle(p)).toBe('261125 Heller Winterthur Ersatz')
  })

  it('lässt Einsätze ohne Nummer (interne Einsätze) unverändert', () => {
    expect(entryTitle(entry({ project_id_text: null, name: 'Teamsitzung' }))).toBe('Teamsitzung')
    expect(entryTitle(entry({ project_id_text: '  ', name: 'Werkstatt' }))).toBe('Werkstatt')
  })
})

describe('Projektnummer auf der Kachel', () => {
  it('zeigt sie in der Monatsansicht', () => {
    renderCal()
    expect(screen.getAllByText(/261301 Leerwhg\. Tösstalstr\. 134 Winterthur/).length).toBeGreaterThan(0)
  })

  it('zeigt sie in der Wochenansicht', async () => {
    renderCal()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Woche' }))
    expect(screen.getAllByText(/261301 Leerwhg\./).length).toBeGreaterThan(0)
  })
})

describe('Doppelklick auf einen Einsatz', () => {
  it('meldet das Projekt hoch (Sprung in die Projektmaske)', async () => {
    const onOpenProject = vi.fn()
    const { container } = renderCal({}, onOpenProject)
    const pill = container.querySelector('.project-cal-pill') as HTMLElement
    await userEvent.setup().dblClick(pill)
    expect(onOpenProject).toHaveBeenCalledTimes(1)
    expect(onOpenProject.mock.calls[0][0]).toMatchObject({ id: 'a1' })
  })

  it('bleibt ohne Handler beim Einfachklick, ohne zu werfen', async () => {
    const { container } = renderCal({}, undefined)
    const pill = container.querySelector('.project-cal-pill') as HTMLElement
    await userEvent.setup().dblClick(pill)
    expect(pill).toBeTruthy()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleCalendar, { CalendarEntry } from './ProjectScheduleCalendar'
import { getWeekDays, toDateStr } from '../utils/calendarHelpers'

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return { ...actual, resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }) }
})

// Mitarbeiteransicht («Mitarbeiter»-Knopf): der Plan EINES Mitarbeiters.
// Maßgeblich ist allein das Team des Einsatzes — die Projektleitung ist keine
// Zuweisung. Sonst steht im Plan des Projektleiters sein ganzes Portfolio, auf
// dem er gar nicht draussen ist, und der Bildschirm widerspricht dem
// Wochenplan-PDF derselben Woche (services/schedule_export.py sektioniert nur
// nach monteur_ids).

const STAFF = [
  { id: 's1', name: 'Anna Muster' },
  { id: 's2', name: 'Beat Beispiel' },
]

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

function renderCal(entries: CalendarEntry[]) {
  return render(
    <ProjectScheduleCalendar
      projects={entries}
      staff={STAFF}
      loading={false}
      onSelect={vi.fn()}
      onReschedule={vi.fn()}
    />,
  )
}

/** In die Mitarbeiteransicht wechseln und auf den Mitarbeiter scharfstellen. */
async function focusStaff(name: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Mitarbeiter' }))
  await user.selectOptions(screen.getByRole('combobox'), [
    STAFF.find(s => s.name === name)!.id,
  ])
}

describe('Mitarbeiteransicht', () => {
  it('zeigt nur Einsätze, in deren Team der Mitarbeiter steht', async () => {
    const { container } = renderCal([
      entry({ id: 'a1', name: 'Projekt Alpha', monteur_ids: ['s1'] }),
      entry({ id: 'a2', name: 'Projekt Beta', monteur_ids: ['s2'] }),
    ])
    await focusStaff('Anna Muster')

    expect(container.textContent).toContain('Projekt Alpha')
    expect(container.textContent).not.toContain('Projekt Beta')
  })

  it('zeigt dem Projektleiter seine Projekte NICHT, wenn er nicht im Team ist', async () => {
    const { container } = renderCal([
      entry({ id: 'a1', name: 'Projekt Alpha', monteur_ids: ['s1'], projektleiter_id: 's2' }),
    ])
    await focusStaff('Beat Beispiel')

    expect(container.textContent).not.toContain('Projekt Alpha')
  })

  it('zeigt den Einsatz sehr wohl, wenn der Projektleiter selbst mitfährt', async () => {
    const { container } = renderCal([
      entry({ id: 'a1', name: 'Projekt Alpha', monteur_ids: ['s1', 's2'], projektleiter_id: 's2' }),
    ])
    await focusStaff('Beat Beispiel')

    expect(container.textContent).toContain('Projekt Alpha')
  })
})

// WW-68: aus Plantafel und Tagesplan per Klick auf den Namen in die
// Mitarbeiter-Ansicht — statt über den Reiter oben und die Auswahl dort.
describe('Name in der linken Spalte', () => {
  for (const ansicht of ['Plantafel', 'Tagesplan']) {
    it(`öffnet aus der ${ansicht} die Mitarbeiter-Ansicht dieses Monteurs`, async () => {
      const user = userEvent.setup()
      const { container } = renderCal([
        entry({ id: 'a1', name: 'Projekt Alpha', monteur_ids: ['s1'] }),
        entry({ id: 'a2', name: 'Projekt Beta', monteur_ids: ['s2'] }),
      ])
      await user.click(screen.getByRole('button', { name: ansicht }))
      await user.click(screen.getByTitle('Mitarbeiter-Ansicht von Beat Beispiel öffnen'))

      expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('s2')
      expect(container.textContent).toContain('Projekt Beta')
      expect(container.textContent).not.toContain('Projekt Alpha')
    })
  }

  it('bleibt Text, wenn der Mandant die Mitarbeiter-Ansicht nicht hat', async () => {
    const user = userEvent.setup()
    render(
      <ProjectScheduleCalendar
        projects={[entry({})]}
        staff={STAFF}
        loading={false}
        onSelect={vi.fn()}
        onReschedule={vi.fn()}
        schedulingConfig={{ fields: {}, colors: {}, views: { month: false, week: false, staff: false, plantafel: true, gantt: true } }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))
    expect(screen.queryByTitle('Mitarbeiter-Ansicht von Anna Muster öffnen')).toBeNull()
    expect(document.querySelector('.project-cal-board-staff')?.textContent).toBeTruthy()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleCalendar, { CalendarEntry } from './ProjectScheduleCalendar'
import { getWeekDays, toDateStr } from '../utils/calendarHelpers'
import type { ScheduleAbsence } from '../../api/admin/scheduling'
import { absenceKind, pillExtraLines } from './scheduleShared'

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return { ...actual, resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }) }
})

let mobile = false
vi.mock('../useIsMobile', () => ({ useIsMobile: () => mobile }))

// docs/specs/einsatzplanung-rueckmeldungen-2026-10.md
//   §7 — genehmigte Ferien in ALLEN Ansichten, nicht nur in der Plantafel: wer in
//        Woche oder Mitarbeiter-Ansicht plante, erfuhr erst beim Speichern davon.
//   §4 — Kürzel statt Namen in Mitarbeiter-Ansicht und Agenda, analog Tagesplan.

const STAFF = [
  { id: 's1', name: 'Anna Muster' },
  { id: 's2', name: 'Beat Beispiel' },
]

const week = getWeekDays(new Date())
const MON = toDateStr(week[0])
const TUE = toDateStr(week[1])

const FERIEN: ScheduleAbsence = {
  staff_id: 's2', staff_name: 'Beat Beispiel', type: 'vacation',
  date_start: MON, date_end: MON, label: 'Ferien 01.01.–01.01.2027',
}

function entry(over: Partial<CalendarEntry> = {}): CalendarEntry {
  const base = {
    id: 'a1',
    name: 'Projekt Alpha',
    kind: 'project',
    start_date: TUE,
    end_date: TUE,
    start_time: '09:00',
    end_time: '11:00',
    monteur_ids: ['s1', 's2'],
  } as unknown as CalendarEntry
  return { ...base, ...over }
}

function renderCal(opts: {
  entries?: CalendarEntry[]
  absences?: ScheduleAbsence[]
  fields?: Record<string, boolean>
} = {}) {
  return render(
    <ProjectScheduleCalendar
      projects={opts.entries ?? [entry()]}
      staff={STAFF}
      loading={false}
      onSelect={vi.fn()}
      onReschedule={vi.fn()}
      absences={opts.absences ?? [FERIEN]}
      schedulingConfig={opts.fields ? { fields: opts.fields, colors: {} } : undefined}
    />,
  )
}

async function zeige(ansicht: string) {
  await userEvent.click(screen.getByRole('button', { name: ansicht }))
}

beforeEach(() => { mobile = false })

describe('Ferien in allen Ansichten (§7)', () => {
  it('Woche: Abwesend-Zeile mit Kürzel und Art, voller Name und Label im title', async () => {
    renderCal()
    await zeige('Woche')
    const chip = screen.getByText('BB Ferien')
    expect(chip).toHaveAttribute('title', 'Beat Beispiel: Ferien 01.01.–01.01.2027')
    expect(screen.getByText('Abwesend')).toBeInTheDocument()
  })

  it('Woche: ohne Absenz in der Woche keine Abwesend-Zeile', async () => {
    renderCal({ absences: [] })
    await zeige('Woche')
    expect(screen.queryByText('Abwesend')).toBeNull()
  })

  it('Woche: ausgeblendete Mitarbeiter zeigen auch keine Ferien', async () => {
    renderCal()
    await zeige('Woche')
    await userEvent.click(screen.getByRole('button', { name: 'Beat Beispiel' }))
    expect(screen.queryByText('BB Ferien')).toBeNull()
  })

  it('Mitarbeiter-Ansicht: volles Label, Tagesspalte schraffiert — nur für den Fokussierten', async () => {
    const { container } = renderCal()
    await zeige('Mitarbeiter')
    // Fokus steht auf Anna — die ist nicht weg.
    expect(screen.queryByText('Ferien 01.01.–01.01.2027')).toBeNull()
    await userEvent.selectOptions(screen.getByRole('combobox'), ['s2'])
    expect(screen.getByText('Ferien 01.01.–01.01.2027')).toBeInTheDocument()
    expect(container.querySelectorAll('.project-cal-week-day-col.absent')).toHaveLength(1)
  })

  it('Tagesplan: Band in der Zeile des Abwesenden, nicht bei den anderen', async () => {
    // Der Tagesplan beginnt bei «heute», nicht beim Montag — die Absenz deckt
    // deshalb die ganze Woche, sichtbar ist je nach Wochentag mindestens ein Tag.
    renderCal({ absences: [{ ...FERIEN, date_end: toDateStr(week[6]) }] })
    await zeige('Tagesplan')
    const baender = screen.getAllByTestId('gantt-absence')
    expect(baender[0]).toHaveTextContent('Ferien 01.01.–01.01.2027')
    // Alle Bänder liegen in Beats Zeile, keines bei Anna.
    const zeilen = new Set(baender.map(b => b.closest('.project-cal-gantt-row')))
    expect(zeilen.size).toBe(1)
    const zeile = [...zeilen][0] as HTMLElement
    expect(within(zeile).getByText('Beat Beispiel')).toBeInTheDocument()
  })

  it('Monat: ein Marker je Tag mit den Namen im title', () => {
    renderCal()
    const marker = screen.getByText('1 abwesend')
    expect(marker).toHaveAttribute('title', 'Beat Beispiel: Ferien 01.01.–01.01.2027')
  })

  it('Agenda (Handy): Ferien-Chip am Tag', () => {
    mobile = true
    renderCal()
    expect(screen.getByText('BB Ferien')).toBeInTheDocument()
  })

})

describe('Ferien grün, Einsätze im Hintergrund (WW-59)', () => {
  const TODAY = toDateStr(new Date())
  const GANZE_WOCHE: ScheduleAbsence = { ...FERIEN, date_start: toDateStr(week[0]), date_end: toDateStr(week[6]) }
  const KRANK: ScheduleAbsence = { ...GANZE_WOCHE, staff_id: 's1', staff_name: 'Anna Muster', type: 'sick', label: 'Krank' }

  it('Tagesplan: Ferien-Band grün, Krank bleibt grau; Balken am Ferientag blass', async () => {
    const { container } = renderCal({
      entries: [entry({ start_date: TODAY, end_date: TODAY, name: 'Büro', start_time: null, end_time: null })],
      absences: [GANZE_WOCHE, KRANK],
    })
    await zeige('Tagesplan')
    const baender = screen.getAllByTestId('gantt-absence')
    const ferien = baender.filter(b => b.textContent?.startsWith('Ferien'))
    const krank = baender.filter(b => b.textContent === 'Krank')
    expect(ferien.length).toBeGreaterThan(0)
    expect(ferien.every(b => b.classList.contains('vacation'))).toBe(true)
    expect(krank.length).toBeGreaterThan(0)
    expect(krank.some(b => b.classList.contains('vacation'))).toBe(false)
    // «Büro» liegt bei Anna (krank) und Beat (Ferien) — nur Beats Balken tritt zurück.
    const bars = [...container.querySelectorAll('.project-cal-gantt-bar')]
    const beat = bars.filter(b => within(b.closest('.project-cal-gantt-row') as HTMLElement).queryByText('Beat Beispiel'))
    const anna = bars.filter(b => within(b.closest('.project-cal-gantt-row') as HTMLElement).queryByText('Anna Muster'))
    expect(beat.length).toBe(1)
    expect(beat[0]).toHaveClass('on-vacation')
    expect(anna.length).toBe(1)
    expect(anna[0]).not.toHaveClass('on-vacation')
  })

  it('Plantafel: Ferienzelle grün markiert, andere Absenz nicht', async () => {
    const { container } = renderCal({ absences: [GANZE_WOCHE, KRANK] })
    await zeige('Plantafel')
    expect(container.querySelectorAll('.project-cal-board-cell.absent.vacation')).toHaveLength(7)
    expect(container.querySelectorAll('.project-cal-board-cell.absent:not(.vacation)')).toHaveLength(7)
  })

  it('Woche: Ferien-Chip grün, Mitarbeiter-Ansicht färbt den Tag', async () => {
    const { container } = renderCal()
    await zeige('Woche')
    expect(screen.getByText('BB Ferien')).toHaveClass('vacation')
    await zeige('Mitarbeiter')
    await userEvent.selectOptions(screen.getByRole('combobox'), ['s2'])
    expect(container.querySelectorAll('.project-cal-week-day-col.absent.vacation')).toHaveLength(1)
  })
})

describe('Kürzel statt Namen (§4)', () => {
  it('Woche und Mitarbeiter-Ansicht zeigen die Crew als Kürzel-Chips, Lead zuerst', async () => {
    const { container } = renderCal({ absences: [] })
    await zeige('Woche')
    const chips = () => [...container.querySelectorAll('.project-cal-week-event .schedule-crew-chip')]
    expect(chips().map(c => c.textContent)).toEqual(['AM', 'BB'])
    expect(chips()[0]).toHaveClass('lead')

    await zeige('Mitarbeiter')
    expect(chips().map(c => c.textContent)).toEqual(['AM', 'BB'])
  })

  it('Agenda (Handy) zeigt Kürzel statt voller Namen', () => {
    mobile = true
    const { container } = renderCal({ absences: [] })
    const karte = container.querySelector('.project-cal-agenda-event') as HTMLElement
    expect([...karte.querySelectorAll('.schedule-crew-chip')].map(c => c.textContent)).toEqual(['AM', 'BB'])
    expect(within(karte).queryByText(/Anna Muster/)).toBeNull()
  })

  it('PL-Zeile als Kürzel auf den Kacheln, voller Name für die Plantafel', () => {
    const p = entry({ projektleiter_id: 's1' } as Partial<CalendarEntry>)
    const fields = { projektleiter: true }
    expect(pillExtraLines(p, STAFF, fields, { plKuerzel: true })).toEqual(['PL: AM'])
    expect(pillExtraLines(p, STAFF, fields)).toEqual(['PL: Anna Muster'])
  })

  it('Filter-Chips: Kürzel sichtbar, voller Name als Tooltip und zugänglicher Name', async () => {
    renderCal({ absences: [] })
    await zeige('Woche')
    const chip = screen.getByRole('button', { name: 'Anna Muster' })
    expect(chip).toHaveTextContent('AM')
    expect(chip).toHaveAttribute('title', 'Anna Muster')
  })

  it('die Auswahlliste der Mitarbeiter-Ansicht behält volle Namen', async () => {
    renderCal({ absences: [] })
    await zeige('Mitarbeiter')
    expect(within(screen.getByRole('combobox')).getByRole('option', { name: 'Beat Beispiel' })).toBeInTheDocument()
  })
})

describe('absenceKind', () => {
  it('nimmt alles vor dem ersten Datum', () => {
    expect(absenceKind('Ferien 24.08.–28.08.2026')).toBe('Ferien')
    expect(absenceKind('Militär/Zivildienst 01.09.2026')).toBe('Militär/Zivildienst')
    expect(absenceKind('Unbezahlt')).toBe('Unbezahlt')
  })
})

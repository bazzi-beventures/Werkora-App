import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleCalendar, { CalendarEntry } from './ProjectScheduleCalendar'
import {
  computeWeekHours, tileLayout, WEEK_ZOOM_LEVELS, WEEK_ZOOM_DEFAULT,
} from '../utils/weekGrid'
import { type SchedulingConfig } from '../../api/admin'
import { getWeekDays, toDateStr } from '../utils/calendarHelpers'

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return { ...actual, resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }) }
})

// Wochen-Zeitraster (Ansichten «Woche» und «Mitarbeiter»). Getestet wird, dass
// Kacheln nur vollständige Zeilen rendern statt Text abzuschneiden, dass das
// Raster auf die belegten Stunden schrumpft und dass Zoom + Hover-Karte greifen.

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

const WITH_ADDRESS: SchedulingConfig = { fields: { address: true }, colors: {} }

function renderCal(opts: { entries?: CalendarEntry[]; config?: SchedulingConfig } = {}) {
  return render(
    <ProjectScheduleCalendar
      projects={opts.entries ?? [entry({})]}
      staff={STAFF}
      loading={false}
      onSelect={vi.fn()}
      onReschedule={vi.fn()}
      schedulingConfig={opts.config}
    />,
  )
}

async function openWeek() {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Woche' }))
}

// Höhe einer Rasterzeile (px) aus dem gerenderten Stundenkasten.
function hourCellHeight(container: HTMLElement): string {
  const cell = container.querySelector('.project-cal-week-hour-cell') as HTMLElement
  return cell.style.height
}

beforeEach(() => localStorage.clear())

describe('computeWeekHours', () => {
  it('zeigt ohne Termine das Standardfenster 07–18', () => {
    expect(computeWeekHours([])).toEqual({ startHour: 7, endHour: 18 })
  })

  it('wächst nach unten und oben mit den tatsächlichen Terminen', () => {
    const entries = [
      entry({ start_time: '06:30', end_time: '07:00' }),
      entry({ start_time: '17:00', end_time: '19:30' }),
    ]
    expect(computeWeekHours(entries)).toEqual({ startHour: 6, endHour: 20 })
  })

  it('rechnet ohne Endzeit mit einer Stunde', () => {
    expect(computeWeekHours([entry({ start_time: '18:30', end_time: null })]).endHour).toBe(20)
  })

  it('ignoriert ganztägige Einträge (die liegen im eigenen Strip)', () => {
    expect(computeWeekHours([entry({ start_time: null, end_time: null })]))
      .toEqual({ startHour: 7, endHour: 18 })
  })

  it('deckelt kaputte Zeiten, statt das Raster auf 24 Stunden aufzublähen', () => {
    const entries = [entry({ start_time: '00:00', end_time: '23:59' })]
    expect(computeWeekHours(entries)).toEqual({ startHour: 4, endHour: 23 })
  })
})

describe('tileLayout', () => {
  it('legt Uhrzeit und Name in eine Zeile, wenn die Kachel zu flach ist', () => {
    expect(tileLayout(29, 2)).toEqual({ inline: true, nameLines: 1, extraLines: 0 })
  })

  it('zeigt eine Zusatzzeile erst, wenn sie ganz hineinpasst', () => {
    // 9 Padding + 13 Uhrzeit + 14 Name = 36 → darunter kein Platz für Extras.
    expect(tileLayout(45, 3).extraLines).toBe(0)
    expect(tileLayout(49, 3).extraLines).toBe(1)
  })

  it('gibt Zusatzfeldern Vorrang vor der zweiten Namenszeile', () => {
    const layout = tileLayout(52, 1)
    expect(layout).toMatchObject({ inline: false, nameLines: 1, extraLines: 1 })
  })

  it('nimmt die zweite Namenszeile dazu, sobald Platz übrig bleibt', () => {
    expect(tileLayout(120, 1)).toMatchObject({ nameLines: 2, extraLines: 1 })
  })

  it('rendert nie mehr Zusatzzeilen als vorhanden', () => {
    expect(tileLayout(300, 2).extraLines).toBe(2)
  })

  it('kürzt bei drei parallelen Einsätzen auf eine Zusatzzeile (kaum Breite)', () => {
    expect(tileLayout(300, 4, 3).extraLines).toBe(1)
    expect(tileLayout(300, 4, 2).extraLines).toBe(4)
  })
})

describe('Wochen-Zeitraster', () => {
  it('lässt Zusatzfelder weg, statt sie halb abzuschneiden', async () => {
    const { container } = renderCal({
      config: WITH_ADDRESS,
      entries: [
        entry({ id: 'kurz', name: 'Kurzeinsatz', start_time: '08:00', end_time: '08:30', object_address: 'Rehbergstrasse 12' }),
        entry({ id: 'lang', name: 'Ganztageseinsatz', start_time: '13:00', end_time: '16:00', object_address: 'Landvogt-Waser-Strasse 77' }),
      ],
    })
    await openWeek()

    const kurz = container.querySelector('[data-testid], .project-cal-week-event.tight') as HTMLElement
    expect(kurz).toHaveTextContent('Kurzeinsatz')
    expect(kurz).not.toHaveTextContent('Rehbergstrasse')

    // Der lange Einsatz hat Höhe für die Adresse.
    expect(screen.getByText('Landvogt-Waser-Strasse 77')).toBeInTheDocument()
    expect(screen.queryByText('Rehbergstrasse 12')).not.toBeInTheDocument()
  })

  it('staffelt parallele Einsätze, statt die Spalte gleichmässig zu teilen', async () => {
    const { container } = renderCal({
      entries: [
        entry({ id: 'p1', name: 'Erster', start_time: '09:00', end_time: '12:00' }),
        entry({ id: 'p2', name: 'Zweiter', start_time: '09:30', end_time: '12:00' }),
        entry({ id: 'p3', name: 'Dritter', start_time: '10:00', end_time: '12:00' }),
      ],
    })
    await openWeek()

    const blocks = [...container.querySelectorAll('.project-cal-week-event.stacked')] as HTMLElement[]
    expect(blocks).toHaveLength(3)
    // Drei Lanes: Einheit 33.33 %, mit Überlappung 53.33 % statt 33.33 %.
    expect(blocks[0].style.width).toBe('calc(53.333% - 4px)')
    expect(blocks[0].style.left).toBe('calc(0% + 2px)')
    // Die letzte Lane darf nicht über den rechten Rand hinauslaufen.
    expect(blocks[2].style.left).toBe('calc(66.667% + 2px)')
    expect(blocks[2].style.width).toBe('calc(33.333% - 4px)')
    // Stapelreihenfolge als CSS-Variable, damit :hover sie überschreiben kann.
    expect(blocks[0].style.getPropertyValue('--lane-z')).toBe('2')
    expect(blocks[2].style.getPropertyValue('--lane-z')).toBe('4')
  })

  it('Zoom ändert die Zeilenhöhe und merkt sie sich', async () => {
    const user = userEvent.setup()
    const { container } = renderCal()
    await openWeek()
    expect(hourCellHeight(container)).toBe(`${WEEK_ZOOM_LEVELS[WEEK_ZOOM_DEFAULT]}px`)

    await user.click(screen.getByRole('button', { name: 'Zeilenhöhe vergrössern' }))
    expect(hourCellHeight(container)).toBe(`${WEEK_ZOOM_LEVELS[WEEK_ZOOM_DEFAULT + 1]}px`)
    expect(localStorage.getItem('schedule-week-zoom')).toBe(String(WEEK_ZOOM_DEFAULT + 1))
  })

  it('übernimmt eine gemerkte Zoom-Stufe beim Start, korrupte Werte fallen zurück', async () => {
    localStorage.setItem('schedule-week-zoom', '0')
    const { container, unmount } = renderCal()
    await openWeek()
    expect(hourCellHeight(container)).toBe(`${WEEK_ZOOM_LEVELS[0]}px`)
    unmount()

    localStorage.setItem('schedule-week-zoom', 'kaputt')
    const second = renderCal()
    await openWeek()
    expect(hourCellHeight(second.container)).toBe(`${WEEK_ZOOM_LEVELS[WEEK_ZOOM_DEFAULT]}px`)
  })

  it('der Zoom-Regler erscheint nur im Zeitraster, nicht in Monat/Plantafel', async () => {
    const user = userEvent.setup()
    renderCal()
    expect(screen.queryByRole('button', { name: 'Zeilenhöhe vergrössern' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mitarbeiter' }))
    expect(screen.getByRole('button', { name: 'Zeilenhöhe vergrössern' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Plantafel' }))
    expect(screen.queryByRole('button', { name: 'Zeilenhöhe vergrössern' })).not.toBeInTheDocument()
  })
})

describe('Hover-Karte', () => {
  afterEach(() => vi.useRealTimers())

  it('zeigt nach kurzem Verweilen alle Angaben — auch die nicht auf der Kachel', async () => {
    const { container } = renderCal({
      entries: [entry({
        name: 'Projekt Alpha',
        start_time: '08:00',
        end_time: '08:30',
        object_address: 'Rehbergstrasse 12',
        bemerkung: 'Schlüssel beim Nachbarn',
        projektleiter_id: 's2',
      })],
    })
    await openWeek()

    vi.useFakeTimers()
    const block = container.querySelector('.project-cal-week-event')!
    fireEvent.mouseEnter(block)
    // Vor Ablauf der Verzögerung noch keine Karte.
    expect(document.querySelector('.project-cal-hovercard')).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(300) })

    const card = document.querySelector('.project-cal-hovercard') as HTMLElement
    expect(card).toHaveTextContent('Projekt Alpha')
    expect(card).toHaveTextContent('Rehbergstrasse 12')
    expect(card).toHaveTextContent('Schlüssel beim Nachbarn')
    expect(card).toHaveTextContent('Beat Beispiel')   // Projektleiter
    expect(card).toHaveTextContent('Anna Muster')     // Monteur

    fireEvent.mouseLeave(block)
    expect(document.querySelector('.project-cal-hovercard')).not.toBeInTheDocument()
  })

  it('verschwindet beim Anfassen, damit sie das Ziehen nicht stört', async () => {
    const { container } = renderCal()
    await openWeek()

    vi.useFakeTimers()
    const block = container.querySelector('.project-cal-week-event')!
    fireEvent.mouseEnter(block)
    act(() => { vi.advanceTimersByTime(300) })
    expect(document.querySelector('.project-cal-hovercard')).toBeInTheDocument()

    fireEvent.mouseDown(block)
    expect(document.querySelector('.project-cal-hovercard')).not.toBeInTheDocument()
  })
})

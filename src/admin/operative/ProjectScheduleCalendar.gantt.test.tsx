import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleCalendar, { CalendarEntry } from './ProjectScheduleCalendar'
import { resolveScheduleDistances, type SchedulingConfig } from '../../api/admin'
import { toDateStr } from '../utils/calendarHelpers'
import { GANTT_ZOOM_DEFAULT, GANTT_ZOOM_LEVELS } from '../utils/ganttGrid'

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return { ...actual, resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }) }
})

// Tagesplan (Gantt): Mitarbeiter als Zeilen, Uhrzeit waagrecht. Getestet werden
// Zeilen-Zuordnung, Balken-Geometrie, Auslastungsgrad, Tages-Navigation und das
// Verschieben per Drag&Drop (Uhrzeit + Monteur-Umzuweisung).

const STAFF = [
  { id: 's1', name: 'Anna Muster', kuerzel: 'AM' },
  { id: 's2', name: 'Beat Beispiel' },
]

// Fixer Werktag (Donnerstag), damit Kapazität und Achse stabil sind.
const DAY = new Date(2026, 7, 6)
const DAY_ISO = toDateStr(DAY)

function entry(over: Partial<CalendarEntry>): CalendarEntry {
  const base = {
    id: 'a1',
    name: 'Projekt Alpha',
    kind: 'project',
    start_date: DAY_ISO,
    end_date: DAY_ISO,
    start_time: '09:00',
    end_time: '11:00',
    monteur_ids: ['s1'],
  } as unknown as CalendarEntry
  return { ...base, ...over }
}

const CONFIG: SchedulingConfig = {
  fields: {},
  colors: {},
  // Nur der Tagesplan an → er wird ohne Klick gerendert.
  views: { month: false, week: false, staff: false, plantafel: false, gantt: true },
  day_capacity_hours: 8,
}

function renderGantt(opts: {
  entries?: CalendarEntry[]
  config?: SchedulingConfig
  onReschedule?: (id: string, d: number, t?: string | null, m?: string[]) => void
  onCreateSlot?: (dayISO: string, start: string, end: string, monteurId: string | null) => void
} = {}) {
  return render(
    <ProjectScheduleCalendar
      projects={opts.entries ?? [entry({})]}
      staff={STAFF}
      loading={false}
      onSelect={vi.fn()}
      onReschedule={opts.onReschedule ?? vi.fn()}
      onCreateSlot={opts.onCreateSlot}
      schedulingConfig={opts.config ?? CONFIG}
    />,
  )
}

function rows(container: HTMLElement) {
  return [...container.querySelectorAll('.project-cal-gantt-row:not(.project-cal-gantt-header)')]
}

// jsdom kennt keinen echten DataTransfer.
function fakeDataTransfer() {
  const store: Record<string, string> = {}
  return {
    setData: (k: string, v: string) => { store[k] = v },
    getData: (k: string) => store[k] ?? '',
    effectAllowed: '',
  }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(DAY)
  localStorage.clear()
  // Standard-Zeitraum ist 5 Tage — die Geometrie- und Auslastungs-Tests rechnen
  // aber mit einem einzelnen Tag. Der eigene Default-Test entfernt den Key wieder.
  localStorage.setItem('schedule-gantt-span', '1')
})

describe('Tagesplan (Gantt)', () => {
  it('zeigt eine Zeile je Mitarbeiter; Einsätze landen in der Zeile ihres Monteurs', () => {
    const { container } = renderGantt({
      entries: [
        entry({ id: 'a1', name: 'Projekt Alpha', monteur_ids: ['s1'] }),
        entry({ id: 'a2', name: 'Projekt Beta', monteur_ids: ['s1', 's2'] }),
      ],
    })
    const r = rows(container)
    expect(r).toHaveLength(2)
    expect(r[0]).toHaveTextContent('Anna Muster')
    expect(r[0]).toHaveTextContent('Projekt Alpha')
    expect(r[0]).toHaveTextContent('Projekt Beta')
    expect(r[1]).toHaveTextContent('Beat Beispiel')
    expect(r[1]).not.toHaveTextContent('Projekt Alpha')
  })

  it('sammelt Einsätze ohne Monteur in der Zeile «Ohne Monteur» — dort ohne Auslastung', () => {
    const { container } = renderGantt({
      entries: [entry({ id: 'a3', name: 'Projekt Gamma', monteur_ids: [] })],
    })
    const r = rows(container)
    expect(r).toHaveLength(3)
    expect(r[2]).toHaveTextContent('Ohne Monteur')
    expect(r[2].querySelector('.project-cal-gantt-util-badge')).toHaveTextContent('–')
  })

  it('setzt Balkenbreite aus der Dauer und Position aus der Startzeit', () => {
    const hourWidth = GANTT_ZOOM_LEVELS[GANTT_ZOOM_DEFAULT]
    const { container } = renderGantt({
      entries: [entry({ id: 'a1', start_time: '09:00', end_time: '11:00' })],
    })
    const bar = container.querySelector('.project-cal-gantt-bar') as HTMLElement
    // Raster beginnt bei 07:00 (Default-Untergrenze) → 09:00 liegt 2 h rechts.
    expect(bar.style.left).toBe(`${2 * hourWidth}px`)
    expect(bar.style.width).toBe(`${2 * hourWidth}px`)
  })

  it('rechnet den Auslastungsgrad gegen die Tages-Kapazität', () => {
    const { container } = renderGantt({
      // 4 h von 8 h Kapazität = 50 %.
      entries: [entry({ id: 'a1', start_time: '08:00', end_time: '12:00', monteur_ids: ['s1'] })],
    })
    const badge = rows(container)[0].querySelector('.project-cal-gantt-util-badge')!
    expect(badge).toHaveTextContent('50%')
    expect(badge.className).toContain('mid')
    // Ohne Einsatz bleibt die Zeile bei 0 %.
    expect(rows(container)[1].querySelector('.project-cal-gantt-util-badge')).toHaveTextContent('0%')
  })

  it('markiert überbuchte Mitarbeiter (über 100 %) rot', () => {
    const { container } = renderGantt({
      entries: [
        entry({ id: 'a1', start_time: '07:00', end_time: '15:00' }),
        entry({ id: 'a2', name: 'Projekt Beta', start_time: '15:00', end_time: '18:00' }),
      ],
    })
    const badge = rows(container)[0].querySelector('.project-cal-gantt-util-badge')!
    expect(badge).toHaveTextContent('138%')
    expect(badge.className).toContain('over')
  })

  it('markiert zeitlich überlappende Einsätze desselben Mitarbeiters als Konflikt', () => {
    const { container } = renderGantt({
      entries: [
        entry({ id: 'a1', start_time: '09:00', end_time: '11:00' }),
        entry({ id: 'a2', name: 'Projekt Beta', start_time: '10:30', end_time: '12:00' }),
        entry({ id: 'a3', name: 'Projekt Gamma', start_time: '13:00', end_time: '14:00' }),
      ],
    })
    expect(container.querySelectorAll('.project-cal-gantt-bar.conflict')).toHaveLength(2)
    expect(container.querySelectorAll('.project-cal-gantt-bar')).toHaveLength(3)
  })

  it('Drop in eine andere Zeile setzt Uhrzeit und weist den Monteur um', () => {
    const onReschedule = vi.fn()
    const { container } = renderGantt({ onReschedule })
    const dataTransfer = fakeDataTransfer()
    const bar = container.querySelector('.project-cal-gantt-bar')!
    fireEvent.dragStart(bar, { dataTransfer })

    const track = rows(container)[1].querySelector('.project-cal-gantt-track') as HTMLElement
    // jsdom liefert überall Nullmasse — clientX zählt damit direkt als Achsen-X.
    // fireEvent.drop reicht clientX nicht durch (jsdom kennt kein DragEvent),
    // darum das Event selbst bauen.
    const hourWidth = GANTT_ZOOM_LEVELS[GANTT_ZOOM_DEFAULT]
    const dropEvent = createEvent.drop(track, { dataTransfer })
    Object.defineProperty(dropEvent, 'clientX', { value: 3 * hourWidth })
    fireEvent(track, dropEvent)

    // 3 h nach Rasteranfang (07:00) = 10:00, gleicher Tag, Team auf s2 umgestellt.
    expect(onReschedule).toHaveBeenCalledWith('a1', 0, '10:00', ['s2'])
  })

  it('Klick auf freie Rasterfläche plant einen Einsatz mit Uhrzeit und Zeilen-Monteur', async () => {
    const user = userEvent.setup()
    const onCreateSlot = vi.fn()
    const { container } = renderGantt({ onCreateSlot, entries: [] })
    const track = rows(container)[1].querySelector('.project-cal-gantt-track') as HTMLElement
    const hourWidth = GANTT_ZOOM_LEVELS[GANTT_ZOOM_DEFAULT]
    await user.pointer({ target: track, coords: { clientX: 2 * hourWidth, clientY: 0 }, keys: '[MouseLeft]' })

    expect(onCreateSlot).toHaveBeenCalledWith(DAY_ISO, '09:00', '10:00', 's2')
  })

  it('navigiert tageweise und im gewählten Zeitraum', async () => {
    const user = userEvent.setup()
    const { container } = renderGantt({ entries: [] })
    // Ein Tag sichtbar → ein Tages-Kopf.
    expect(container.querySelectorAll('.project-cal-gantt-day-head')).toHaveLength(1)
    expect(screen.getByText(/06\.08\.2026/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '→' }))
    expect(screen.getByText(/07\.08\.2026/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '3 Tage' }))
    expect(container.querySelectorAll('.project-cal-gantt-day-head')).toHaveLength(3)
    // Der gewählte Zeitraum überlebt den Reload (localStorage).
    expect(localStorage.getItem('schedule-gantt-span')).toBe('3')
    // Weiter geht es jetzt in Drei-Tages-Schritten.
    await user.click(screen.getByRole('button', { name: '→' }))
    expect(screen.getByText(/10\.08\. – .*12\.08\.2026/)).toBeInTheDocument()
  })

  it('startet ohne gemerkten Zeitraum mit 5 Tagen', () => {
    localStorage.removeItem('schedule-gantt-span')
    const { container } = renderGantt({ entries: [] })
    expect(container.querySelectorAll('.project-cal-gantt-day-head')).toHaveLength(5)
  })

  it('merkt sich die Stundenbreite im localStorage', async () => {
    const user = userEvent.setup()
    renderGantt({ entries: [] })
    await user.click(screen.getByRole('button', { name: 'Stundenbreite vergrössern' }))
    expect(localStorage.getItem('schedule-gantt-zoom')).toBe(String(GANTT_ZOOM_DEFAULT + 1))
    // Der Wochen-Zoom bleibt davon unberührt.
    expect(localStorage.getItem('schedule-week-zoom')).toBeNull()
  })

  it('zeigt Team-Kürzel vorne und die Ortschaft als zweite Zeile', () => {
    const { container } = renderGantt({
      entries: [entry({
        monteur_ids: ['s1', 's2'],
        object_address: 'Hofstettweg 5, 8405 Winterthur',
      })],
    })
    const bar = container.querySelector('.project-cal-gantt-bar')!
    // Gepflegtes Kürzel, sonst Initialen — ein Chip je Monteur.
    const chips = [...bar.querySelectorAll('.schedule-crew-chip')]
    expect(chips.map(c => c.textContent)).toEqual(['AM', 'BB'])
    // Rot ist der zuerst gewählte Monteur (Lead), nicht das ganze Team.
    expect(chips[0]).toHaveClass('lead')
    expect(chips[1]).not.toHaveClass('lead')
    // Zweite Zeile trägt nur die Ortschaft, nicht die ganze Adresse.
    const sub = bar.querySelector('.project-cal-gantt-bar-sub')!
    expect(sub).toHaveTextContent('Winterthur')
    expect(sub).not.toHaveTextContent('Hofstettweg')
  })

  it('fields.address=false blendet die Ortschaft aus', () => {
    const { container } = renderGantt({
      config: { ...CONFIG, fields: { address: false } },
      entries: [entry({ object_address: 'Hofstettweg 5, 8405 Winterthur' })],
    })
    expect(container.querySelector('.project-cal-gantt-bar-sub')).not.toBeInTheDocument()
  })

  it('trägt keinen title — die Angaben stehen in der Hover-Karte', () => {
    // Ein title auf dem Balken erschiene zusätzlich zur Hover-Karte und legte
    // sich quer darüber; der leere title hält auch den title der Rasterfläche
    // darunter zurück.
    const { container } = renderGantt({})
    expect(container.querySelector('.project-cal-gantt-bar')!.getAttribute('title')).toBe('')
  })

  it('zeigt die Fahrstrecke zum nächsten Einsatz in der Lücke dazwischen', async () => {
    vi.mocked(resolveScheduleDistances).mockResolvedValue({
      distances: [{ a: 'Astrasse 1, 8400 Winterthur', b: 'Bstrasse 2, 8472 Seuzach', km: 4.2 }],
    })
    const hourWidth = GANTT_ZOOM_LEVELS[GANTT_ZOOM_DEFAULT]
    const { container } = renderGantt({
      entries: [
        entry({ id: 'a1', start_time: '09:00', end_time: '10:00', object_address: 'Astrasse 1, 8400 Winterthur' }),
        entry({ id: 'a2', name: 'Projekt Beta', start_time: '11:30', end_time: '12:30', object_address: 'Bstrasse 2, 8472 Seuzach' }),
      ],
    })
    expect(await screen.findByText(/4[.,]2 km/)).toBeInTheDocument()
    // Sitzt in der Lücke: ab Ende des ersten Balkens (10:00) bis 11:30.
    const dist = container.querySelector('.project-cal-gantt-dist') as HTMLElement
    expect(dist.style.left).toBe(`${3 * hourWidth}px`)
    expect(dist.style.width).toBe(`${1.5 * hourWidth}px`)
  })

  it('lässt die Fahrstrecke weg, wenn die Termine direkt aneinander anschliessen', async () => {
    vi.mocked(resolveScheduleDistances).mockResolvedValue({
      distances: [{ a: 'Astrasse 1, 8400 Winterthur', b: 'Bstrasse 2, 8472 Seuzach', km: 4.2 }],
    })
    const { container } = renderGantt({
      entries: [
        entry({ id: 'a1', start_time: '09:00', end_time: '10:00', object_address: 'Astrasse 1, 8400 Winterthur' }),
        entry({ id: 'a2', name: 'Projekt Beta', start_time: '10:00', end_time: '11:00', object_address: 'Bstrasse 2, 8472 Seuzach' }),
      ],
    })
    await screen.findByText('Projekt Beta')
    expect(container.querySelector('.project-cal-gantt-dist')).not.toBeInTheDocument()
  })

  it('show_distances=false: keine Distanz-Anfrage im Tagesplan', () => {
    vi.mocked(resolveScheduleDistances).mockClear()
    const { container } = renderGantt({
      config: { ...CONFIG, show_distances: false },
      entries: [
        entry({ id: 'a1', start_time: '09:00', end_time: '10:00', object_address: 'Astrasse 1, 8400 Winterthur' }),
        entry({ id: 'a2', name: 'Projekt Beta', start_time: '11:30', end_time: '12:30', object_address: 'Bstrasse 2, 8472 Seuzach' }),
      ],
    })
    expect(vi.mocked(resolveScheduleDistances)).not.toHaveBeenCalled()
    expect(container.querySelector('.project-cal-gantt-dist')).not.toBeInTheDocument()
  })

  it('ganztägige Einsätze liegen als Band über den ganzen Tag', () => {
    const { container } = renderGantt({
      entries: [entry({ id: 'a1', start_time: null, end_time: null })],
    })
    const bar = container.querySelector('.project-cal-gantt-bar.allday') as HTMLElement
    expect(bar).toBeInTheDocument()
    expect(bar.style.left).toBe('0px')
    // Ganztägig belegt den vollen Tag → 100 % Auslastung.
    expect(rows(container)[0].querySelector('.project-cal-gantt-util-badge')).toHaveTextContent('100%')
  })
})

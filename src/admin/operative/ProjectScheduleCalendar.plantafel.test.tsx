import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleCalendar, { CalendarEntry } from './ProjectScheduleCalendar'
import { resolveScheduleDistances, type SchedulingConfig } from '../../api/admin'
import { getWeekDays, toDateStr } from '../utils/calendarHelpers'

// Nur den Distanz-Call mocken — Konstanten (SCHEDULING_VIEWS) bleiben echt.
vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return { ...actual, resolveScheduleDistances: vi.fn().mockResolvedValue({ distances: [] }) }
})

// Plantafel: Monteure als Zeilen × Wochentage. Getestet werden Zeilen-Zuordnung,
// die tenant-schaltbaren Ansichten-Buttons (views) inkl. Fallback und die
// Monteur-Umzuweisung per Drag&Drop in eine andere Zeile.

const STAFF = [
  { id: 's1', name: 'Anna Muster' },
  { id: 's2', name: 'Beat Beispiel' },
]

// Aktuelle Woche, damit die Standard-Ansicht (heute) die Einträge zeigt.
const week = getWeekDays(new Date())
const MON = toDateStr(week[0])
const TUE = toDateStr(week[1])

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

const CONFIG_ALL: SchedulingConfig = {
  fields: {},
  colors: {},
  views: { month: true, week: true, staff: true, plantafel: true, gantt: true },
}

function renderCal(opts: {
  entries?: CalendarEntry[]
  config?: SchedulingConfig | undefined
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
      schedulingConfig={opts.config}
    />,
  )
}

// Zeilen der Tafel (ohne Header) als [Namenszelle, ...7 Tageszellen].
function boardRows(container: HTMLElement) {
  return [...container.querySelectorAll('.project-cal-board-row:not(.project-cal-board-header)')]
}

describe('Plantafel', () => {
  it('zeigt eine Zeile pro Monteur; Einsätze landen in der Zeile ihres Monteurs', async () => {
    const user = userEvent.setup()
    const { container } = renderCal({
      entries: [
        entry({ id: 'a1', name: 'Projekt Alpha', monteur_ids: ['s1'] }),
        entry({ id: 'a2', name: 'Projekt Beta', monteur_ids: ['s1', 's2'], start_date: TUE, end_date: TUE }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))

    const rows = boardRows(container)
    expect(rows).toHaveLength(2)  // kein «Ohne Monteur», alles zugewiesen
    expect(rows[0]).toHaveTextContent('Anna Muster')
    expect(rows[0]).toHaveTextContent('Projekt Alpha')
    expect(rows[0]).toHaveTextContent('Projekt Beta')  // Mehrfach-Team: in beiden Zeilen
    expect(rows[1]).toHaveTextContent('Beat Beispiel')
    expect(rows[1]).toHaveTextContent('Projekt Beta')
    expect(rows[1]).not.toHaveTextContent('Projekt Alpha')
  })

  it('markiert die Kachel des Lead-Monteurs (zuerst gewählt) rot', async () => {
    const user = userEvent.setup()
    const { container } = renderCal({
      // s2 steht vorne → Beat ist Lead, nicht Anna.
      entries: [entry({ id: 'a2', name: 'Projekt Beta', monteur_ids: ['s2', 's1'] })],
    })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))

    const rows = boardRows(container)
    expect(rows[0].querySelector('.project-cal-board-chip')).not.toHaveClass('lead')  // Anna
    const leadChip = rows[1].querySelector('.project-cal-board-chip')!                 // Beat
    expect(leadChip).toHaveClass('lead')
    expect(leadChip).toHaveAttribute('title', expect.stringContaining('Lead-Monteur'))
  })

  it('sammelt Einsätze ohne Monteur in der Zeile «Ohne Monteur»', async () => {
    const user = userEvent.setup()
    const { container } = renderCal({
      entries: [entry({ id: 'a3', name: 'Projekt Gamma', monteur_ids: [] })],
    })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))

    const rows = boardRows(container)
    expect(rows).toHaveLength(3)
    expect(rows[2]).toHaveTextContent('Ohne Monteur')
    expect(rows[2]).toHaveTextContent('Projekt Gamma')
  })

  it('Drop in eine andere Monteur-Zeile weist den Quell-Monteur um', async () => {
    const user = userEvent.setup()
    const onReschedule = vi.fn()
    const { container } = renderCal({
      entries: [entry({ id: 'a1', monteur_ids: ['s1'] })],
      onReschedule,
    })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))

    // Minimaler DataTransfer-Ersatz (jsdom kennt keinen echten).
    const store: Record<string, string> = {}
    const dataTransfer = {
      setData: (k: string, v: string) => { store[k] = v },
      getData: (k: string) => store[k] ?? '',
      effectAllowed: '',
    }
    const chip = container.querySelector('.project-cal-board-chip')!
    fireEvent.dragStart(chip, { dataTransfer })

    // Zelle Dienstag in der Zeile von Beat (Zeile 2, Tageszelle Index 1).
    const targetCell = boardRows(container)[1].querySelectorAll('.project-cal-board-cell')[1]
    fireEvent.drop(targetCell, { dataTransfer })

    expect(onReschedule).toHaveBeenCalledWith('a1', 1, undefined, ['s2'])
  })

  it('abgeschaltete Ansichten erscheinen nicht als Button; Fallback auf die erste erlaubte', () => {
    const { container } = renderCal({
      config: { ...CONFIG_ALL, views: { month: false, week: false, staff: false, gantt: false, plantafel: true } },
    })
    expect(screen.queryByRole('button', { name: 'Monat' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Woche' })).not.toBeInTheDocument()
    // Einzige erlaubte Ansicht → Plantafel wird direkt gerendert.
    expect(container.querySelector('.project-cal-board')).toBeInTheDocument()
  })

  it('markiert zeitlich überlappende Einsätze desselben Monteurs als Konflikt', async () => {
    const user = userEvent.setup()
    const { container } = renderCal({
      entries: [
        entry({ id: 'a1', start_time: '09:00', end_time: '11:00', monteur_ids: ['s1'] }),
        entry({ id: 'a2', name: 'Projekt Beta', start_time: '10:30', end_time: '12:00', monteur_ids: ['s1'] }),
        entry({ id: 'a3', name: 'Projekt Gamma', start_time: '13:00', end_time: '14:00', monteur_ids: ['s1'] }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))

    const conflicted = [...container.querySelectorAll('.project-cal-board-chip.conflict')]
    expect(conflicted).toHaveLength(2)
    expect(conflicted[0]).toHaveTextContent('Projekt Alpha')
    expect(conflicted[1]).toHaveTextContent('Projekt Beta')
    // Gamma überlappt nicht → kein Marker.
    expect(container.querySelectorAll('.project-cal-board-chip')).toHaveLength(3)
  })

  it('«Ohne Monteur»-Zeile markiert Überlappungen nicht (kein Ressourcen-Konflikt)', async () => {
    const user = userEvent.setup()
    const { container } = renderCal({
      entries: [
        entry({ id: 'a1', start_time: '09:00', end_time: '11:00', monteur_ids: [] }),
        entry({ id: 'a2', name: 'Projekt Beta', start_time: '10:00', end_time: '12:00', monteur_ids: [] }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))
    expect(container.querySelectorAll('.project-cal-board-chip.conflict')).toHaveLength(0)
  })

  it('Klick auf leere Zelle plant einen Einsatz mit Tag und Zeilen-Monteur', async () => {
    const user = userEvent.setup()
    const onCreateSlot = vi.fn()
    const { container } = renderCal({ onCreateSlot })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))

    // Zelle Dienstag in der Zeile von Beat (Zeile 2, Tageszelle Index 1) — leer.
    const cell = boardRows(container)[1].querySelectorAll('.project-cal-board-cell')[1]
    await user.click(cell as HTMLElement)
    expect(onCreateSlot).toHaveBeenCalledWith(TUE, '08:00', '09:00', 's2')
  })

  it('zeigt das Typ-Symbol des Termins auf dem Chip', async () => {
    const user = userEvent.setup()
    const { container } = renderCal({
      entries: [
        entry({ id: 'a1', termin_kind: 'aufmass', monteur_ids: ['s1'] }),
        entry({ id: 'a2', name: 'Projekt Beta', start_date: TUE, end_date: TUE, monteur_ids: ['s1'] }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))

    const chips = [...container.querySelectorAll('.project-cal-board-chip')]
    expect(chips[0]).toHaveTextContent('📐')  // Aufmass
    expect(chips[1]).toHaveTextContent('🔧')  // ohne termin_kind = Montage-Default
  })

  it('zeigt Fahrdistanzen zwischen aufeinanderfolgenden Einsätzen', async () => {
    vi.mocked(resolveScheduleDistances).mockResolvedValue({
      distances: [{ a: 'Astrasse 1, Winterthur', b: 'Bstrasse 2, Seuzach', km: 4.2 }],
    })
    const user = userEvent.setup()
    renderCal({
      entries: [
        entry({ id: 'a1', start_time: '09:00', end_time: '10:00', object_address: 'Astrasse 1, Winterthur' }),
        entry({ id: 'a2', name: 'Projekt Beta', start_time: '10:30', end_time: '11:00', object_address: 'Bstrasse 2, Seuzach' }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))

    expect(await screen.findByText(/4[.,]2 km/)).toBeInTheDocument()
    // Angefragt wird das normalisierte Paar (a <= b).
    expect(vi.mocked(resolveScheduleDistances)).toHaveBeenCalledTimes(1)
  })

  it('show_distances=false: keine Distanz-Anfrage, keine Anzeige', async () => {
    vi.mocked(resolveScheduleDistances).mockClear()
    const user = userEvent.setup()
    const { container } = renderCal({
      config: { ...CONFIG_ALL, show_distances: false },
      entries: [
        entry({ id: 'a1', start_time: '09:00', end_time: '10:00', object_address: 'Astrasse 1' }),
        entry({ id: 'a2', name: 'Projekt Beta', start_time: '10:30', end_time: '11:00', object_address: 'Bstrasse 2' }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))

    expect(vi.mocked(resolveScheduleDistances)).not.toHaveBeenCalled()
    expect(container.querySelector('.project-cal-board-dist')).not.toBeInTheDocument()
  })

  it('ohne views-Config sind alle Ansichten verfügbar (Default an)', () => {
    renderCal({ config: undefined })
    for (const label of ['Monat', 'Woche', 'Mitarbeiter', 'Plantafel', 'Tagesplan']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })
})

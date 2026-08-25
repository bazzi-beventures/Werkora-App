import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Wochenplan } from './Wochenplan'
import { apiFetch } from '../../api/client'
import { shiftISO } from '../../admin/utils/calendarHelpers'

// Der Wochenplan zeigt EINEN Tag und wischt durch die Woche. Festgehalten wird
// hier die Navigation — sie ist die ganze Ansicht: der falsche Tag ist schlimmer
// als gar keiner, weil er genauso aussieht wie der richtige. Dazu das Tippen auf
// einen Einsatz, das dasselbe Projekt öffnen muss wie das Tippen auf eine Kachel.

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  apiUrl: (p: string) => p,
  isOfflineError: () => false,
  ApiError: class ApiError extends Error {
    status: number
    constructor(status = 500, msg = '') { super(msg); this.status = status }
  },
}))

const mockFetch = vi.mocked(apiFetch)

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function entry(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    appointment_id: 'a1',
    name: 'Storenersatz Müller',
    kind: 'project',
    is_internal: false,
    art_der_arbeit: 'Storen',
    time_label: '07:30–12:00',
    termin_kind: 'montage',
    termin_label: null,
    customer_name: 'Müller AG',
    object_address: 'Musterstrasse 12, 8000 Zürich',
    billing_address: '',
    phone: '',
    local_contact_name: '',
    monteur_names: ['Max Muster'],
    bemerkung: '',
    is_multi_day: false,
    ...over,
  }
}

/** Baut eine Woche ab `monday`; `entriesByIndex` setzt Einsätze auf einzelne Tage.
 *
 *  Die Tagesdaten kommen über `shiftISO` aus denselben Helfern, die auch die
 *  Ansicht benutzt — und das ist kein Stilthema. Vorher stand hier
 *  `new Date(\`${monday}T00:00:00\`)` (LOKALE Mitternacht) gefolgt von
 *  `toISOString()` (liest UTC). Östlich von Greenwich fällt lokale Mitternacht
 *  auf den Vortag in UTC, die Fixture-Woche war also um einen Tag verschoben —
 *  alle zwölf Tests fielen in Europe/Zurich um und waren nur unter UTC grün.
 *  Der Fehler lag im Fixture, nicht in der Ansicht: `toDateStr`/`parseDateStr`
 *  in calendarHelpers.ts rechnen durchgehend in lokaler Zeit. */
function week(monday: string, entriesByIndex: Record<number, unknown[]> = {}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = shiftISO(monday, i)
    const [y, m, dd] = iso.split('-')
    return {
      iso,
      weekday: WEEKDAYS[i],
      date: `${dd}.${m}.${y}`,
      short: `${dd}.${m}.`,
      entries: entriesByIndex[i] ?? [],
    }
  })
  return {
    week_start: monday,
    week_end: days[6].iso,
    week_number: monday === '2026-08-24' ? 35 : 36,
    week_label: `${days[0].short} – ${days[6].date}`,
    has_any: Object.keys(entriesByIndex).length > 0,
    days,
  }
}

const PROJEKTE = [{ id: 'p1' }, { id: 'p9' }]

function renderPlan(over: Partial<{ projects: { id: string }[]; onSelect: () => void }> = {}) {
  const onSelect = over.onSelect ?? vi.fn()
  const result = render(
    <Wochenplan
      projects={over.projects ?? PROJEKTE}
      onSelect={onSelect}
      onLoggedOut={() => {}}
    />,
  )
  return { ...result, onSelect }
}

function swipe(el: Element, dx: number) {
  fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 200 }] })
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200 + dx, clientY: 205 }] })
}

beforeEach(() => {
  // Mittwoch, 26.08.2026 — die Woche beginnt am Montag, dem 24.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 26, 9, 0, 0))
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (path: string) => {
    if (path.includes('week_start=2026-08-24')) {
      return week('2026-08-24', { 2: [entry()], 3: [entry({ appointment_id: 'a2', name: 'Service Meier' })] })
    }
    if (path.includes('week_start=2026-08-31')) {
      return week('2026-08-31', { 0: [entry({ appointment_id: 'a3', name: 'Montage Keller' })] })
    }
    return week('2026-08-17')
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Wochenplan', () => {
  it('startet beim heutigen Tag und holt dessen Woche', async () => {
    renderPlan()

    expect(await screen.findByText('Storenersatz Müller')).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith('/pwa/schedule/week?week_start=2026-08-24')
    expect(screen.getByText('Mittwoch')).toBeInTheDocument()
    expect(screen.getByText('26.08.2026')).toBeInTheDocument()
    expect(screen.getByText('Heute')).toBeInTheDocument()
    expect(screen.getByText('KW 35 · 24.08. – 30.08.2026')).toBeInTheDocument()
  })

  it('blättert beim Wischen nach links einen Tag vorwärts, nach rechts zurück', async () => {
    const { container } = renderPlan()
    await screen.findByText('Storenersatz Müller')
    const pane = container.querySelector('.wplan-scroll')!

    swipe(pane, -120)
    expect(await screen.findByText('Service Meier')).toBeInTheDocument()
    expect(screen.getByText('Donnerstag')).toBeInTheDocument()

    swipe(pane, 120)
    expect(await screen.findByText('Storenersatz Müller')).toBeInTheDocument()
    expect(screen.getByText('Mittwoch')).toBeInTheDocument()
  })

  it('lässt ein Scrollen durch die Liste nicht als Wischen gelten', async () => {
    const { container } = renderPlan()
    await screen.findByText('Storenersatz Müller')
    const pane = container.querySelector('.wplan-scroll')!

    // Waagrecht weit genug, senkrecht noch weiter — der Daumen scrollt.
    fireEvent.touchStart(pane, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(pane, { changedTouches: [{ clientX: 120, clientY: 320 }] })

    expect(screen.getByText('Mittwoch')).toBeInTheDocument()
  })

  it('wischt über den Sonntag hinaus in die Folgewoche und lädt sie nach', async () => {
    const { container } = renderPlan()
    await screen.findByText('Storenersatz Müller')
    const pane = container.querySelector('.wplan-scroll')!

    // Mi → So sind vier Wische, der fünfte landet am Montag der Folgewoche.
    for (let i = 0; i < 5; i++) swipe(pane, -120)

    expect(await screen.findByText('Montage Keller')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/pwa/schedule/week?week_start=2026-08-31')
    })
    expect(screen.getByText('Montag')).toBeInTheDocument()
    expect(screen.getByText('31.08.2026')).toBeInTheDocument()
  })

  it('zeigt einen leeren Tag als solchen an, statt ihn zu überspringen', async () => {
    renderPlan()
    await screen.findByText('Storenersatz Müller')

    fireEvent.click(screen.getByLabelText('Montag, 24.08.2026'))

    expect(await screen.findByText('Kein Einsatz geplant.')).toBeInTheDocument()
  })

  it('führt zurück zum heutigen Tag', async () => {
    renderPlan()
    await screen.findByText('Storenersatz Müller')

    fireEvent.click(screen.getByLabelText('Freitag, 28.08.2026'))
    expect(await screen.findByText('Freitag')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Heute' }))
    expect(await screen.findByText('Mittwoch')).toBeInTheDocument()
  })

  it('verlinkt die Baustellenadresse in die Navigation', async () => {
    renderPlan()
    await screen.findByText('Storenersatz Müller')

    const link = screen.getByText(/Musterstrasse 12/)
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Musterstrasse%2012%2C%208000%20Z%C3%BCrich',
    )
  })

  it('lädt eine schon besuchte Woche nicht erneut', async () => {
    const { container } = renderPlan()
    await screen.findByText('Storenersatz Müller')
    const pane = container.querySelector('.wplan-scroll')!

    for (let i = 0; i < 5; i++) swipe(pane, -120)
    await screen.findByText('Montage Keller')
    for (let i = 0; i < 5; i++) swipe(pane, 120)
    await screen.findByText('Storenersatz Müller')

    const wochen = mockFetch.mock.calls.map(c => c[0])
    expect(wochen).toEqual([
      '/pwa/schedule/week?week_start=2026-08-24',
      '/pwa/schedule/week?week_start=2026-08-31',
    ])
  })

  // ── Tippen auf einen Einsatz ────────────────────────────────────────────

  it('meldet beim Tippen das Projekt der Kachelansicht — nicht den Termin', async () => {
    const { onSelect } = renderPlan()
    const karte = await screen.findByRole('button', { name: /Storenersatz Müller/ })

    fireEvent.click(karte)

    expect(onSelect).toHaveBeenCalledWith({ id: 'p1' })
  })

  it('lässt Adresse und Telefon aus der Karte heraus, ohne das Projekt zu öffnen', async () => {
    mockFetch.mockImplementation(async () => week('2026-08-24', {
      2: [entry({ phone: '044 000 00 00' })],
    }))
    const { onSelect } = renderPlan()
    await screen.findByText('Storenersatz Müller')

    fireEvent.click(screen.getByText(/Musterstrasse 12/))
    fireEvent.click(screen.getByText(/044 000 00 00/))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('macht einen internen Einsatz nicht antippbar — er ist kein Projekt', async () => {
    mockFetch.mockImplementation(async () => week('2026-08-24', {
      // Name und Typ-Beschriftung bewusst verschieden — sonst prüft der Test
      // nicht die Karte, sondern stolpert über zwei gleiche Texte.
      2: [entry({ name: 'Sitzung Büro', kind: 'teamsitzung', is_internal: true })],
    }))
    renderPlan()

    await screen.findByText('Sitzung Büro')
    expect(screen.getByText('Teamsitzung')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sitzung Büro/ })).not.toBeInTheDocument()
  })

  it('macht einen Einsatz ohne Zeile in der Projektliste nicht antippbar', async () => {
    // Die Projektliste blendet je nach Mandanten-Einstellung erledigte oder
    // künftige Projekte aus — ein Tipp darauf ginge ins Leere.
    const { onSelect } = renderPlan({ projects: [{ id: 'p9' }] })

    await screen.findByText('Storenersatz Müller')
    expect(screen.queryByRole('button', { name: /Storenersatz Müller/ })).not.toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })
})

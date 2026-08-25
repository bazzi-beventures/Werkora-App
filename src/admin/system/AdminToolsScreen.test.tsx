import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminToolsScreen from './AdminToolsScreen'

// Die zehn Werkzeuge sind hier nur Platzhalter: geprüft wird die Navigation,
// nicht was die einzelnen Screens laden (die ziehen sonst je eigene API-Aufrufe
// in den Test).
vi.mock('../configuration/ConfigurationScreen', () => ({ default: () => <div>konfiguration-inhalt</div> }))
vi.mock('./ServiceStatusScreen', () => ({ default: () => <div>service-inhalt</div> }))
vi.mock('./PushTestScreen', () => ({ default: () => <div>push-inhalt</div> }))
vi.mock('../llm/LlmCostsScreen', () => ({ default: () => <div>llm-inhalt</div> }))
vi.mock('../usage/UsageScreen', () => ({ default: () => <div>nutzung-inhalt</div> }))
vi.mock('./MaterialCleanupScreen', () => ({ default: () => <div>material-inhalt</div> }))
vi.mock('./UnitsPanel', () => ({ default: () => <div>einheiten-inhalt</div> }))
vi.mock('./ErrorLogsScreen', () => ({ default: () => <div>errorlogs-inhalt</div> }))
vi.mock('./SupportTicketsScreen', () => ({ default: () => <div>support-inhalt</div> }))
vi.mock('./WerkoraBonusScreen', () => ({ default: () => <div>bonus-inhalt</div> }))

const TOOL_COUNT = 10

function setViewport(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile && query.includes('max-width: 767px'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  setViewport(false)
})

describe('AdminToolsScreen — Navigation am Desktop', () => {
  it('zeigt alle Werkzeuge gleichzeitig, ohne Bildlaufleiste', () => {
    render(<AdminToolsScreen userRole="superadmin" enabledModules={[]} />)

    const nav = screen.getByRole('navigation', { name: 'Werkzeuge' })
    // Der Punkt der Umstellung: alle Einträge sind da, keiner steckt hinter
    // einem Scroll-Rand oder einem Klappmenü.
    expect(nav.querySelectorAll('button')).toHaveLength(TOOL_COUNT)
    expect(screen.getByRole('button', { name: 'Materialdatenbereinigung' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Werkora Bonus' })).toBeInTheDocument()
  })

  it('startet auf der Konfiguration und markiert sie als aktuelle Seite', () => {
    render(<AdminToolsScreen userRole="superadmin" enabledModules={[]} />)

    expect(screen.getByText('konfiguration-inhalt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Konfiguration' }))
      .toHaveAttribute('aria-current', 'page')
  })

  it('wechselt das Werkzeug und zieht die Markierung mit', async () => {
    const user = userEvent.setup()
    render(<AdminToolsScreen userRole="superadmin" enabledModules={[]} />)

    await user.click(screen.getByRole('button', { name: 'Support' }))

    expect(screen.getByText('support-inhalt')).toBeInTheDocument()
    expect(screen.queryByText('konfiguration-inhalt')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Support' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Konfiguration' })).not.toHaveAttribute('aria-current')
  })
})

describe('AdminToolsScreen — Navigation auf dem Handy', () => {
  beforeEach(() => {
    setViewport(true)
  })

  it('ersetzt die Liste durch ein Auswahlfeld', async () => {
    const user = userEvent.setup()
    render(<AdminToolsScreen userRole="superadmin" enabledModules={[]} />)

    // Auf Handybreite fehlt die Spalte — dort steht dieselbe Auswahl als Feld.
    expect(screen.queryByRole('navigation', { name: 'Werkzeuge' })).not.toBeInTheDocument()
    const select = screen.getByLabelText('Werkzeug')
    expect(select.querySelectorAll('option')).toHaveLength(TOOL_COUNT)

    await user.selectOptions(select, 'error-logs')
    expect(screen.getByText('errorlogs-inhalt')).toBeInTheDocument()
  })
})

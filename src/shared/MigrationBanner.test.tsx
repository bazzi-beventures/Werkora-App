import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MigrationBanner } from './MigrationBanner'

// Die eine Eigenschaft, die hier wirklich zaehlt: im NORMALEN Build darf der
// Streifen unter keinen Umstaenden erscheinen. Er gehoert auf die alte Origin.
// Rutschte er in den Build fuer app.werkora.ch, stuende dort «Werkora ist
// umgezogen» — auf der Seite, auf die umgezogen wurde.

const STICHTAG = '2026-09-11'
const tag = (m: number, t: number, std = 9) => new Date(2026, m - 1, t, std)
const ZU = 'Hinweis für heute ausblenden'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('MigrationBanner — Sichtbarkeit', () => {
  it('rendert nichts, wenn das Flag leer ist (normaler Build)', () => {
    vi.stubEnv('VITE_MIGRATION_NOTICE', '')
    vi.stubEnv('VITE_MIGRATION_DEADLINE', STICHTAG)
    const { container } = render(<MigrationBanner now={tag(9, 1)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('zeigt den Streifen, wenn ein Ziel gesetzt ist', () => {
    vi.stubEnv('VITE_MIGRATION_NOTICE', 'https://app.werkora.ch')
    vi.stubEnv('VITE_MIGRATION_DEADLINE', STICHTAG)
    render(<MigrationBanner now={tag(8, 28)} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://app.werkora.ch')
    expect(link).toHaveTextContent(/umgezogen/i)
  })
})

describe('MigrationBanner — Eskalation', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MIGRATION_NOTICE', 'https://app.werkora.ch')
    vi.stubEnv('VITE_MIGRATION_DEADLINE', STICHTAG)
  })

  it('lässt sich auf der mildesten Stufe wegklicken — und bleibt den Tag über weg', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<MigrationBanner now={tag(8, 28)} />)
    await user.click(screen.getByRole('button', { name: ZU }))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    // Auch nach einem App-Neustart am selben Tag: wer ihn gesehen hat, soll
    // nicht bei jedem Wechsel zurueck in die App neu wegklicken muessen.
    unmount()
    render(<MigrationBanner now={tag(8, 28, 17)} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('steht am nächsten Morgen wieder da', async () => {
    // Der Kern der Aenderung: ohne den Tag im gespeicherten Wert galt ein Klick
    // am 28.08. bis zur Eskalation am 04.09. — eine Woche Stille bei dem Kanal,
    // der im Parallelbetrieb der einzige ist.
    const user = userEvent.setup()
    const { unmount } = render(<MigrationBanner now={tag(8, 28)} />)
    await user.click(screen.getByRole('button', { name: ZU }))
    expect(localStorage.getItem('migrationHinweisWeggeklickt')).toBe('hinweis|2026-08-28')

    unmount()
    render(<MigrationBanner now={tag(8, 29, 7)} />)
    expect(screen.getByRole('link')).toHaveTextContent(/umgezogen/i)
  })

  it('bewertet über Nacht neu, auch wenn die App gar nicht geschlossen wird', () => {
    // Eine installierte PWA auf dem Werkstatt-Tablet und ein offener Buerotab
    // laufen tagelang ohne Neuladen — und das sind dieselben Leute, die im
    // Parallelbetrieb nie einen Login-Screen sehen. Ohne Neubewertung beim
    // Zurueckholen in den Vordergrund klebte der Streifen am Seitenaufbau.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(tag(8, 28))
      render(<MigrationBanner />)   // ohne now-Prop: nimmt die Systemzeit
      fireEvent.click(screen.getByRole('button', { name: ZU }))
      expect(screen.queryByRole('link')).not.toBeInTheDocument()

      vi.setSystemTime(tag(8, 29, 7))
      fireEvent(document, new Event('visibilitychange'))
      expect(screen.getByRole('link')).toHaveTextContent(/umgezogen/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('kommt nach der Eskalation zurück, obwohl er am selben Tag weggeklickt war', () => {
    localStorage.setItem('migrationHinweisWeggeklickt', 'hinweis|2026-09-04')
    render(<MigrationBanner now={tag(9, 4)} />)   // X+7 → 'dringend'
    expect(screen.getByRole('link')).toHaveTextContent(/7 Tagen/)
  })

  it('ist ab der zweiten Stufe nicht mehr wegklickbar', () => {
    render(<MigrationBanner now={tag(9, 4)} />)
    expect(screen.queryByRole('button', { name: ZU })).not.toBeInTheDocument()
  })

  it('zeigt auf der letzten Stufe die Vorschaltseite', () => {
    render(<MigrationBanner now={tag(9, 9)} />)   // X+12 → 'vorschalt'
    expect(screen.getByRole('heading', { name: /umgezogen/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zur neuen Adresse' })).toBeInTheDocument()
  })

  it('lässt die Vorschaltseite überspringen — aber nur für diese Sitzung', async () => {
    const user = userEvent.setup()
    render(<MigrationBanner now={tag(9, 9)} />)
    await user.click(screen.getByRole('button', { name: /Später/ }))
    expect(screen.queryByRole('heading', { name: /umgezogen/i })).not.toBeInTheDocument()

    // sessionStorage, nicht localStorage: beim naechsten App-Start steht sie
    // wieder da. «Ueberspringbar» heisst nicht «einmal weg und nie wieder».
    expect(sessionStorage.getItem('migrationVorschaltUebersprungen')).toBe('1')
    expect(localStorage.getItem('migrationVorschaltUebersprungen')).toBeNull()
  })
})

describe('MigrationBanner — die zwei Dinge, die der Nutzer braucht', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MIGRATION_NOTICE', 'https://app.werkora.ch')
    vi.stubEnv('VITE_MIGRATION_DEADLINE', STICHTAG)
  })

  it('zeigt die Adresse im Klartext, nicht nur als Klickziel', () => {
    // Wer am Handy liest und am Buerorechner wechseln will, muss sie abtippen
    // koennen. Beim Umzug ist dieser Geraetewechsel der Normalfall.
    render(<MigrationBanner now={tag(8, 28)} />)
    expect(screen.getByRole('link')).toHaveTextContent('app.werkora.ch')
  })

  it('sagt schon auf der ersten Stufe, dass man sich neu anmelden muss', () => {
    render(<MigrationBanner now={tag(8, 28)} />)
    expect(screen.getByRole('link')).toHaveTextContent(/neu anmelden/)
  })

  it('nennt auf der Vorschaltseite alle drei Schritte', () => {
    // Anmelden, Symbol, Benachrichtigungen — dieselben drei, die auch in die
    // Kundeninfo gehoeren. Wer nur eines davon macht, meldet sich spaeter.
    render(<MigrationBanner now={tag(9, 9)} />)
    expect(screen.getByText(/einmal neu anmelden/)).toBeInTheDocument()
    expect(screen.getByText(/neu auf den Startbildschirm/)).toBeInTheDocument()
    expect(screen.getByText(/erneut erlauben/)).toBeInTheDocument()
  })
})

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MigrationBanner } from './MigrationBanner'

// Die eine Eigenschaft, die hier wirklich zaehlt: im NORMALEN Build darf der
// Streifen unter keinen Umstaenden erscheinen. Er gehoert auf die alte Origin.
// Rutschte er in den Build fuer app.werkora.ch, stuende dort «Werkora ist
// umgezogen» — auf der Seite, auf die umgezogen wurde.

const STICHTAG = '2026-09-11'
const tag = (m: number, t: number) => new Date(2026, m - 1, t, 9)

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

  it('lässt sich auf der mildesten Stufe wegklicken', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MigrationBanner now={tag(8, 28)} />)
    await user.click(screen.getByRole('button', { name: 'Hinweis ausblenden' }))
    rerender(<MigrationBanner now={tag(8, 29)} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('kommt nach der Eskalation zurück, obwohl er weggeklickt war', () => {
    // Der Kern: ein Klick am ersten Tag darf nicht zwei Wochen Stille bedeuten.
    localStorage.setItem('migrationHinweisWeggeklickt', 'hinweis')
    render(<MigrationBanner now={tag(9, 4)} />)   // X+7 → 'dringend'
    expect(screen.getByRole('link')).toHaveTextContent(/7 Tagen/)
  })

  it('ist ab der zweiten Stufe nicht mehr wegklickbar', () => {
    render(<MigrationBanner now={tag(9, 4)} />)
    expect(screen.queryByRole('button', { name: 'Hinweis ausblenden' })).not.toBeInTheDocument()
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

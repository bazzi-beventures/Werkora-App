import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BetaSection from './BetaSection'
import { SUPPORT_PREFILL_EVENT, SupportPrefill, betaPrefillText } from './supportPrefill'

// Spec docs/specs/beta-tester.md §6.2/§6.3

const FEATURES = [
  { key: 'probe_beta', label: 'Sonderpositionen', description: 'Positionen ohne Katalog.' },
]

let empfangen: SupportPrefill[]
function merkeEvents() {
  empfangen = []
  const handler = (e: Event) => empfangen.push((e as CustomEvent<SupportPrefill>).detail)
  window.addEventListener(SUPPORT_PREFILL_EVENT, handler)
  return () => window.removeEventListener(SUPPORT_PREFILL_EVENT, handler)
}

beforeEach(() => { vi.restoreAllMocks() })

describe('BetaSection', () => {
  it('rendert nichts, solange nichts in der Beta ist', () => {
    const { container } = render(<BetaSection features={[]} canReport />)
    expect(container).toBeEmptyDOMElement()
  })

  it('nennt Feature und Beschreibung, damit der Tester weiss, was er testet', () => {
    render(<BetaSection features={FEATURES} canReport />)
    expect(screen.getByText('Du testest neue Funktionen')).toBeTruthy()
    expect(screen.getByText('Sonderpositionen')).toBeTruthy()
    expect(screen.getByText('Positionen ohne Katalog.')).toBeTruthy()
  })

  it('öffnet die Rückmeldung mit Präfix und Feature-Key', () => {
    const ab = merkeEvents()
    render(<BetaSection features={FEATURES} canReport />)
    fireEvent.click(screen.getByRole('button', { name: 'Rückmeldung geben' }))
    ab()
    expect(empfangen).toEqual([
      { message: betaPrefillText('Sonderpositionen'), betaFeature: 'probe_beta' },
    ])
  })

  it('verweist ohne Support-Modul auf den Weg ausserhalb der App', () => {
    render(<BetaSection features={FEATURES} canReport={false} />)
    expect(screen.queryByRole('button', { name: 'Rückmeldung geben' })).toBeNull()
    expect(screen.getByText(/Ansprechperson/)).toBeTruthy()
  })
})

describe('betaPrefillText', () => {
  it('bleibt die Form, an der sich Beta-Meldungen filtern lassen', () => {
    // Die Zeichenkette steht in jeder Meldung und lässt sich nachträglich nicht
    // mehr korrigieren — deshalb steht sie an genau einer Stelle und hier.
    expect(betaPrefillText('Sonderpositionen')).toBe('[Beta: Sonderpositionen] ')
  })
})

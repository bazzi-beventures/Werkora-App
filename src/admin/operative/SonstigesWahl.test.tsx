// «Sonstiges» genauer wählen (docs/specs/termin-farbkategorien.md §8): die
// Terminfarben des Betriebs als Auswahl, ohne den Standard-Eintrag; jeder andere
// Termin-Typ ist ein geplanter Einsatz ohne eigene Farbe.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TerminFarbe } from '../../api/admin/tenant'
import { SonstigesWahl, typWechsel } from './SonstigesWahl'

const FARBEN: TerminFarbe[] = [
  { key: 'buero', label: 'Büro', color: '#fdba74' },
  { key: 'geplant', label: 'Geplante Einsätze', color: '#facc15', standard: true },
  { key: 'schulung', label: 'Schulung', color: '#2563eb' },
]

const optionen = () => screen.getAllByRole('option').map(o => o.textContent)

describe('SonstigesWahl', () => {
  it('bietet die Kategorien ohne den Standard und «Andere»', () => {
    render(<SonstigesWahl kategorien={FARBEN} value="" onChange={() => {}} />)
    expect(optionen()).toEqual(['Büro', 'Schulung', 'Andere (eigene Bezeichnung)'])
  })
  it('die Wahl setzt Farbe und Bezeichnung, «Andere» leert beides', async () => {
    const onChange = vi.fn()
    render(<SonstigesWahl kategorien={FARBEN} value="buero" onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText('Was genau?'), 'schulung')
    expect(onChange).toHaveBeenLastCalledWith('schulung', 'Schulung')
    await userEvent.selectOptions(screen.getByLabelText('Was genau?'), '')
    expect(onChange).toHaveBeenLastCalledWith('', '')
  })
  it('ohne Kategorien (Feature aus) erscheint nichts', () => {
    const { container } = render(<SonstigesWahl kategorien={[]} value="" onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('ein gelöschter Schlüssel bleibt als «(entfernt)» stehen', () => {
    render(<SonstigesWahl kategorien={FARBEN} value="weg" onChange={() => {}} />)
    expect(optionen()).toContain('(entfernt)')
  })
})

describe('typWechsel', () => {
  it('wer «Sonstiges» verlässt, verliert die Farbe; Sonstiges behält sie', () => {
    expect(typWechsel('montage', 'buero')).toBe('')
    expect(typWechsel('montage', undefined)).toBeUndefined()
    expect(typWechsel('sonstiges', 'buero')).toBe('buero')
  })
  it('die Markierung (§9, Reservation) bleibt bei jedem Typwechsel', () => {
    const mitMarkierung = [...FARBEN, { key: 'reservation', label: 'Reservation', color: '#ea580c', markierung: true }]
    expect(typWechsel('montage', 'reservation', mitMarkierung)).toBe('reservation')
    expect(typWechsel('aufmass', 'buero', mitMarkierung)).toBe('')
    expect(typWechsel('sonstiges', 'reservation', mitMarkierung)).toBe('reservation')
  })
})

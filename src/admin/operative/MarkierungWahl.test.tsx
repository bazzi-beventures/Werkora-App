// Markierung an jedem Termin-Typ (docs/specs/termin-farbkategorien.md §9, WW-101):
// ein Häkchen «Reservation …» setzt die Farbe, ohne den Termin-Typ zu ändern.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TerminFarbe } from '../../api/admin/tenant'
import { MarkierungWahl } from './MarkierungWahl'

const RESERVATION = 'Reservation (Kunde hat noch nicht bestätigt)'
const FARBEN: TerminFarbe[] = [
  { key: 'buero', label: 'Büro', color: '#fdba74' },
  { key: 'geplant', label: 'Geplante Einsätze', color: '#facc15', standard: true },
  { key: 'reservation', label: RESERVATION, color: '#ea580c', markierung: true },
]

describe('MarkierungWahl', () => {
  it('Häkchen setzt die Markierung, Entfernen gibt die Standardfarbe zurück', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<MarkierungWahl kategorien={FARBEN} value={undefined} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText(RESERVATION))
    expect(onChange).toHaveBeenLastCalledWith('reservation')
    rerender(<MarkierungWahl kategorien={FARBEN} value="reservation" onChange={onChange} />)
    expect(screen.getByLabelText(RESERVATION)).toBeChecked()
    expect(screen.queryByLabelText('Terminfarbe')).toBeNull()
    await userEvent.click(screen.getByLabelText(RESERVATION))
    expect(onChange).toHaveBeenLastCalledWith('')
  })
  it('ohne markierten Eintrag kein Häkchen', () => {
    const { container } = render(
      <MarkierungWahl kategorien={FARBEN.filter(k => !k.markierung)} value="" onChange={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
  it('eine ältere andere Farbe bleibt als Feld «Terminfarbe» sichtbar', () => {
    render(<MarkierungWahl kategorien={FARBEN} value="buero" onChange={() => {}} />)
    expect(screen.getByLabelText(RESERVATION)).not.toBeChecked()
    expect(screen.getByLabelText('Terminfarbe')).toHaveValue('buero')
  })
})

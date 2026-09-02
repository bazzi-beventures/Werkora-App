import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuoteValiditySection } from './QuoteValiditySection'

// Reine Maske — kein Netzwerk. Getestet wird die Logik, die hier wirklich steckt:
// wann gespeichert werden darf. Ein durchgelassener Unsinnswert wäre teuer, weil
// dieselbe Zahl die Laufzeit des signierten Antwort-Links bestimmt.
const BASE = {
  months: '2',
  saved: '2',
  isDefault: true,
  systemDefault: 2,
  min: 1,
  max: 24,
  saving: false,
  error: '',
  onChange: () => {},
  onSave: () => {},
}

const speichern = () => screen.getByRole('button', { name: /Dauer speichern/ })
const zuruecksetzen = () => screen.getByRole('button', { name: /Auf Standard zurücksetzen/ })

describe('QuoteValiditySection', () => {
  it('speichert nicht, solange sich nichts geändert hat', () => {
    render(<QuoteValiditySection {...BASE} />)
    expect(speichern()).toBeDisabled()
  })

  it('gibt den Knopf frei, sobald ein anderer gültiger Wert im Feld steht', () => {
    render(<QuoteValiditySection {...BASE} months="3" />)
    expect(speichern()).toBeEnabled()
  })

  it.each([['0'], ['25'], [''], ['abc']])('sperrt den unzulässigen Wert %s', v => {
    render(<QuoteValiditySection {...BASE} months={v} />)
    expect(speichern()).toBeDisabled()
  })

  it('bietet das Zurücksetzen nur an, wenn der Mandant etwas Eigenes gesetzt hat', () => {
    const { rerender } = render(<QuoteValiditySection {...BASE} />)
    expect(zuruecksetzen()).toBeDisabled()
    rerender(<QuoteValiditySection {...BASE} isDefault={false} months="6" saved="6" />)
    expect(zuruecksetzen()).toBeEnabled()
  })

  it('meldet Änderung und Speichern nach oben', () => {
    const onChange = vi.fn()
    const onSave = vi.fn()
    render(<QuoteValiditySection {...BASE} months="4" isDefault={false} onChange={onChange} onSave={onSave} />)
    fireEvent.change(screen.getByLabelText('Gültig (Monate)'), { target: { value: '5' } })
    expect(onChange).toHaveBeenCalledWith('5')
    fireEvent.click(speichern())
    expect(onSave).toHaveBeenCalledWith(false)
    fireEvent.click(zuruecksetzen())
    expect(onSave).toHaveBeenCalledWith(true)
  })

  it('nennt den System-Standard, solange keine eigene Dauer gesetzt ist', () => {
    render(<QuoteValiditySection {...BASE} />)
    expect(screen.getByText(/Aktuell der Standard: 2 Monate/)).toBeInTheDocument()
  })
})

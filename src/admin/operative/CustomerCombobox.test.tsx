import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CustomerCombobox } from './CustomerCombobox'
import type { Customer } from '../../api/admin/customers'

// WW-71: neuen Kunden direkt aus dem Kundenfeld anlegen, statt das Projekt
// erst ohne Kunden zu speichern und den Kunden im Kundenstamm nachzutragen.

const MUELLER = { id: 'c-1', name: 'Hans Müller', address: 'Bahnhofstrasse 1, 8001 Zürich' } as unknown as Customer

function setup(onCreateNew?: (q: string) => void) {
  const onChange = vi.fn()
  render(<CustomerCombobox customers={[MUELLER]} value="" onChange={onChange} onCreateNew={onCreateNew} />)
  return { input: screen.getByPlaceholderText('Kunde wählen oder suchen…'), onChange }
}

describe('CustomerCombobox — neuer Kunde (WW-71)', () => {
  afterEach(cleanup)

  it('bietet ohne onCreateNew nichts an (Offerte, freie Rechnung)', () => {
    const { input } = setup()
    fireEvent.focus(input)
    expect(screen.queryByText(/Neuen Kunden anlegen|als neuen Kunden anlegen/)).toBeNull()
  })

  it('reicht den getippten Suchtext an die Kundenmaske weiter', () => {
    const onCreateNew = vi.fn()
    const { input, onChange } = setup(onCreateNew)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Muster' } })
    expect(screen.getByText('Kein Treffer')).toBeTruthy()
    fireEvent.mouseDown(screen.getByText('+ «Muster» als neuen Kunden anlegen'))
    expect(onCreateNew).toHaveBeenCalledWith('Muster')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ohne Suchtext öffnet der Eintrag die leere Maske', () => {
    const onCreateNew = vi.fn()
    const { input } = setup(onCreateNew)
    fireEvent.focus(input)
    fireEvent.mouseDown(screen.getByText('+ Neuen Kunden anlegen'))
    expect(onCreateNew).toHaveBeenCalledWith('')
  })

  it('Enter ohne Treffer legt neu an, Enter mit Treffer wählt ihn', () => {
    const onCreateNew = vi.fn()
    const { input, onChange } = setup(onCreateNew)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Muster' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreateNew).toHaveBeenCalledWith('Muster')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Müller' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('c-1')
    expect(onCreateNew).toHaveBeenCalledTimes(1)
  })
})

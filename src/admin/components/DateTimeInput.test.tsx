import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { DateTimeInput } from './DateTimeInput'

// Ein Elternteil, der den Wert wie die Masken im State hält — jeder Tastendruck
// löst also ein Re-Render mit neuem `value` aus.
function Harness({ initial, onChange }: { initial: string; onChange?: (v: string) => void }) {
  const [v, setV] = useState(initial)
  return (
    <>
      <DateTimeInput
        type="date"
        aria-label="Start"
        value={v}
        onValueChange={next => { setV(next); onChange?.(next) }}
      />
      <button type="button" onClick={() => setV('2026-12-24')}>von aussen</button>
    </>
  )
}

describe('DateTimeInput', () => {
  it('zeigt den Wert von aussen und meldet Änderungen', () => {
    const onChange = vi.fn()
    render(<Harness initial="2026-09-29" onChange={onChange} />)
    const input = screen.getByLabelText('Start') as HTMLInputElement
    expect(input.value).toBe('2026-09-29')

    fireEvent.change(input, { target: { value: '2026-10-15' } })
    expect(onChange).toHaveBeenLastCalledWith('2026-10-15')
    expect(input.value).toBe('2026-10-15')
  })

  it('schreibt beim Tippen das value-Attribut nicht neu (Fehlerbild: nur noch per Maus änderbar)', () => {
    // Ein kontrolliertes <input type="date"> bekäme von React nach jedem
    // Tastendruck das value-ATTRIBUT gesetzt; Firefox/Safari setzen dabei ihre
    // Segment-Eingabe zurück. Hier darf das Attribut beim Tippen nie mitlaufen.
    render(<Harness initial="2026-09-29" />)
    const input = screen.getByLabelText('Start') as HTMLInputElement
    input.focus()
    const before = input.getAttribute('value')

    fireEvent.change(input, { target: { value: '2026-09-01' } })
    fireEvent.change(input, { target: { value: '2026-09-15' } })

    expect(input.getAttribute('value')).toBe(before)
    expect(input.value).toBe('2026-09-15')
  })

  it('überschreibt ein fokussiertes Feld nicht von aussen, zieht aber beim Verlassen nach', () => {
    render(<Harness initial="2026-09-29" />)
    const input = screen.getByLabelText('Start') as HTMLInputElement
    act(() => input.focus())

    // fireEvent.click nimmt in jsdom den Fokus nicht weg — wie ein Neuladen im
    // Hintergrund, während jemand tippt.
    fireEvent.click(screen.getByText('von aussen'))
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('2026-09-29')

    fireEvent.blur(input)
    expect(input.value).toBe('2026-12-24')
  })

  it('übernimmt einen Wert von aussen sofort, wenn das Feld nicht fokussiert ist', () => {
    render(<Harness initial="" />)
    const input = screen.getByLabelText('Start') as HTMLInputElement
    expect(input.value).toBe('')

    fireEvent.click(screen.getByText('von aussen'))
    expect(input.value).toBe('2026-12-24')
  })
})

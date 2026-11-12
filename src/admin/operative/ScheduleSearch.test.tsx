import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ScheduleSearch from './ScheduleSearch'

// Das Suchfeld schliesst seine Trefferliste 150 ms nach dem Verlassen. Der Timer
// darf den Abbau der Komponente nicht überleben: in der CI lief er einmal nach
// dem Abbau von jsdom ab («window is not defined») und färbte einen Lauf rot, in
// dem alle 3202 Tests grün waren.

afterEach(() => {
  vi.useRealTimers()
})

function renderSearch() {
  return render(<ScheduleSearch entries={[]} todayIso="2026-11-11" onPick={vi.fn()} />)
}

describe('ScheduleSearch — verzögertes Schliessen', () => {
  it('räumt den Timer beim Abbau weg', () => {
    vi.useFakeTimers()
    const { unmount } = renderSearch()
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.blur(input)
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ein erneuter Fokus hebt das anstehende Schliessen auf', () => {
    vi.useFakeTimers()
    renderSearch()
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'macri' } })
    fireEvent.blur(input)
    fireEvent.focus(input)
    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(200)
    // Die Liste steht noch — ohne das Aufheben hätte der alte Timer sie geschlossen.
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { readListState, useListState } from './useListState'

// Spec: docs/specs/projektliste-filter-sortierung.md §6.
// Der Zustand ueberlebt einen Maskenwechsel und ein F5, aber nicht das Schliessen
// des Browsers. Die heiklen Faelle sind nicht "speichern und lesen", sondern die
// kaputten Eingaben: ein alter Eintrag aus einer frueheren Version, ein Wert, den
// es nicht mehr gibt, ein Storage, den der Browser verweigert.

interface State extends Record<string, unknown> {
  search: string
  status: string[]
  page: number
}

const DEFAULTS: State = { search: '', status: ['offen'], page: 1 }

beforeEach(() => sessionStorage.clear())

describe('readListState', () => {
  it('liefert die Vorgaben, wenn nichts gespeichert ist', () => {
    expect(readListState('x', DEFAULTS)).toEqual(DEFAULTS)
  })

  it('legt Gespeichertes ueber die Vorgaben', () => {
    sessionStorage.setItem('list-state:x', JSON.stringify({ page: 4 }))
    expect(readListState('x', DEFAULTS)).toEqual({ ...DEFAULTS, page: 4 })
  })

  it('kaputtes JSON faellt auf die Vorgaben zurueck, statt zu werfen', () => {
    sessionStorage.setItem('list-state:x', '{nicht wirklich json')
    expect(readListState('x', DEFAULTS)).toEqual(DEFAULTS)
  })

  it('unbekannte Schluessel kommen nicht durch', () => {
    // Ein Eintrag aus einer frueheren Version darf keine Felder mitbringen, die
    // der Screen nicht kennt.
    sessionStorage.setItem('list-state:x', JSON.stringify({ page: 2, obsoleterFilter: 'x' }))
    expect(readListState('x', DEFAULTS)).toEqual({ ...DEFAULTS, page: 2 })
  })

  it('ein Wert mit falschem Typ wird verworfen', () => {
    // Sonst faellt der Screen an einer Stelle um, die mit dem Storage nichts zu
    // tun hat (`status.map is not a function`).
    sessionStorage.setItem('list-state:x', JSON.stringify({ status: 'offen', page: 'zwei' }))
    expect(readListState('x', DEFAULTS)).toEqual(DEFAULTS)
  })

  it('revive darf fachlich aussortieren', () => {
    sessionStorage.setItem('list-state:x', JSON.stringify({ status: ['offen', 'zombie'] }))
    const gelesen = readListState('x', DEFAULTS, stored => ({
      ...stored,
      status: (stored.status ?? []).filter(s => s === 'offen'),
    }))
    expect(gelesen.status).toEqual(['offen'])
  })

  it('ein blockierter Storage ist kein Absturz', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readListState('x', DEFAULTS)).toEqual(DEFAULTS)
    spy.mockRestore()
  })
})

describe('useListState', () => {
  it('schreibt Aenderungen in den sessionStorage', () => {
    const { result } = renderHook(() => useListState('x', DEFAULTS))
    act(() => result.current.patch({ page: 3 }))
    expect(result.current.state.page).toBe(3)
    expect(JSON.parse(sessionStorage.getItem('list-state:x')!)).toMatchObject({ page: 3 })
  })

  it('liest den Stand beim naechsten Mount zurueck', () => {
    const erst = renderHook(() => useListState('x', DEFAULTS))
    act(() => erst.result.current.patch({ search: 'Meier', page: 2 }))
    erst.unmount()

    const wieder = renderHook(() => useListState('x', DEFAULTS))
    expect(wieder.result.current.state).toMatchObject({ search: 'Meier', page: 2 })
  })

  it('patch darf den vorherigen Stand lesen', () => {
    const { result } = renderHook(() => useListState('x', DEFAULTS))
    act(() => result.current.patch(prev => ({ page: prev.page + 1 })))
    expect(result.current.state.page).toBe(2)
  })

  it('reset stellt die Vorgaben wieder her', () => {
    const { result } = renderHook(() => useListState('x', DEFAULTS))
    act(() => result.current.patch({ search: 'Meier', status: [], page: 9 }))
    act(() => result.current.reset())
    expect(result.current.state).toEqual(DEFAULTS)
  })

  it('zwei Listen teilen sich den Speicher nicht', () => {
    const a = renderHook(() => useListState('projekte', DEFAULTS))
    const b = renderHook(() => useListState('kunden', DEFAULTS))
    act(() => a.result.current.patch({ search: 'Meier' }))
    expect(b.result.current.state.search).toBe('')
  })
})

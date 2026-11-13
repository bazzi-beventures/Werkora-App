import { describe, it, expect } from 'vitest'
import { nextSort } from './useListSort'

describe('nextSort — Klick auf einen Spaltenkopf', () => {
  it('eine andere Spalte beginnt aufsteigend', () => {
    expect(nextSort({ key: 'created_at', dir: 'desc' }, 'total_amount')).toEqual({ key: 'total_amount', dir: 'asc' })
  })

  it('dieselbe Spalte dreht die Richtung', () => {
    expect(nextSort({ key: 'total_amount', dir: 'asc' }, 'total_amount')).toEqual({ key: 'total_amount', dir: 'desc' })
    expect(nextSort({ key: 'created_at', dir: 'desc' }, 'created_at')).toEqual({ key: 'created_at', dir: 'asc' })
  })
})

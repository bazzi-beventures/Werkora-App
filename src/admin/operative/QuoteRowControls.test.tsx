import { describe, it, expect } from 'vitest'
import { moveItem } from './QuoteRowControls'

describe('moveItem', () => {
  it('verschiebt ein Element nach oben', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 0)).toEqual(['b', 'a', 'c'])
  })

  it('verschiebt ein Element nach unten', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
  })

  it('verschiebt über mehrere Positionen (Drag & Drop)', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('lässt das Array unverändert bei gleichem Index', () => {
    const arr = ['a', 'b', 'c']
    expect(moveItem(arr, 1, 1)).toBe(arr)
  })

  it('lässt das Array unverändert bei Index ausserhalb des Bereichs', () => {
    const arr = ['a', 'b', 'c']
    expect(moveItem(arr, 0, -1)).toBe(arr)
    expect(moveItem(arr, 0, 3)).toBe(arr)
    expect(moveItem(arr, -1, 0)).toBe(arr)
    expect(moveItem(arr, 5, 0)).toBe(arr)
  })

  it('mutiert das Original nicht', () => {
    const arr = ['a', 'b', 'c']
    moveItem(arr, 0, 2)
    expect(arr).toEqual(['a', 'b', 'c'])
  })
})

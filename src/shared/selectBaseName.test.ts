import { describe, it, expect } from 'vitest'
import { baseNameRange, selectBaseName } from './selectBaseName'

// Umbenennen: der Name ohne Endung ist markiert, Tippen ersetzt ihn und «.jpg»
// bleibt stehen (docs/specs/kleinkorrekturen-2026-10.md §2).

describe('baseNameRange', () => {
  it('markiert den Namen ohne Endung', () => {
    expect(baseNameRange('Baustelle Nord.jpg')).toEqual([0, 14])
  })

  it('nimmt nur die letzte Endung weg', () => {
    expect(baseNameRange('Plan.v2.final.pdf')).toEqual([0, 13])
  })

  it('markiert alles, wenn es keine Endung gibt', () => {
    expect(baseNameRange('Notizen')).toEqual([0, 7])
  })

  it('behandelt einen Punkt ganz vorne nicht als Endung', () => {
    expect(baseNameRange('.env')).toEqual([0, 4])
  })

  it('verträgt den leeren Namen', () => {
    expect(baseNameRange('')).toEqual([0, 0])
  })
})

describe('selectBaseName', () => {
  it('setzt die Markierung im Eingabefeld', () => {
    const input = document.createElement('input')
    input.value = 'IMG_1234.HEIC'
    document.body.appendChild(input)
    input.focus()
    selectBaseName(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 8])
    input.remove()
  })
})

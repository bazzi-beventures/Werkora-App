import { describe, it, expect } from 'vitest'
import { filterGallery } from './MaterialPhotoPicker'
import { GalleryMaterialOption } from '../api/chat'

const ITEMS: GalleryMaterialOption[] = [
  { art_nr: 'STG-1001', name: 'Roter Aluminium Rahmen', unit: 'Stk', category: 'Storen', calc_vk: 300 },
  { art_nr: 'FEN-001', name: 'Aluminium-Fensterprofil 70mm', unit: 'm', category: 'Fenster', calc_vk: 18.5 },
  { art_nr: '7', name: 'Sonnentuch Grün', unit: 'm2', category: 'Sonnentuch', calc_vk: 90 },
]

describe('filterGallery', () => {
  it('gibt bei leerer Suche alle Artikel zurück', () => {
    expect(filterGallery(ITEMS, '')).toHaveLength(3)
    expect(filterGallery(ITEMS, '   ')).toHaveLength(3)
  })

  it('matcht auf die Art.-Nr. (case-insensitive)', () => {
    const r = filterGallery(ITEMS, 'fen-001')
    expect(r.map(m => m.art_nr)).toEqual(['FEN-001'])
  })

  it('matcht auf die Bezeichnung', () => {
    const r = filterGallery(ITEMS, 'rahmen')
    expect(r.map(m => m.art_nr)).toEqual(['STG-1001'])
  })

  it('matcht auf die Kategorie', () => {
    const r = filterGallery(ITEMS, 'sonnentuch')
    expect(r.map(m => m.art_nr)).toEqual(['7'])
  })

  it('verlangt, dass JEDER Token vorkommt (UND-Verknüpfung über Felder)', () => {
    // "aluminium" trifft zwei, "rahmen" grenzt auf einen ein.
    const r = filterGallery(ITEMS, 'aluminium rahmen')
    expect(r.map(m => m.art_nr)).toEqual(['STG-1001'])
  })

  it('liefert bei fehlendem Treffer eine leere Liste', () => {
    expect(filterGallery(ITEMS, 'gibtsnicht')).toEqual([])
  })

  it('kommt mit null-Kategorie klar', () => {
    const items: GalleryMaterialOption[] = [
      { art_nr: 'X', name: 'Ding', unit: 'Stk', category: null, calc_vk: 1 },
    ]
    expect(filterGallery(items, 'ding')).toHaveLength(1)
    expect(filterGallery(items, 'storen')).toHaveLength(0)
  })
})

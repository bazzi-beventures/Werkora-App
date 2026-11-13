import { describe, it, expect } from 'vitest'
import { listPageParams, pageCount } from './listPage'

describe('listPageParams — Abfrage einer seitenweisen Admin-Liste', () => {
  it('schickt Seite, Grösse und Status', () => {
    const p = new URLSearchParams(listPageParams({
      page: 3, pageSize: 50, statuses: new Set(['entwurf', 'gesendet']),
    }))
    expect(p.get('page')).toBe('3')
    expect(p.get('page_size')).toBe('50')
    expect(p.get('status')).toBe('entwurf,gesendet')
    expect(p.has('search')).toBe(false)
    expect(p.has('projektleiter_id')).toBe(false)
  })

  it('schickt «status» auch leer — fehlend hiesse beim Server «alle»', () => {
    const p = new URLSearchParams(listPageParams({ page: 1, pageSize: 50, statuses: [] }))
    expect(p.has('status')).toBe(true)
    expect(p.get('status')).toBe('')
  })

  it('trimmt die Suche und lässt eine leere weg', () => {
    expect(new URLSearchParams(listPageParams({ page: 1, pageSize: 50, statuses: [], search: '  caduff ' })).get('search'))
      .toBe('caduff')
    expect(new URLSearchParams(listPageParams({ page: 1, pageSize: 50, statuses: [], search: '   ' })).has('search'))
      .toBe(false)
  })

  it('schickt den Projektleiter nur, wenn einer gewählt ist', () => {
    expect(new URLSearchParams(listPageParams({ page: 1, pageSize: 50, statuses: [], projektleiterId: 's-1' })).get('projektleiter_id'))
      .toBe('s-1')
    expect(new URLSearchParams(listPageParams({ page: 1, pageSize: 50, statuses: [], projektleiterId: null })).has('projektleiter_id'))
      .toBe(false)
  })

  it('schickt die Sortierung nur, wenn ein Spaltenkopf gewählt ist', () => {
    const p = new URLSearchParams(listPageParams({ page: 1, pageSize: 50, statuses: [], sort: 'total_amount', dir: 'desc' }))
    expect(p.get('sort')).toBe('total_amount')
    expect(p.get('dir')).toBe('desc')
    const ohne = new URLSearchParams(listPageParams({ page: 1, pageSize: 50, statuses: [] }))
    expect(ohne.has('sort')).toBe(false)
    expect(ohne.has('dir')).toBe(false)
  })
})

describe('pageCount', () => {
  it('rundet auf und zählt mindestens eine Seite', () => {
    expect(pageCount(1071, 50)).toBe(22)
    expect(pageCount(50, 50)).toBe(1)
    expect(pageCount(51, 50)).toBe(2)
    expect(pageCount(0, 50)).toBe(1)
  })
})

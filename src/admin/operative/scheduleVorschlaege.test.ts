// Hagelschaden-Disposition, Phase 2b: Vorschläge in der Einsatzplanung.
// Spec docs/specs/hagelschaden-disposition.md §10.3, §16.
import { describe, it, expect } from 'vitest'
import type { Project } from '../../api/admin/projects'
import { isVorschlag, pillClass, VORSCHLAG_PREFIX, vorschlagVerschoben } from './scheduleShared'

describe('Vorschläge in der Einsatzplanung', () => {
  it('erkennt Vorschläge an der Kennung — Termin-IDs nie', () => {
    expect(isVorschlag(`${VORSCHLAG_PREFIX}12`)).toBe(true)
    expect(isVorschlag('2b6c0e1a-1111-4c4c-9d9d-000000000000')).toBe(false)
    expect(isVorschlag(null)).toBe(false)
  })

  it('Vorschläge sind gestrichelt, Termine nicht', () => {
    expect(pillClass({ id: `${VORSCHLAG_PREFIX}1` } as Project)).toBe(' vorschlag')
    expect(pillClass({ id: 't1' } as Project)).toBe('')
  })

  it('verschiebt Tag und Zeit, die Dauer bleibt', () => {
    const v = { datum: '2026-10-14', end_datum: null, start_time: '07:10:00', end_time: '07:45:00' }
    expect(vorschlagVerschoben(v, 2, '09:00')).toEqual(
      { datum: '2026-10-16', end_datum: null, start_time: '09:00', end_time: '09:35' })
    expect(vorschlagVerschoben(v, -1)).toEqual(
      { datum: '2026-10-13', end_datum: null, start_time: '07:10', end_time: '07:45' })
  })

  it('ein mehrtägiger Block wandert als Ganzes', () => {
    const v = { datum: '2026-10-14', end_datum: '2026-10-15', start_time: null, end_time: null }
    expect(vorschlagVerschoben(v, 5)).toEqual(
      { datum: '2026-10-19', end_datum: '2026-10-20', start_time: null, end_time: null })
  })
})

import { describe, it, expect } from 'vitest'
import {
  describeRule, scopeHint, seriesChangeError, seriesEnd, seriesRows, seriesSavedMessage,
} from './seriesEdit'
import type { ProjectAppointment } from '../../api/admin'

// Spec docs/specs/einsatzplanung-rueckmeldungen-2026-10.md §3 — was die
// Oberfläche selbst entscheidet; gerechnet wird auf dem Server.

const appt = (id: string, start: string, series: string | null = 's1'): ProjectAppointment => ({
  id, project_id: 'p1', start_date: start, end_date: null, start_time: null, end_time: null,
  kind: 'montage', label: null, monteur_ids: null, series_id: series,
})

describe('seriesEdit', () => {
  it('beschreibt den Rhythmus kurz', () => {
    expect(describeRule({ freq: 'weekly', interval: 1, until: null })).toBe('wöchentlich')
    expect(describeRule({ freq: 'weekly', interval: 2, until: null })).toBe('alle 2 Wochen')
    expect(describeRule(null)).toBe('')
  })

  it('nimmt das Ende aus den Zeilen, nicht aus der Regel', () => {
    const rows = seriesRows([appt('b', '2026-11-16'), appt('a', '2026-11-02'), appt('x', '2026-12-01', 's2')], 's1')
    expect(rows.map(r => r.id)).toEqual(['a', 'b'])
    expect(seriesEnd(rows, { freq: 'weekly', interval: 1, until: '2026-11-23' })).toBe('2026-11-16')
    expect(seriesEnd([], { freq: 'weekly', interval: 1, until: '2026-11-23' })).toBe('2026-11-23')
    // Keine Liste (Fehlerseite) → keine Serie, kein Absturz.
    expect(seriesRows({ detail: 'x' }, 's1')).toEqual([])
  })

  it('lässt nur eine Art Serien-Änderung pro Speichern zu', () => {
    const base = { scope: 'series' as const, dateChanged: false, untilChanged: false, rhythmChanged: false }
    expect(seriesChangeError(base)).toBeNull()
    expect(seriesChangeError({ ...base, dateChanged: true, untilChanged: true })).toMatch(/eins nach dem anderen/)
    // Bei «nur dieser» ist ein neues Datum keine Serien-Änderung.
    expect(seriesChangeError({ ...base, scope: 'single', dateChanged: true })).toBeNull()
    expect(seriesChangeError({ ...base, rhythmChanged: true })).toMatch(/folgenden/)
  })

  it('sagt, was ein neues Datum bewirkt', () => {
    expect(scopeHint('following')).toMatch(/verschiebt dieser und alle folgenden Termine/)
    expect(scopeHint('single')).toMatch(/Nur dieser Termin/)
  })

  it('meldet angehängte und entfernte Termine', () => {
    expect(seriesSavedMessage({ series_created: 3 })).toBe('Serie gespeichert: 3 Termine angehängt.')
    expect(seriesSavedMessage({ series_deleted: 2 })).toBe('Serie gespeichert: 2 entfernt.')
    expect(seriesSavedMessage({ series_updated: 5 })).toBe('Serie gespeichert: 5 Termine angepasst.')
    expect(seriesSavedMessage({ series_updated: 1 })).toBe('Gespeichert.')
  })
})

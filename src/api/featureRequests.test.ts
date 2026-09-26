/**
 * Reine Funktionen der Feature-Anfragen (docs/specs/feature-anfragen.md §4.3).
 *
 * `formatTarget` muss exakt dasselbe liefern wie
 * `services/feature_requests.py::format_target` — die Beispiele unten sind
 * dieselben wie in tests/unit/test_feature_requests.py::TestTarget::test_format.
 */
import { describe, expect, it } from 'vitest'
import { fmtDay, formatTarget, isoWeek, todayIso } from './featureRequests'

describe('formatTarget', () => {
  it.each([
    ['2026-10-12', '2026-10-18', 'woche', 'KW 42 2026'],
    ['2026-10-12', '2026-11-01', 'woche', 'KW 42–44 2026'],
    ['2026-12-21', '2027-01-10', 'woche', 'KW 52 2026 – KW 1 2027'],
    ['2026-10-01', '2026-10-31', 'monat', 'Oktober 2026'],
    ['2026-10-01', '2026-11-30', 'monat', 'Okt.–Nov. 2026'],
    ['2026-12-01', '2027-01-31', 'monat', 'Dez. 2026 – Jan. 2027'],
    ['2026-10-01', '2026-12-31', 'quartal', 'Q4 2026'],
    ['2026-07-01', '2026-12-31', 'quartal', 'Q3–Q4 2026'],
    ['2026-10-01', '2027-03-31', 'quartal', 'Q4 2026 – Q1 2027'],
  ])('%s – %s (%s) → %s', (von, bis, genauigkeit, erwartet) => {
    expect(formatTarget(von, bis, genauigkeit)).toBe(erwartet)
  })

  it('ohne Ziel', () => {
    expect(formatTarget(null, null, null)).toBe('noch ohne Termin')
    expect(formatTarget('2026-10-01', null, null)).toBe('noch ohne Termin')
    expect(formatTarget('Quatsch', null, 'monat')).toBe('noch ohne Termin')
  })

  it('ohne Ende gilt der Beginn', () => {
    expect(formatTarget('2026-10-14', null, 'monat')).toBe('Oktober 2026')
  })
})

describe('isoWeek', () => {
  it('KW 1 kann im Dezember beginnen', () => {
    expect(isoWeek(new Date(2026, 11, 28))).toEqual({ year: 2026, week: 53 })
    expect(isoWeek(new Date(2027, 0, 4))).toEqual({ year: 2027, week: 1 })
    expect(isoWeek(new Date(2025, 11, 29))).toEqual({ year: 2026, week: 1 })
  })
})

describe('Datum ohne Uhrzeit (F13)', () => {
  it('fmtDay zeigt nur den Tag', () => {
    expect(fmtDay('2026-09-25')).toBe('25.09.26')
    expect(fmtDay(null)).toBe('—')
  })

  it('todayIso ist ein lokales Datum', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('Nutzerseite: Bereich aus dem Screen, «seit»', () => {
  it('areaForRoute belegt bekannte Screens vor, unbekannte nie', async () => {
    const { areaForRoute } = await import('./featureRequests')
    expect(areaForRoute('offerten')).toBe('offerten')
    expect(areaForRoute('project-schedule')).toBe('einsatzplanung')
    expect(areaForRoute('home')).toBe('')
    expect(areaForRoute(undefined)).toBe('')
  })

  it('sinceLabel', async () => {
    const { sinceLabel } = await import('./featureRequests')
    const now = new Date(2026, 8, 25, 10, 0)
    expect(sinceLabel('2026-09-25', now)).toBe('seit heute')
    expect(sinceLabel('2026-09-24', now)).toBe('seit gestern')
    expect(sinceLabel('2026-09-13', now)).toBe('seit 12 Tagen')
    expect(sinceLabel('2026-08-20', now)).toBe('seit KW 34')
    expect(sinceLabel(null, now)).toBe('')
  })
})

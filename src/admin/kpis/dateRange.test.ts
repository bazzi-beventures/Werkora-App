import { describe, it, expect } from 'vitest'
import { dateFilter, fmtDE, isoLocal, periodLabel, presetRange, tickDM } from './dateRange'

// Lag bis 2026-08-22 in LlmCostsScreen und war ungetestet. Der heikle Teil ist
// die Zeitzone: die Views gruppieren nach Europe/Zurich, ein UTC-Datum wäre am
// Monatsrand um einen Tag daneben — und niemand merkt es, weil die Zahlen
// trotzdem plausibel aussehen.

describe('isoLocal', () => {
  it('nimmt die lokalen Feldwerte, nicht die UTC-Sicht', () => {
    // 1. Januar 00:30 Ortszeit ist in UTC noch der 31. Dezember.
    expect(isoLocal(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
    // 31. Dezember 23:30 Ortszeit ist in UTC schon der 1. Januar.
    expect(isoLocal(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31')
  })

  it('füllt ein- auf zweistellige Monate und Tage auf', () => {
    expect(isoLocal(new Date(2026, 2, 5))).toBe('2026-03-05')
  })
})

describe('presetRange', () => {
  const heute = new Date(2026, 7, 22) // 22.08.2026

  it('zählt "7 Tage" inklusive heute', () => {
    expect(presetRange('7t', heute)).toEqual({ von: '2026-08-16', bis: '2026-08-22' })
  })

  it('30 und 90 Tage ebenso', () => {
    expect(presetRange('30t', heute).von).toBe('2026-07-24')
    expect(presetRange('90t', heute).von).toBe('2026-05-25')
  })

  it('"Dieser Monat" beginnt am Ersten und endet heute', () => {
    expect(presetRange('monat', heute)).toEqual({ von: '2026-08-01', bis: '2026-08-22' })
  })

  it('"Vormonat" endet am letzten Tag des Vormonats', () => {
    expect(presetRange('vormonat', heute)).toEqual({ von: '2026-07-01', bis: '2026-07-31' })
  })

  it('trifft auch den Februar und den Jahreswechsel', () => {
    expect(presetRange('vormonat', new Date(2026, 2, 10)))
      .toEqual({ von: '2026-02-01', bis: '2026-02-28' })
    expect(presetRange('vormonat', new Date(2026, 0, 10)))
      .toEqual({ von: '2025-12-01', bis: '2025-12-31' })
    // Schaltjahr
    expect(presetRange('vormonat', new Date(2028, 2, 10)).bis).toBe('2028-02-29')
  })
})

describe('Anzeige', () => {
  it('formatiert de-CH', () => {
    expect(fmtDE('2026-08-22')).toBe('22.08.2026')
    expect(tickDM('2026-08-22')).toBe('22.08')
  })

  it('kürzt die Beschriftung auf einen Tag zusammen', () => {
    expect(periodLabel('2026-08-22', '2026-08-22')).toBe('22.08.2026')
    expect(periodLabel('2026-08-01', '2026-08-22')).toBe('01.08.2026 – 22.08.2026')
  })
})

describe('dateFilter', () => {
  it('baut den PostgREST-Bereichsfilter auf die datum-Spalte', () => {
    expect(dateFilter('2026-08-01', '2026-08-22'))
      .toEqual({ and: '(datum.gte.2026-08-01,datum.lte.2026-08-22)' })
  })
})

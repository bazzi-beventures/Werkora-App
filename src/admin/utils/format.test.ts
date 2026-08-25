import { describe, it, expect } from 'vitest'
import { fmtCHF, fmtDate, todayISO } from './format'

describe('fmtCHF', () => {
  it('zeigt immer genau zwei Dezimalstellen', () => {
    expect(fmtCHF(0)).toBe('CHF 0.00')
    expect(fmtCHF(5)).toBe('CHF 5.00')
    // 1234.5 → "...34.50": Struktur prüfen, Tausender-Trenner tolerant lassen,
    // da das Zeichen von der ICU-Datenlage abhängt (de-CH: ’ bzw. NBSP).
    expect(fmtCHF(1234.5)).toMatch(/^CHF 1.234\.50$/)
  })

  it('rundet auf zwei Dezimalstellen', () => {
    expect(fmtCHF(1.005)).toMatch(/^CHF 1\.0[01]$/) // Banker-/IEEE-Rundung tolerieren
    expect(fmtCHF(2.999)).toBe('CHF 3.00')
  })

  it('formatiert negative Beträge', () => {
    // Minuszeichen tolerant: je nach ICU-Version ASCII-Bindestrich (-) oder
    // typografisches Minus (−). Struktur + Dezimalstellen sind das Entscheidende.
    expect(fmtCHF(-42)).toMatch(/^CHF .42\.00$/)
  })

  it('beginnt stets mit dem CHF-Präfix', () => {
    expect(fmtCHF(99.9)).toMatch(/^CHF /)
  })
})

describe('fmtDate', () => {
  it('liefert einen Gedankenstrich für leere Werte', () => {
    expect(fmtDate(null)).toBe('—')
    expect(fmtDate(undefined)).toBe('—')
    expect(fmtDate('')).toBe('—')
  })

  it('formatiert ein ISO-Datum als dd.mm.yyyy (de-CH)', () => {
    // 2026-06-15 → "15.06.2026". Date-Parsing von "YYYY-MM-DD" ist UTC-Mitternacht;
    // de-CH nutzt zweistellige Tage/Monate.
    expect(fmtDate('2026-06-15')).toBe('15.06.2026')
  })

  it('formatiert auch volle ISO-Timestamps', () => {
    expect(fmtDate('2026-01-09T10:30:00Z')).toBe('09.01.2026')
  })
})

describe('todayISO', () => {
  it('liefert JJJJ-MM-TT mit führenden Nullen', () => {
    expect(todayISO(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05')
    expect(todayISO(new Date(2026, 11, 31, 12, 0))).toBe('2026-12-31')
  })

  it('nimmt das LOKALE Datum, nicht das UTC-Datum', () => {
    // 00:30 Ortszeit ist in der Schweiz noch der Vortag in UTC — toISOString() würde
    // hier den 8. liefern und ein Aufgabedatum stillschweigend einen Tag zurücksetzen.
    expect(todayISO(new Date(2026, 7, 9, 0, 30))).toBe('2026-08-09')
  })

  it('ohne Argument das heutige Datum', () => {
    const now = new Date()
    expect(todayISO()).toBe(todayISO(now))
  })
})

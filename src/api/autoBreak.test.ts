// Client-Regeln zum automatischen Pausenabzug (api/autoBreak.ts).
//
// Warum getestet: die Frist entscheidet, ob der Monteur den Knopf zum
// Widersprechen überhaupt sieht. Eine falsche Tagesrechnung (Sommerzeit!) würde
// ihm den Weg einen Tag zu früh verschliessen — und das ist der Weg, der den
// automatischen Abzug erst zulässig macht.

import { describe, it, expect } from 'vitest'
import {
  autoBreakConfig,
  autoBreakRuleText,
  daysSince,
  hasAutoBreak,
  noBreakPrefill,
  objectionExpired,
  AutoBreakConfig,
} from './autoBreak'
import { UserInfo } from './auth'

const CFG: AutoBreakConfig = {
  enabled: true,
  soll: 'gesetzlich',
  minuten: 30,
  ab_stunden: 6,
  lage_ab: '12:00',
  modus: 'auffuellen',
  widerspruch_tage: 14,
}

function userWith(flags: Record<string, unknown>): UserInfo {
  return { feature_flags: flags } as unknown as UserInfo
}

describe('autoBreakConfig', () => {
  it('liefert null ohne Nutzer, ohne Flag und bei enabled=false', () => {
    expect(autoBreakConfig(null)).toBeNull()
    expect(autoBreakConfig(userWith({}))).toBeNull()
    expect(autoBreakConfig(userWith({ automatische_pause: { ...CFG, enabled: false } }))).toBeNull()
  })

  it('liefert die Regel des Betriebs, wenn sie aktiv ist', () => {
    expect(autoBreakConfig(userWith({ automatische_pause: CFG }))?.soll).toBe('gesetzlich')
  })
})

describe('daysSince', () => {
  it('zählt ganze Tage', () => {
    expect(daysSince('2026-06-01', new Date(2026, 5, 15))).toBe(14)
    expect(daysSince('2026-06-15', new Date(2026, 5, 15))).toBe(0)
  })

  it('rechnet über die Sommerzeit-Umstellung korrekt', () => {
    // 29.03.2026 ist der Umstellungstag (CET → CEST). Über lokale
    // Mitternacht gerechnet fehlte hier eine Stunde und der Abstand kippte.
    expect(daysSince('2026-03-28', new Date(2026, 2, 30))).toBe(2)
    expect(daysSince('2026-10-24', new Date(2026, 9, 26))).toBe(2)
  })

  it('meldet unlesbare Daten als null statt NaN', () => {
    expect(daysSince('')).toBeNull()
    expect(daysSince('gestern')).toBeNull()
  })
})

describe('objectionExpired', () => {
  const today = new Date(2026, 5, 15)   // 15.06.2026

  it('lässt den Widerspruch innerhalb der Frist zu — auch am letzten Tag', () => {
    expect(objectionExpired('2026-06-01', CFG, today)).toBe(false)   // exakt 14 Tage
    expect(objectionExpired('2026-06-14', CFG, today)).toBe(false)
  })

  it('sperrt erst nach Ablauf', () => {
    expect(objectionExpired('2026-05-31', CFG, today)).toBe(true)    // 15 Tage
  })

  it('kennt keine Frist bei widerspruch_tage = 0 und ohne Regel', () => {
    expect(objectionExpired('2020-01-01', { ...CFG, widerspruch_tage: 0 }, today)).toBe(false)
    expect(objectionExpired('2020-01-01', null, today)).toBe(false)
  })

  it('sperrt nie bei unlesbarem Datum — im Zweifel entscheidet der Server', () => {
    expect(objectionExpired('kaputt', CFG, today)).toBe(false)
  })
})

describe('hasAutoBreak / noBreakPrefill', () => {
  const day = {
    date: '2026-06-10', clock_in: '07:00', clock_out: '16:02',
    break_minutes: 30, auto_break_minutes: 30,
  }

  it('erkennt nur Tage mit tatsächlichem Regel-Anteil', () => {
    expect(hasAutoBreak(day)).toBe(true)
    expect(hasAutoBreak({ ...day, auto_break_minutes: 0 })).toBe(false)
    expect(hasAutoBreak(null)).toBe(false)
  })

  it('füllt Datum, Zeiten und Pause=0 vor — das Abtippen entfällt', () => {
    expect(noBreakPrefill(day)).toEqual({
      date: '2026-06-10',
      clock_in: '07:00',
      clock_out: '16:02',
      break_minutes: 0,
      reason: 'Keine Pause gemacht',
    })
  })
})

describe('autoBreakRuleText', () => {
  it('nennt die gesetzlichen Stufen und die Frist', () => {
    const text = autoBreakRuleText(CFG)
    expect(text).toContain('gesetzliche Mindestpause')
    expect(text).toContain('14 Tage')
  })

  it('nennt bei fester Regel die Zahlen des Betriebs', () => {
    const text = autoBreakRuleText({ ...CFG, soll: 'fix', minuten: 45, ab_stunden: 7 })
    expect(text).toContain('45 Min ab 7 Std.')
  })

  it('ist leer, wenn keine Regel aktiv ist', () => {
    expect(autoBreakRuleText(null)).toBe('')
  })
})

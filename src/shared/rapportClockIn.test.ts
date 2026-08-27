import { describe, expect, it } from 'vitest'
import { rapportClockInApplies, rapportClockInBlocked } from './rapportClockIn'
import type { UserInfo } from '../api/auth'
import type { ZeitStatus } from '../api/chat'

/**
 * Stempel-Pflicht für den Rapport (Feature `rapport_nur_eingestempelt`).
 *
 * Spiegel der Server-Regel in services/report_policy.py::report_clock_in_blocked
 * (dort getestet in tests/unit/test_rapport_stempelpflicht.py). Beide müssen
 * dieselben Ausnahmen kennen — sonst zeigt die App einen aktiven Knopf, hinter
 * dem eine Absage wartet.
 */

function user(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    authorized_user_id: 'u1',
    username: 'hans',
    display_name: 'Hans Muster',
    email: null,
    staff_id: 's1',
    staff_name: 'Hans Muster',
    tenant_id: 't1',
    role: 'user',
    consent_version: 'v1',
    consent_required: false,
    enabled_modules: ['timekeeping'],
    feature_flags: { rapport_nur_eingestempelt: { enabled: true } },
    ...overrides,
  }
}

function status(s: ZeitStatus['status']): ZeitStatus {
  return { status: s, clock_in: null, since_minutes: 0 }
}

describe('rapportClockInApplies', () => {
  it('gilt für den gewöhnlichen Mitarbeiter', () => {
    expect(rapportClockInApplies(user())).toBe(true)
  })

  it('gilt nicht für den Superadmin', () => {
    expect(rapportClockInApplies(user({ role: 'superadmin' }))).toBe(false)
  })

  it('gilt für Admin und Projektleiter', () => {
    expect(rapportClockInApplies(user({ role: 'admin' }))).toBe(true)
    expect(rapportClockInApplies(user({ role: 'management' }))).toBe(true)
  })

  it('gilt nicht ohne das Feature', () => {
    expect(rapportClockInApplies(user({ feature_flags: {} }))).toBe(false)
  })

  it('gilt nicht ohne das Modul Zeiterfassung', () => {
    expect(rapportClockInApplies(user({ enabled_modules: [] }))).toBe(false)
  })

  it('gilt nicht ohne Benutzer', () => {
    expect(rapportClockInApplies(null)).toBe(false)
  })
})

describe('rapportClockInBlocked', () => {
  it('sperrt den ausgestempelten Mitarbeiter', () => {
    expect(rapportClockInBlocked(user(), status('inactive'))).toBe(true)
  })

  it('lässt den eingestempelten durch', () => {
    expect(rapportClockInBlocked(user(), status('active'))).toBe(false)
  })

  it('zählt die Pause als eingestempelt — die Session läuft weiter', () => {
    expect(rapportClockInBlocked(user(), status('on_break'))).toBe(false)
  })

  it('sperrt nicht, solange der Stand unbekannt ist (offline, Fehler)', () => {
    expect(rapportClockInBlocked(user(), null)).toBe(false)
  })

  it('sperrt den Superadmin auch ausgestempelt nicht', () => {
    expect(rapportClockInBlocked(user({ role: 'superadmin' }), status('inactive'))).toBe(false)
  })
})

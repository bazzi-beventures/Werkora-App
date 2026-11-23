import { describe, it, expect } from 'vitest'
import { rapportBotAn, rapportFormularOffen } from './modules'
import type { UserInfo } from './auth'

// Not-Aus des Rapport-Bots (docs/specs/rapport-bot-guardrails.md §4.7).
const mit = (flags: Record<string, { enabled: boolean }>) => ({ feature_flags: flags } as unknown as UserInfo)

describe('rapportBotAn', () => {
  it('ist an, solange der Betreiber ihn nicht ausdrücklich ausschaltet', () => {
    expect(rapportBotAn(mit({}))).toBe(true)          // älterer Server ohne Schlüssel
    expect(rapportBotAn(null)).toBe(true)
    expect(rapportBotAn(mit({ rapport_bot: { enabled: true } }))).toBe(true)
    expect(rapportBotAn(mit({ rapport_bot: { enabled: false } }))).toBe(false)
  })
})

describe('rapportFormularOffen', () => {
  it('öffnet das Formular mit Feature oder beim Not-Aus', () => {
    expect(rapportFormularOffen(mit({}))).toBe(false)
    expect(rapportFormularOffen(mit({ rapport_offline_formular: { enabled: true } }))).toBe(true)
    expect(rapportFormularOffen(mit({ rapport_bot: { enabled: false } }))).toBe(true)
  })
})

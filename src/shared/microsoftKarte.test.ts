import { describe, expect, it } from 'vitest'
import { kartenZustand, zustandText, gueltigeAdresse } from './microsoftKarte'

describe('microsoftKarte — Zustände der Karte (Spec microsoft-365-verbindung §14)', () => {
  const ok = { zweck: 'versand' as const, verbunden: true, status: 'ok' as const, mailbox: 'info@firma.ch',
    connected_at: '2026-11-20T10:00:00Z', fehlende_rechte: [] }

  it('nicht eingerichtet schlägt alles', () => {
    expect(kartenZustand(false, ok)).toBe('nicht_eingerichtet')
  })

  it('nicht verbunden', () => {
    expect(kartenZustand(true, undefined)).toBe('nicht_verbunden')
    expect(kartenZustand(true, { zweck: 'eingang', verbunden: false, status: null })).toBe('nicht_verbunden')
  })

  it('verbunden mit Adresse und Datum', () => {
    expect(kartenZustand(true, ok)).toBe('verbunden')
    expect(zustandText('verbunden', ok)).toBe('Verbunden als info@firma.ch seit 20.11.2026.')
  })

  it('getrennt nennt den Grund', () => {
    const getrennt = { ...ok, status: 'getrennt' as const, last_error: 'invalid_grant' }
    expect(kartenZustand(true, getrennt)).toBe('getrennt')
    expect(zustandText('getrennt', getrennt)).toContain('neu verbinden')
    expect(zustandText('getrennt', getrennt)).toContain('invalid_grant')
  })

  it('fehlende Rechte', () => {
    const teil = { ...ok, fehlende_rechte: ['Calendars.ReadWrite'] }
    expect(kartenZustand(true, teil)).toBe('rechte_fehlen')
    expect(zustandText('rechte_fehlen', teil)).toContain('Calendars.ReadWrite')
  })

  it('Adresse prüfen', () => {
    expect(gueltigeAdresse('info@firma.ch')).toBe(true)
    expect(gueltigeAdresse('info firma.ch')).toBe(false)
    expect(gueltigeAdresse('')).toBe(false)
  })
})

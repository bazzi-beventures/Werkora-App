import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import ServiceStatusScreen from './ServiceStatusScreen'
import { getHealthHistory, getHealthStatus } from '../../api/serviceHealth'

// Bis 2026-11 lief das 60-s-Intervall mit dem Bereich vom Mount (30 Tage): wer
// «180d» wählte, sah den Verlauf nach spätestens einer Minute still auf 30 Tage
// zurückspringen, während der Knopf «180d» aktiv blieb.

vi.mock('./RouteMetricsPanel', () => ({ default: () => null }))
vi.mock('./JobsPanel', () => ({ default: () => null }))
vi.mock('../../api/serviceHealth', () => ({
  getHealthStatus: vi.fn(),
  getHealthHistory: vi.fn(),
  getMigrationStatus: vi.fn(() => Promise.reject(new Error('egal'))),
  getMfaStatus: vi.fn(() => Promise.reject(new Error('egal'))),
}))

const stats = { checks: 1, ok: 1, uptime_pct: 100, avg_ms: 50 }
const dienst = { latest: null, uptime_24h: stats, uptime_7d: stats }

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(getHealthStatus).mockResolvedValue({
    services: { railway: dienst, supabase: dienst, mistral: dienst },
  })
  vi.mocked(getHealthHistory).mockResolvedValue({ days: [] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(getHealthHistory).mockReset()
})

describe('ServiceStatusScreen — Verlaufsbereich', () => {
  it('hält den gewählten Bereich auch beim automatischen Nachladen', async () => {
    render(<ServiceStatusScreen />)
    fireEvent.click(await screen.findByRole('button', { name: '180d' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000) })

    const bereiche = vi.mocked(getHealthHistory).mock.calls.map(([tage]) => tage)
    expect(bereiche[0]).toBe(30)
    expect(bereiche[bereiche.length - 1]).toBe(180)
    // Nach der Wahl nie mehr 30 — weder doppelt beim Klick noch aus dem Intervall.
    expect(bereiche.slice(bereiche.indexOf(180))).not.toContain(30)
  })
})

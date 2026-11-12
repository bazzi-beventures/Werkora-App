import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import RouteMetricsPanel, { RouteMetricsTable } from './RouteMetricsPanel'
import { formatBytes } from './routeMetricsFormat'
import type { RouteMetric, RouteMetricsResponse } from '../../api/serviceHealth'
import * as api from '../../api/serviceHealth'

function route(over: Partial<RouteMetric> = {}): RouteMetric {
  return {
    method: 'GET', route: '/pwa/admin/projects', requests: 1200, errors: 0,
    dauer_ms_avg: 240, dauer_ms_max: 1800, bytes_sum: 52_000_000, bytes_avg: 43_000, bytes_max: 90_000,
    db_sum: 3600, db_avg: 3, db_max: 9,
    ...over,
  }
}

function ok(over: Partial<Extract<RouteMetricsResponse, { status: 'ok' }>> = {}): RouteMetricsResponse {
  return {
    status: 'ok', days: 7, routen: 2, requests: 1300, errors: 1, bytes: 52_100_000, db: 3700,
    min_requests: 20,
    langsamste: [route()],
    schwerste: [route(), route({ route: '/pwa/admin/projects/{project_id}', bytes_sum: 100_000 })],
    abfragereichste: [],
    ...over,
  }
}

describe('formatBytes', () => {
  it('wählt die passende Einheit', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(52_000_000)).toBe('49.6 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GB')
    expect(formatBytes(null)).toBe('—')
  })
})

describe('RouteMetricsTable', () => {
  it('zeigt Route als Schablone mit Methode und Kennzahlen', () => {
    render(<RouteMetricsTable data={ok()} liste="schwerste" />)
    expect(screen.getByText('/pwa/admin/projects/{project_id}')).toBeTruthy()
    expect(screen.getByText('49.6 MB')).toBeTruthy()
  })

  it('erklärt eine leere Liste mit der Mindestzahl Aufrufe', () => {
    render(<RouteMetricsTable data={ok()} liste="abfragereichste" />)
    expect(screen.getByText(/mindestens 20 Aufrufen/)).toBeTruthy()
  })

  it('sagt «nicht lesbar» statt eine leere Tabelle zu zeigen', () => {
    render(<RouteMetricsTable data={{ status: 'nicht_lesbar', days: 7 }} liste="langsamste" />)
    expect(screen.getByText(/Messung nicht lesbar/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('RouteMetricsPanel', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('lädt sieben Tage, wechselt Liste und Zeitraum', async () => {
    const spy = vi.spyOn(api, 'getRouteMetrics').mockResolvedValue(ok())
    render(<RouteMetricsPanel />)
    await waitFor(() => expect(screen.getByText('240 ms')).toBeTruthy())
    expect(spy).toHaveBeenCalledWith(7)

    fireEvent.click(screen.getByText('Schwerste'))
    expect(screen.getByText('/pwa/admin/projects/{project_id}')).toBeTruthy()

    fireEvent.click(screen.getByText('30d'))
    await waitFor(() => expect(spy).toHaveBeenCalledWith(30))
  })

  it('zeigt einen Ladefehler', async () => {
    vi.spyOn(api, 'getRouteMetrics').mockRejectedValue(new Error('403'))
    render(<RouteMetricsPanel />)
    await waitFor(() => expect(screen.getByText('403')).toBeTruthy())
  })
})

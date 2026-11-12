import { useEffect, useState } from 'react'
import { getRouteMetrics, RouteMetric, RouteMetricsResponse } from '../../api/serviceHealth'
import { formatBytes, formatMs } from './routeMetricsFormat'

/**
 * Routen-Messung im Service-Status (docs/specs/refactoring-wachstum.md §9).
 *
 * Drei Ranglisten: was am längsten dauert, was am meisten Daten ausliefert und
 * was je Aufruf die meisten DB-Abfragen braucht. Damit werden Schleifen-Abfragen
 * und fehlende `select`-Projektionen nach Wirkung sortierbar, statt sie alle
 * anzufassen. Eigene Datei, damit der Service-Status unter seinem
 * Grössen-Budget bleibt.
 */

const RANGES = [1, 7, 30] as const
type Range = typeof RANGES[number]

type Liste = 'langsamste' | 'schwerste' | 'abfragereichste'
const LISTEN: { key: Liste; label: string; hint: string }[] = [
  { key: 'langsamste', label: 'Langsamste', hint: 'Mittlere Dauer bis zur Antwort' },
  { key: 'schwerste', label: 'Schwerste', hint: 'Antwort-Bytes gesamt im Zeitraum, vor GZip' },
  { key: 'abfragereichste', label: 'Abfragereichste', hint: 'Mittlere DB-Abfragen je Aufruf' },
]

function Zeile({ r }: { r: RouteMetric }) {
  return (
    <tr>
      <td className="primary" style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
        <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{r.method}</span>{r.route}
      </td>
      <td style={{ textAlign: 'right' }}>{r.requests.toLocaleString('de-CH')}</td>
      <td style={{ textAlign: 'right' }} title={`max ${formatMs(r.dauer_ms_max)}`}>{formatMs(r.dauer_ms_avg)}</td>
      <td style={{ textAlign: 'right' }} title={`Ø ${formatBytes(r.bytes_avg)} · max ${formatBytes(r.bytes_max)}`}>{formatBytes(r.bytes_sum)}</td>
      <td style={{ textAlign: 'right' }} title={`max ${r.db_max ?? '—'}`}>{r.db_avg ?? '—'}</td>
      <td style={{ textAlign: 'right', color: r.errors > 0 ? 'var(--danger-ink)' : 'var(--text-muted)' }}>{r.errors}</td>
    </tr>
  )
}

export function RouteMetricsTable({ data, liste }: { data: RouteMetricsResponse; liste: Liste }) {
  if (data.status !== 'ok') {
    return (
      <div style={{ padding: 16, color: 'var(--warning-ink)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
        Messung nicht lesbar — die Migration 20261112_route_metrics ist vermutlich noch nicht eingespielt.
      </div>
    )
  }
  const zeilen = data[liste]
  if (zeilen.length === 0) {
    return (
      <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
        {liste === 'schwerste'
          ? 'Noch keine Messung im Zeitraum.'
          : `Noch keine Route mit mindestens ${data.min_requests} Aufrufen im Zeitraum.`}
      </div>
    )
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Route</th>
            <th style={{ textAlign: 'right' }}>Aufrufe</th>
            <th style={{ textAlign: 'right' }}>Ø Dauer</th>
            <th style={{ textAlign: 'right' }}>Bytes gesamt</th>
            <th style={{ textAlign: 'right' }}>Ø DB</th>
            <th style={{ textAlign: 'right' }}>5xx</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map(r => <Zeile key={`${r.method} ${r.route}`} r={r} />)}
        </tbody>
      </table>
    </div>
  )
}

export default function RouteMetricsPanel() {
  const [range, setRange] = useState<Range>(7)
  const [liste, setListe] = useState<Liste>('langsamste')
  const [data, setData] = useState<RouteMetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    getRouteMetrics(range)
      .then(d => { if (aktiv) { setData(d); setError(null) } })
      .catch(e => { if (aktiv) setError(e instanceof Error ? e.message : 'Fehler beim Laden') })
    return () => { aktiv = false }
  }, [range])

  const hint = LISTEN.find(l => l.key === liste)?.hint

  return (
    <div style={{ marginTop: 28 }} data-testid="route-metrics">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>
            Routen
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {hint}
            {data?.status === 'ok' && ` · ${data.requests.toLocaleString('de-CH')} Aufrufe auf ${data.routen} Routen, ${formatBytes(data.bytes)}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="svc-segmented">
            {LISTEN.map(l => (
              <button key={l.key} onClick={() => setListe(l.key)} data-active={liste === l.key}>{l.label}</button>
            ))}
          </div>
          <div className="svc-segmented">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)} data-active={range === r}>{r}d</button>
            ))}
          </div>
        </div>
      </div>
      {error && <div style={{ padding: 16, color: 'var(--danger-ink)', background: 'var(--danger-soft)', borderRadius: 'var(--radius-sm)' }}>{error}</div>}
      {!error && data && <RouteMetricsTable data={data} liste={liste} />}
      {!error && !data && <div className="admin-loading"><div className="kpi-admin-spinner" />Lädt…</div>}
    </div>
  )
}

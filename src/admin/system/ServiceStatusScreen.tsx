import { useEffect, useMemo, useState } from 'react'
import {
  getHealthStatus, getHealthHistory,
  HealthStatusResponse, HealthHistoryResponse, HistoryDay, DayUptime,
  ServiceHealth, ServiceName, ServiceStatus,
} from '../../api/serviceHealth'

const SERVICE_LABELS: Record<ServiceName, string> = {
  railway: 'Railway',
  supabase: 'Supabase',
  mistral: 'Mistral',
}

const SERVICE_SUB: Record<ServiceName, string> = {
  railway: 'Backend · FastAPI',
  supabase: 'Datenbank · PostgreSQL',
  mistral: 'KI · Chat/KPI/Material',
}

const SERVICE_ACCENT: Record<ServiceName, string> = {
  railway: '#8b5cf6',
  supabase: '#10b981',
  mistral: '#3b82f6',
}

const HISTORY_RANGES = [30, 90, 180, 365] as const
type HistoryRange = typeof HISTORY_RANGES[number]

const COLOR_OK = '#10b981'
const COLOR_WARN = '#f59e0b'
const COLOR_BAD = '#ef4444'
const COLOR_NONE = '#e5e7eb'

function dotColor(status: ServiceStatus | undefined, uptimePct: number): string {
  if (status === 'down' || uptimePct < 95) return COLOR_BAD
  if (status === 'slow' || uptimePct < 99) return COLOR_WARN
  return COLOR_OK
}

function statusBadge(status: ServiceStatus | undefined): { text: string; bg: string; fg: string } {
  if (status === 'ok') return { text: 'ONLINE', bg: '#dcfce7', fg: '#166534' }
  if (status === 'slow') return { text: 'LANGSAM', bg: '#fef3c7', fg: '#92400e' }
  if (status === 'down') return { text: 'OFFLINE', bg: '#fee2e2', fg: '#991b1b' }
  return { text: 'KEIN CHECK', bg: '#e5e7eb', fg: '#374151' }
}

function timeAgo(iso: string | undefined | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (isNaN(diff)) return '—'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `vor ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `vor ${m} Min`
  const h = Math.floor(m / 60)
  if (h < 24) return `vor ${h}h`
  const d = Math.floor(h / 24)
  return `vor ${d}d`
}

function cellColor(uptime: DayUptime | null): string {
  if (!uptime || uptime.checks === 0) return COLOR_NONE
  if (uptime.uptime_pct >= 99) return COLOR_OK
  if (uptime.uptime_pct >= 95) return COLOR_WARN
  return COLOR_BAD
}

function formatDay(day: string): string {
  const [, m, d] = day.split('-')
  return `${d}.${m}.`
}

// Ganze Tage zwischen `day` (YYYY-MM-DD, UTC) und heute. 0 = heute, negativ = Zukunft.
function daysAgo(day: string): number {
  const then = new Date(`${day}T00:00:00Z`).getTime()
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((todayUtc - then) / 86_400_000)
}

function weightedAvg(days: HistoryDay[], pick: (d: HistoryDay) => DayUptime | null): number | null {
  let sumPctWeighted = 0
  let sumChecks = 0
  for (const d of days) {
    const u = pick(d)
    if (!u || u.checks === 0) continue
    sumPctWeighted += u.uptime_pct * u.checks
    sumChecks += u.checks
  }
  return sumChecks > 0 ? sumPctWeighted / sumChecks : null
}

function StatusCard({ name, data }: { name: ServiceName; data: ServiceHealth }) {
  const stale = data.latest?.is_stale === true
  const status = data.latest?.status
  const badge = stale
    ? { text: 'Probe stale', bg: '#e5e7eb', fg: '#374151' }
    : statusBadge(status)
  // Bei stale: grauer Punkt — wir können dem letzten Status nicht mehr trauen.
  const dot = stale ? '#9ca3af' : dotColor(status, data.uptime_24h.uptime_pct)
  const pct = data.uptime_24h.checks > 0 ? data.uptime_24h.uptime_pct : null

  return (
    <div className="svc-card" style={{ ['--svc-accent' as string]: SERVICE_ACCENT[name] }}>
      <div className="svc-card-head">
        <div>
          <div className="svc-card-title">{SERVICE_LABELS[name]}</div>
          <div className="svc-card-sub">{SERVICE_SUB[name]}</div>
        </div>
        <div className="svc-card-dot" style={{ background: dot }} />
      </div>

      <div>
        <div className="svc-card-value">
          {pct != null ? pct.toFixed(2) : '—'}
          <span className="svc-card-value-unit">%</span>
        </div>
        <div className="svc-card-caption">
          Uptime 24h · {data.uptime_24h.ok}/{data.uptime_24h.checks} Checks
        </div>
      </div>

      <div className="svc-card-badge-row">
        <span className="svc-badge" style={{ background: badge.bg, color: badge.fg }}>
          <span className="svc-badge-dot" />{badge.text}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(data.latest?.checked_at)}</span>
      </div>

      <div className="svc-card-meta">
        <div>
          Uptime 7d
          <div className="svc-card-meta-val">
            {data.uptime_7d.checks > 0 ? `${data.uptime_7d.uptime_pct.toFixed(2)}%` : '—'}
          </div>
        </div>
        <div>
          Ø Antwort
          <div className="svc-card-meta-val">
            {data.uptime_24h.avg_ms != null ? `${data.uptime_24h.avg_ms} ms` : '—'}
          </div>
        </div>
      </div>

      {data.latest?.error && (
        <div style={{ fontSize: 11, color: '#991b1b', background: '#fee2e2', padding: '6px 10px', borderRadius: 6 }}>
          {data.latest.error}
        </div>
      )}
    </div>
  )
}

function HeatmapRow({
  name,
  days,
  pick,
}: {
  name: ServiceName
  days: HistoryDay[]
  pick: (d: HistoryDay) => DayUptime | null
}) {
  const avgPct = weightedAvg(days, pick)

  return (
    <div className="svc-heatmap-row">
      <div className="svc-heatmap-label">
        <span className="svc-heatmap-label-dot" style={{ background: SERVICE_ACCENT[name] }} />
        {SERVICE_LABELS[name]}
      </div>
      <div className="svc-heatmap-cells">
        {days.map(d => {
          const u = pick(d)
          const title = u && u.checks > 0
            ? `${formatDay(d.day)} · ${u.uptime_pct.toFixed(2)}% · ${u.checks} Checks · Ø ${u.avg_ms ?? '—'} ms`
            : `${formatDay(d.day)} · keine Daten`
          return (
            <div
              key={d.day}
              className="svc-heatmap-cell"
              style={{ background: cellColor(u) }}
              title={title}
            />
          )
        })}
      </div>
      <div className="svc-heatmap-pct">
        {avgPct != null ? `${avgPct.toFixed(2)}%` : '—'}
        <small>Uptime</small>
      </div>
    </div>
  )
}

function Heatmap({ days }: { days: HistoryDay[] }) {
  if (days.length === 0) {
    return (
      <div className="svc-heatmap" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 36 }}>
        Noch keine Historie verfügbar — Daten sammeln sich an, sobald die Workflows laufen.
      </div>
    )
  }
  // Backend liefert DESC (neuester zuerst). Die Zeitachse läuft links→rechts = alt→neu,
  // also chronologisch aufsteigend sortieren — sonst stehen die Labels am falschen Ende.
  const ordered = [...days].sort((a, b) => a.day.localeCompare(b.day))
  const oldest = ordered[0].day
  const newest = ordered[ordered.length - 1].day
  const sameDay = ordered.length === 1

  // Labels aus den echten Daten ableiten — nicht aus der angefragten Spanne. "heute"
  // nur wenn der jüngste Tag wirklich heute ist (sonst läuft der Probe-Cron nicht mehr).
  const agoNew = daysAgo(newest)
  const leftLabel = `vor ${daysAgo(oldest)}d · ${formatDay(oldest)}`
  const rightLabel = `${agoNew <= 0 ? 'heute' : `vor ${agoNew}d`} · ${formatDay(newest)}`

  return (
    <div className="svc-heatmap">
      <HeatmapRow name="railway" days={ordered} pick={d => d.railway} />
      <HeatmapRow name="supabase" days={ordered} pick={d => d.supabase} />
      <HeatmapRow name="mistral" days={ordered} pick={d => d.mistral} />
      {sameDay ? (
        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 10 }}>
          {formatDay(newest)}
        </div>
      ) : (
        <div className="svc-heatmap-axis">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
      <div className="svc-heatmap-legend">
        <span><span className="svc-legend-swatch" style={{ background: COLOR_OK }} />Operational (≥ 99%)</span>
        <span><span className="svc-legend-swatch" style={{ background: COLOR_WARN }} />Degraded (95–99%)</span>
        <span><span className="svc-legend-swatch" style={{ background: COLOR_BAD }} />Outage (&lt; 95%)</span>
        <span><span className="svc-legend-swatch" style={{ background: COLOR_NONE }} />Keine Daten</span>
      </div>
    </div>
  )
}

function OverallBanner({ data }: { data: HealthStatusResponse }) {
  const services = Object.values(data.services)
  const staleCount = services.filter(s => s.latest?.is_stale === true).length
  const downCount = services.filter(s => s.latest?.status === 'down' && !s.latest?.is_stale).length
  const slowCount = services.filter(s => s.latest?.status === 'slow' && !s.latest?.is_stale).length

  // Stale geht vor down/slow: wenn der Probe nicht läuft, sind die Status-Werte
  // veraltet und nicht verlässlich — kein Sinn "down" zu melden.
  if (staleCount > 0) {
    return (
      <div className="svc-banner svc-banner-warn">
        <div className="svc-banner-icon">!</div>
        <div>
          <div className="svc-banner-title">Probe-Cron ausgefallen</div>
          <div className="svc-banner-sub">Letzter Check vor &gt;10 Min — Service-Status nicht aktuell. Railway-Cron prüfen.</div>
        </div>
      </div>
    )
  }
  if (downCount > 0) {
    return (
      <div className="svc-banner svc-banner-bad">
        <div className="svc-banner-icon">!</div>
        <div>
          <div className="svc-banner-title">Störung erkannt</div>
          <div className="svc-banner-sub">{downCount} Service{downCount > 1 ? 's' : ''} offline</div>
        </div>
      </div>
    )
  }
  if (slowCount > 0) {
    return (
      <div className="svc-banner svc-banner-warn">
        <div className="svc-banner-icon">!</div>
        <div>
          <div className="svc-banner-title">Eingeschränkte Leistung</div>
          <div className="svc-banner-sub">{slowCount} Service{slowCount > 1 ? 's' : ''} reagiert verzögert</div>
        </div>
      </div>
    )
  }
  return (
    <div className="svc-banner svc-banner-ok">
      <div className="svc-banner-icon">✓</div>
      <div>
        <div className="svc-banner-title">Alle Systeme betriebsbereit</div>
        <div className="svc-banner-sub">Letzter Check vor wenigen Minuten · automatisches Refresh alle 60 Sek</div>
      </div>
    </div>
  )
}

export default function ServiceStatusScreen() {
  const [data, setData] = useState<HealthStatusResponse | null>(null)
  const [history, setHistory] = useState<HealthHistoryResponse | null>(null)
  const [historyRange, setHistoryRange] = useState<HistoryRange>(30)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(range: HistoryRange = historyRange) {
    try {
      const [status, hist] = await Promise.all([getHealthStatus(), getHealthHistory(range)])
      setData(status)
      setHistory(hist)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(() => load(), 60_000)
    return () => clearInterval(id)
  }, [])

  function changeRange(r: HistoryRange) {
    setHistoryRange(r)
    setLoading(true)
    load(r)
  }

  const headerMeta = useMemo(() => {
    if (!history) return null
    return `${history.days.length} Tag${history.days.length === 1 ? '' : 'e'} sichtbar`
  }, [history])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Service-Status</div>
          <div className="admin-page-subtitle">
            Externes Monitoring via GitHub Actions
          </div>
        </div>
        <button
          className="svc-refresh"
          onClick={() => load()}
          disabled={loading}
          data-loading={loading}
        >
          <span className="svc-refresh-icon">↻</span>
          {loading ? 'Lädt…' : 'Aktualisieren'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {data && <OverallBanner data={data} />}

      {data && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}>
          <StatusCard name="railway" data={data.services.railway} />
          <StatusCard name="supabase" data={data.services.supabase} />
          <StatusCard name="mistral" data={data.services.mistral} />
        </div>
      )}

      {!data && !error && (
        <div className="admin-loading"><div className="kpi-admin-spinner" />Lädt…</div>
      )}

      {history && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>
                Uptime-Verlauf
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Ein Block = ein Tag · Hover für Details {headerMeta && `· ${headerMeta}`}
              </div>
            </div>
            <div className="svc-segmented">
              {HISTORY_RANGES.map(r => (
                <button
                  key={r}
                  onClick={() => changeRange(r)}
                  data-active={historyRange === r}
                >
                  {r}d
                </button>
              ))}
            </div>
          </div>
          <Heatmap days={history.days} />
        </div>
      )}

      <div style={{ marginTop: 24, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>Wie das funktioniert:</strong> Drei GitHub-Actions-Workflows pingen
        Railway, Supabase und Mistral und schreiben jedes Resultat in eine Tabelle.
        Die Karten zeigen den aktuellen Status, der Verlauf kombiniert Rohdaten (letzte 30 Tage)
        mit Tages-Aggregat (älter). GitHub-Cron läuft Best-Effort — geringe Verzögerungen sind normal.
      </div>
    </div>
  )
}

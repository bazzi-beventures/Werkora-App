import { useEffect, useState } from 'react'
import { getJobs, JobsResponse, JobUebersicht } from '../../api/serviceHealth'

/**
 * Hintergrundläufe im Service-Status (docs/specs/refactoring-wachstum.md §3).
 *
 * Je Job der letzte Lauf und die Fehler der letzten sieben Tage, dazu ob ein
 * Runner die Lease hält. Vorher stand das nur im Railway-Log — ob der nächtliche
 * Cleanup lief, wusste niemand, bis eine Tabelle voll war.
 */

const STATUS: Record<string, { text: string; bg: string; fg: string }> = {
  ok: { text: 'OK', bg: 'var(--success-soft)', fg: 'var(--success-ink)' },
  fehler: { text: 'FEHLER', bg: 'var(--danger-soft)', fg: 'var(--danger-ink)' },
  laeuft: { text: 'LÄUFT', bg: 'var(--warning-soft)', fg: 'var(--warning-ink)' },
}

function zeit(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Zeile({ job }: { job: JobUebersicht }) {
  const s = job.letzter ? STATUS[job.letzter.status] : null
  return (
    <tr>
      <td className="primary">
        {job.beschreibung}
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{job.name} · {job.plan}</div>
      </td>
      <td>
        {s
          ? <span className="svc-badge" style={{ background: s.bg, color: s.fg }}><span className="svc-badge-dot" />{s.text}</span>
          : <span style={{ color: 'var(--text-muted)' }}>noch nie</span>}
      </td>
      <td>{zeit(job.letzter?.finished_at ?? job.letzter?.started_at)}</td>
      <td style={{ textAlign: 'right' }}>{job.letzter?.dauer_ms != null ? `${job.letzter.dauer_ms} ms` : '—'}</td>
      <td style={{ textAlign: 'right', color: job.fehler > 0 ? 'var(--danger-ink)' : 'var(--text-muted)' }}>
        {job.fehler} / {job.laeufe}
      </td>
      <td style={{ fontSize: 12, color: 'var(--danger-ink)', maxWidth: 320 }}>
        {job.letzter_fehler?.error ?? ''}
      </td>
    </tr>
  )
}

/** `jetzt` = Zeitpunkt des Ladens (nicht des Zeichnens — Render bleibt rein). */
export function JobsTable({ data, jetzt }: { data: JobsResponse; jetzt: number }) {
  if (data.status !== 'ok') {
    return (
      <div style={{ padding: 16, color: 'var(--warning-ink)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
        Lauf-Journal nicht lesbar — die Migration 20261112b_job_runner ist vermutlich noch nicht eingespielt.
      </div>
    )
  }
  const aktiv = data.lease != null && new Date(data.lease.expires_at).getTime() > jetzt
  return (
    <>
      <div style={{ fontSize: 12, marginBottom: 10, color: aktiv ? 'var(--text-muted)' : 'var(--danger-ink)' }}>
        {aktiv
          ? `Runner aktiv: ${data.lease!.holder} · seit ${zeit(data.lease!.acquired_at)}`
          : 'Kein Runner hält die Lease — es laufen keine Jobs.'}
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Letzter Lauf</th>
              <th>Zeitpunkt</th>
              <th style={{ textAlign: 'right' }}>Dauer</th>
              <th style={{ textAlign: 'right' }}>Fehler / Läufe</th>
              <th>Letzter Fehler</th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map(j => <Zeile key={j.name} job={j} />)}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function JobsPanel() {
  const [data, setData] = useState<JobsResponse | null>(null)
  const [geladenUm, setGeladenUm] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    getJobs(7)
      .then(d => { if (aktiv) { setData(d); setGeladenUm(Date.now()); setError(null) } })
      .catch(e => { if (aktiv) setError(e instanceof Error ? e.message : 'Fehler beim Laden') })
    return () => { aktiv = false }
  }, [])

  return (
    <div style={{ marginTop: 28 }} data-testid="jobs-panel">
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>
        Hintergrundläufe
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        Letzte 7 Tage · nur diese Umgebung · weitere Läufe ziehen nach und nach unter den Job-Runner
      </div>
      {error && <div style={{ padding: 16, color: 'var(--danger-ink)', background: 'var(--danger-soft)', borderRadius: 'var(--radius-sm)' }}>{error}</div>}
      {!error && data && <JobsTable data={data} jetzt={geladenUm} />}
      {!error && !data && <div className="admin-loading"><div className="kpi-admin-spinner" />Lädt…</div>}
    </div>
  )
}

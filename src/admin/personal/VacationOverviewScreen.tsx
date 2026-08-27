import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { getVacationOverview } from '../../api/admin/hr'
import type { VacationRow } from '../../api/admin/hr'

const SOURCE_LABEL: Record<string, string> = {
  personal: 'persönlich',
  tenant_default: 'Standard',
  age_50plus: '50+ (Tenant)',
  system_default: 'Fallback',
  error_fallback: 'Fehler',
}

function formatSource(source: string): string {
  if (source.startsWith('age_')) return SOURCE_LABEL.age_50plus
  return SOURCE_LABEL[source] ?? source
}

function remainingStyle(remaining: number): CSSProperties {
  const base: CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 700,
  }
  if (remaining < 0) return { ...base, background: 'var(--danger-soft)', color: 'var(--danger-ink)' }
  if (remaining <= 5) return { ...base, background: 'var(--warning-soft)', color: 'var(--warning-ink)' }
  return { ...base, background: 'var(--success-soft)', color: 'var(--success-ink)' }
}

export default function VacationOverviewScreen() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState<number>(currentYear)
  const [rows, setRows] = useState<VacationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const result = await getVacationOverview(year)
      setRows(result)
    } catch {
      setError('Fehler beim Laden.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [year])

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.staff_name.localeCompare(b.staff_name, 'de-CH')),
    [rows]
  )

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      entitlement: acc.entitlement + r.entitlement,
      taken: acc.taken + r.taken,
      planned: acc.planned + r.planned,
      remaining: acc.remaining + r.remaining,
    }),
    { entitlement: 0, taken: 0, planned: 0, remaining: 0 },
  ), [rows])

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Ferien</div>
          <div className="admin-page-subtitle">Anspruch, bezogen, geplant und Restsaldo pro Mitarbeiter</div>
        </div>
      </div>

      {/* Filter */}
      <div className="admin-table-wrap" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="admin-form-group">
            <label className="admin-form-label">Jahr</label>
            <select
              className="admin-form-input"
              value={year}
              onChange={e => setYear(parseInt(e.target.value, 10))}
              style={{ width: 120 }}
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button className="admin-btn admin-btn-primary" onClick={load} disabled={loading}>
            {loading ? 'Laden…' : 'Aktualisieren'}
          </button>
        </div>
      </div>

      {loading && <div className="admin-loading"><div className="admin-spinner" /> Daten werden geladen…</div>}
      {error && (
        <div className="admin-table-wrap">
          <div className="admin-table-empty" style={{ padding: 32, color: 'var(--danger)' }}>{error}</div>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="admin-table-wrap">
          <div className="admin-table-empty" style={{ padding: 48 }}>Keine Mitarbeiter gefunden.</div>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th style={{ textAlign: 'right' }}>Anspruch</th>
                <th style={{ textAlign: 'right' }}>Bezogen</th>
                <th style={{ textAlign: 'right' }}>Geplant</th>
                <th style={{ textAlign: 'right' }}>Rest</th>
                <th>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => (
                <tr key={r.staff_id}>
                  <td className="primary">{r.staff_name}</td>
                  <td className="secondary" style={{ textAlign: 'right' }}>{r.entitlement} d</td>
                  <td className="secondary" style={{ textAlign: 'right' }}>{r.taken} d</td>
                  <td className="secondary" style={{ textAlign: 'right' }}>{r.planned} d</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={remainingStyle(r.remaining)}>{r.remaining} d</span>
                  </td>
                  <td className="secondary" style={{ fontSize: 12 }}>{formatSource(r.source)}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                <td>Total</td>
                <td style={{ textAlign: 'right' }}>{totals.entitlement} d</td>
                <td style={{ textAlign: 'right' }}>{totals.taken} d</td>
                <td style={{ textAlign: 'right' }}>{totals.planned} d</td>
                <td style={{ textAlign: 'right', color: totals.remaining >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {totals.remaining} d
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

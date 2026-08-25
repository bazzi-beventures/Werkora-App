import { useEffect, useMemo, useState } from 'react'
import { acknowledgeArgViolation, getHrTimesheet, listArgViolations } from '../../api/admin/hr'
import type {
  ArgViolation as DbViolation, HrLaborHour as LaborHour, HrOvertimeInfo as OvertimeInfo,
  HrSession as Session, HrTimesheet as TimesheetData, StaffRoleName as StaffRole,
} from '../../api/admin/hr'
import { useVisibilityPolling } from '../../hooks/useVisibilityPolling'
import MultiDropdown from '../kpis/components/MultiDropdown'
import '../kpis/kpi-dashboard.css'
import { useToast, ToastHost } from '../components/useToast'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''
const LS_SHOW_MANAGEMENT = 'hr_reports_show_management'

const MANAGEMENT_ROLES: ReadonlySet<StaffRole> = new Set<StaffRole>(['management', 'superadmin'])

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function fmtHours(minutes: number | null) {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${m.toString().padStart(2, '0')} h`
}

function fmtDecimal(hours: number) {
  const sign = hours >= 0 ? '+' : ''
  return `${sign}${hours.toFixed(1)} h`
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })
}

function groupByStaff(sessions: Session[]) {
  const map = new Map<string, Session[]>()
  for (const s of sessions) {
    const arr = map.get(s.staff_name) ?? []
    arr.push(s)
    map.set(s.staff_name, arr)
  }
  return map
}

export default function HrReportsScreen() {
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [tab, setTab] = useState<'timesheet' | 'violations'>('timesheet')
  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)
  const [data, setData] = useState<TimesheetData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const { toast, showToast } = useToast()

  const [violations, setViolations] = useState<DbViolation[]>([])
  const [violationsLoading, setViolationsLoading] = useState(false)
  const [acknowledging, setAcknowledging] = useState<string | null>(null)

  const [showManagement, setShowManagement] = useState<boolean>(() => {
    return localStorage.getItem(LS_SHOW_MANAGEMENT) === '1'
  })
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set())
  // Wenn null/leer interpretieren wir „Alle". Sobald der User explizit toggelt, hält das Set die Auswahl.
  const [staffFilterUserModified, setStaffFilterUserModified] = useState(false)

  function persistShowManagement(v: boolean) {
    setShowManagement(v)
    if (v) localStorage.setItem(LS_SHOW_MANAGEMENT, '1')
    else localStorage.removeItem(LS_SHOW_MANAGEMENT)
  }

  // background=true → getakteter Live-Refresh: keinen Spinner zeigen und bei
  // einem Fehler die bisherigen Daten stehen lassen (sonst flackert die Liste).
  async function load(background = false) {
    if (!background) setLoading(true)
    try {
      setData(await getHrTimesheet(dateFrom, dateTo))
    } catch {
      if (!background) setData(null)
    } finally {
      if (!background) setLoading(false)
    }
  }

  async function loadViolations(background = false) {
    if (!background) setViolationsLoading(true)
    try {
      setViolations(await listArgViolations(dateFrom, dateTo))
    } catch {
      if (!background) setViolations([])
    } finally {
      if (!background) setViolationsLoading(false)
    }
  }

  async function acknowledgeViolation(id: string) {
    setAcknowledging(id)
    try {
      await acknowledgeArgViolation(id)
      setViolations(vs => vs.map(v => v.id === id ? { ...v, acknowledged: true } : v))
    } catch {
      showToast('Fehler beim Bestätigen', 'error')
    } finally {
      setAcknowledging(null)
    }
  }

  // Initialer Load + Live-Refresh alle 15 s. So sieht die GF neu eingestempelte
  // Mitarbeiter ohne manuelles Neuladen. Der Poll nutzt jeweils den aktuell
  // eingestellten Zeitraum (dateFrom/dateTo) über die aktuelle Closure.
  useVisibilityPolling(({ background }) => {
    load(background)
    loadViolations(background)
  }, 15_000)

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`${BASE_URL}/pwa/admin/hr/export-timesheets`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Export fehlgeschlagen')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : `Stunden-Export_${dateFrom}_${dateTo}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      showToast('Export heruntergeladen', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export fehlgeschlagen', 'error')
    } finally {
      setExporting(false)
    }
  }

  // ── Lookup-Tabellen ──────────────────────────────
  const roleByName: Map<string, StaffRole> = useMemo(() => {
    const m = new Map<string, StaffRole>()
    if (data?.staff_roles) {
      for (const [name, role] of Object.entries(data.staff_roles)) m.set(name, role ?? null)
    }
    for (const s of data?.sessions ?? []) {
      if (!m.has(s.staff_name) && s.staff_role !== undefined) m.set(s.staff_name, s.staff_role ?? null)
    }
    for (const v of violations) {
      if (!m.has(v.staff_name) && v.staff_role !== undefined) m.set(v.staff_name, v.staff_role ?? null)
    }
    return m
  }, [data, violations])

  const liveStaff: Set<string> = useMemo(() => new Set(data?.currently_clocked_in ?? []), [data])

  const isManagement = (staffName: string) => MANAGEMENT_ROLES.has(roleByName.get(staffName) ?? null)

  // ── Mitarbeiter-Liste für Multi-Select aufbauen ──
  // Union aus Sessions, overtime_by_staff (auch ohne Sessions), Verstössen.
  const allStaffNames: string[] = useMemo(() => {
    const set = new Set<string>()
    for (const s of data?.sessions ?? []) set.add(s.staff_name)
    if (data?.overtime_by_staff) for (const k of Object.keys(data.overtime_by_staff)) set.add(k)
    for (const v of violations) set.add(v.staff_name)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de-CH'))
  }, [data, violations])

  // Visible (nach GF-Toggle) — bestimmt was im Multi-Select überhaupt zur Auswahl steht
  const visibleStaffNames: string[] = useMemo(() => {
    return showManagement ? allStaffNames : allStaffNames.filter(n => !isManagement(n))
  }, [allStaffNames, showManagement, roleByName])

  // Wenn der User noch nichts manuell gefiltert hat, gilt „alles ist ausgewählt".
  // Sobald er einmal toggelt, halten wir seine Auswahl, blenden aber neu sichtbare/verschwundene Namen aktiv aus.
  useEffect(() => {
    if (!staffFilterUserModified) {
      setSelectedStaff(new Set(visibleStaffNames))
      return
    }
    setSelectedStaff(prev => {
      const next = new Set<string>()
      for (const n of visibleStaffNames) if (prev.has(n)) next.add(n)
      return next
    })
  }, [visibleStaffNames.join('|')])  // eslint-disable-line react-hooks/exhaustive-deps

  function toggleStaff(name: string) {
    setStaffFilterUserModified(true)
    setSelectedStaff(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  function toggleAllStaff(all: boolean) {
    setStaffFilterUserModified(true)
    setSelectedStaff(all ? new Set(visibleStaffNames) : new Set())
  }

  // ── Sessions filtern + nach Staff gruppieren ──
  const filteredSessions = useMemo(() => {
    const sessions = data?.sessions ?? []
    return sessions.filter(s => selectedStaff.has(s.staff_name))
  }, [data, selectedStaff])

  const staffGroups = useMemo(() => groupByStaff(filteredSessions), [filteredSessions])

  function staffTotalHours(sessions: Session[]) {
    return sessions.reduce((sum, s) => sum + (s.total_minutes ?? 0), 0)
  }

  // Mitarbeiter-Reihenfolge: aktuell eingestempelt zuerst, dann mit Sessions, dann Rest. Innerhalb Gruppen alphabetisch.
  const orderedStaffNames: string[] = useMemo(() => {
    const inGroups = new Set(staffGroups.keys())
    const visibleSet = new Set(visibleStaffNames.filter(n => selectedStaff.has(n)))
    const live: string[] = []
    const withSessions: string[] = []
    const others: string[] = []
    for (const n of visibleSet) {
      if (liveStaff.has(n)) live.push(n)
      else if (inGroups.has(n)) withSessions.push(n)
      else others.push(n)
    }
    const cmp = (a: string, b: string) => a.localeCompare(b, 'de-CH')
    return [...live.sort(cmp), ...withSessions.sort(cmp), ...others.sort(cmp)]
  }, [staffGroups, visibleStaffNames, selectedStaff, liveStaff])

  // ── Verstösse vereinigen + filtern ──
  type UnifiedViolation = {
    key: string
    staff_name: string
    date: string
    description: string
    dbId: string | null
    acknowledged: boolean
    severity: string
  }

  const unifiedViolations: UnifiedViolation[] = useMemo(() => {
    const dbByKey = new Map<string, DbViolation>()
    for (const v of violations) {
      dbByKey.set(`${v.staff_name}|${v.violation_date}|${v.description}`, v)
    }
    const out: UnifiedViolation[] = []
    const seenKeys = new Set<string>()
    if (data) {
      for (const s of data.sessions) {
        for (const text of (s.violations ?? [])) {
          const key = `${s.staff_name}|${s.date}|${text}`
          if (seenKeys.has(key)) continue
          seenKeys.add(key)
          const dbv = dbByKey.get(key)
          out.push({
            key,
            staff_name: s.staff_name,
            date: s.date,
            description: text,
            dbId: dbv?.id ?? null,
            acknowledged: dbv?.acknowledged ?? false,
            severity: dbv?.severity ?? 'warning',
          })
        }
      }
    }
    for (const v of violations) {
      const key = `${v.staff_name}|${v.violation_date}|${v.description}`
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      out.push({
        key,
        staff_name: v.staff_name,
        date: v.violation_date,
        description: v.description,
        dbId: v.id,
        acknowledged: v.acknowledged,
        severity: v.severity,
      })
    }
    out.sort((a, b) => b.date.localeCompare(a.date))
    return out
  }, [data, violations])

  const filteredViolations = useMemo(
    () => unifiedViolations.filter(v => {
      if (!selectedStaff.has(v.staff_name)) return false
      if (!showManagement && isManagement(v.staff_name)) return false
      return true
    }),
    [unifiedViolations, selectedStaff, showManagement, roleByName]
  )

  const unifiedBadgeCount = filteredViolations.filter(v => !v.acknowledged).length

  function toggleExpand(name: string) {
    setExpandedStaff(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  function handleLoad() {
    load()
    loadViolations()
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">HR-Berichte</div>
          <div className="admin-page-subtitle">Arbeitszeitübersicht pro Mitarbeiter</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 0 16px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
        <button
          className={`admin-btn ${tab === 'timesheet' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
          onClick={() => setTab('timesheet')}
        >
          Zeiterfassung
        </button>
        <button
          className={`admin-btn ${tab === 'violations' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
          onClick={() => setTab('violations')}
          style={{ position: 'relative' }}
        >
          Verstösse
          {unifiedBadgeCount > 0 && (
            <span style={{
              position: 'absolute', top: -6, right: -6,
              background: '#ef4444', color: '#fff',
              fontSize: 11, fontWeight: 700,
              borderRadius: 10, padding: '1px 6px', lineHeight: '16px',
            }}>
              {unifiedBadgeCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter */}
      <div className="admin-table-wrap" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="admin-form-group">
            <label className="admin-form-label">Von</label>
            <input type="date" className="admin-form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 160 }} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Bis</label>
            <input type="date" className="admin-form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 160 }} />
          </div>
          <button className="admin-btn admin-btn-primary" onClick={handleLoad} disabled={loading || violationsLoading}>
            {loading || violationsLoading ? 'Laden…' : 'Laden'}
          </button>
          {tab === 'timesheet' && (
            <button className="admin-btn admin-btn-secondary" onClick={handleExport} disabled={exporting || loading}>
              {exporting ? 'Exportieren…' : 'XLSX Export'}
            </button>
          )}

          <div style={{ flex: '1 0 auto' }} />

          {/* Mitarbeiter-Filter */}
          {visibleStaffNames.length > 0 && (
            <div className="admin-form-group">
              <label className="admin-form-label">Mitarbeiter</label>
              <MultiDropdown
                label={
                  selectedStaff.size === visibleStaffNames.length
                    ? 'Alle'
                    : `${selectedStaff.size}/${visibleStaffNames.length}`
                }
                options={visibleStaffNames.map(n => ({
                  value: n,
                  count: (data?.sessions ?? []).filter(s => s.staff_name === n).length,
                }))}
                selected={selectedStaff}
                onToggle={toggleStaff}
                onToggleAll={toggleAllStaff}
              />
            </div>
          )}

          {/* GF-Toggle */}
          <div className="admin-form-group">
            <label className="admin-form-label">&nbsp;</label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, color: 'var(--text)', cursor: 'pointer',
              padding: '6px 10px', border: '1px solid var(--border)',
              borderRadius: 6, background: showManagement ? 'var(--surface-2)' : 'transparent',
              userSelect: 'none', whiteSpace: 'nowrap',
            }}>
              <input
                type="checkbox"
                checked={showManagement}
                onChange={e => persistShowManagement(e.target.checked)}
              />
              Geschäftsführung anzeigen
            </label>
          </div>
        </div>
      </div>

      {/* ─── Violations Tab ─── */}
      {tab === 'violations' && (
        <>
          {(loading || violationsLoading) && <div className="admin-loading"><div className="admin-spinner" /> Verstösse werden geladen…</div>}
          {!loading && !violationsLoading && filteredViolations.length === 0 && (
            <div className="admin-table-wrap">
              <div className="admin-table-empty" style={{ padding: 48 }}>Keine Verstösse im gewählten Zeitraum.</div>
            </div>
          )}
          {!loading && !violationsLoading && filteredViolations.length > 0 && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Mitarbeiter</th>
                    <th>Beschreibung</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredViolations.map(v => (
                    <tr key={v.key}>
                      <td className="secondary" style={{ whiteSpace: 'nowrap' }}>{fmtDate(v.date)}</td>
                      <td className="primary">{v.staff_name}</td>
                      <td style={{ fontSize: 13, color: 'var(--danger)' }}>{v.description}</td>
                      <td>
                        {v.acknowledged ? (
                          <span style={{ fontSize: 12, color: 'var(--success)' }}>Bestätigt</span>
                        ) : v.dbId ? (
                          <button
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            disabled={acknowledging === v.dbId}
                            onClick={() => acknowledgeViolation(v.dbId!)}
                          >
                            {acknowledging === v.dbId ? '…' : 'Bestätigen'}
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Offen</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── Timesheet Tab ─── */}
      {tab === 'timesheet' && loading && <div className="admin-loading"><div className="admin-spinner" /> Zeiterfassungsdaten werden geladen…</div>}

      {tab === 'timesheet' && data && !loading && (
        <>
          {orderedStaffNames.length === 0 ? (
            <div className="admin-table-wrap">
              <div className="admin-table-empty" style={{ padding: 48 }}>Keine Daten für diesen Zeitraum gefunden.</div>
            </div>
          ) : (
            orderedStaffNames.map(staffName => {
              const sessions = staffGroups.get(staffName) ?? []
              const totalMin = staffTotalHours(sessions)
              const isExpanded = expandedStaff.has(staffName)
              const overtime = data.overtime_by_staff?.[staffName]
              const isLive = liveStaff.has(staffName)

              return (
                <div key={staffName} className="admin-table-wrap" style={{ marginBottom: 14 }}>
                  {/* Staff-Header */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', cursor: 'pointer', userSelect: 'none',
                    }}
                    onClick={() => toggleExpand(staffName)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ position: 'relative' }}>
                        <div className="admin-avatar" style={{ width: 34, height: 34 }}>
                          {staffName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        {isLive && (
                          <span
                            title="Jetzt eingestempelt"
                            style={{
                              position: 'absolute', bottom: -2, right: -2,
                              width: 12, height: 12, borderRadius: '50%',
                              background: '#22c55e',
                              border: '2px solid var(--surface, #0f172a)',
                              boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
                            }}
                          />
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {staffName}
                          {isLive && (
                            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>● live</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {sessions.length === 0
                            ? 'Keine Sessions im Zeitraum'
                            : `${sessions.length} Session${sessions.length === 1 ? '' : 's'}`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                      {overtime && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontWeight: 700, fontSize: 14,
                            color: overtime.saldo >= 0 ? '#22c55e' : '#ef4444',
                          }}>
                            {fmtDecimal(overtime.saldo)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            Saldo (Soll: {overtime.soll_hours.toFixed(1)}h)
                          </div>
                        </div>
                      )}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtHours(totalMin)}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Total Netto</div>
                      </div>
                      <span style={{ color: 'var(--muted)', fontSize: 18 }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && sessions.length > 0 && (
                    <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Einstempeln</th>
                          <th>Ausstempeln</th>
                          <th>Pause</th>
                          <th>Netto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...sessions].sort((a, b) => {
                          const c = b.date.localeCompare(a.date)
                          return c !== 0 ? c : (b.clock_in ?? '').localeCompare(a.clock_in ?? '')
                        }).map(s => (
                          <tr key={s.id}>
                            <td className="secondary">{fmtDate(s.date)}</td>
                            <td>{fmtTime(s.clock_in)}</td>
                            <td style={!s.clock_out ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                              {fmtTime(s.clock_out)}
                            </td>
                            <td className="secondary">
                              {s.break_minutes > 0 ? `${s.break_minutes} min` : '—'}
                              {(s.auto_break_minutes ?? 0) > 0 && (
                                <span
                                  style={{ display: 'block', fontSize: 11, color: 'var(--warning, #b58105)' }}
                                  title="Automatischer Pausenabzug — vom Mitarbeitenden über einen Korrekturantrag widerlegbar"
                                >
                                  davon {s.auto_break_minutes} autom.
                                </span>
                              )}
                            </td>
                            <td className="primary">{fmtHours(s.total_minutes)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: 'var(--surface-2)' }}>
                          <td colSpan={4} style={{ fontWeight: 700 }}>Total</td>
                          <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{fmtHours(totalMin)}</td>
                        </tr>
                      </tbody>
                    </table>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </>
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

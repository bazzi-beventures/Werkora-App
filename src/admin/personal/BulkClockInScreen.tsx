import { useEffect, useMemo, useState } from 'react'
import {
  getAdminStaff, getClockStatus, bulkClockIn,
  StaffMember, BulkClockInStatus,
} from '../../api/admin'
import { isOfflineError } from '../../api/client'
import { ToastHost, useToast } from '../components/useToast'

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const STATUS_LABEL: Record<BulkClockInStatus, string> = {
  clocked_in: 'Eingestempelt',
  already: 'War schon eingestempelt',
  error: 'Fehler',
}

const STATUS_BADGE: Record<BulkClockInStatus, string> = {
  clocked_in: 'admin-badge-active',
  already: 'admin-badge-draft',
  error: 'admin-badge-admin',
}

export default function BulkClockInScreen() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [clockedIn, setClockedIn] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [time, setTime] = useState(nowHHMM())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<Record<string, BulkClockInStatus>>({})
  const { toast, showToast } = useToast()

  async function load() {
    setLoading(true)
    try {
      const [list, status] = await Promise.all([getAdminStaff(), getClockStatus()])
      setStaff(list.filter(s => s.is_active))
      setClockedIn(new Set(status.clocked_in_staff_ids))
    } catch (e) {
      showToast(isOfflineError(e) ? 'Keine Verbindung.' : 'Laden fehlgeschlagen.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Auswählbar = aktiv und noch nicht eingestempelt.
  const selectable = useMemo(
    () => staff.filter(s => !clockedIn.has(s.id)),
    [staff, clockedIn],
  )
  const allSelected = selectable.length > 0 && selectable.every(s => selected.has(s.id))

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(selectable.map(s => s.id)) : new Set())
  }

  async function handleSubmit() {
    if (selected.size === 0 || !time) return
    setSubmitting(true)
    try {
      const res = await bulkClockIn([...selected], time)
      const map: Record<string, BulkClockInStatus> = {}
      for (const r of res.results) map[r.staff_id] = r.status
      setResults(map)
      const parts = [`${res.clocked_in} eingestempelt`]
      if (res.already) parts.push(`${res.already} bereits eingestempelt`)
      if (res.errors) parts.push(`${res.errors} Fehler`)
      if (res.push_sent) parts.push(`${res.push_sent} Push gesendet`)
      showToast(parts.join(' · '), res.errors ? 'error' : 'success')
      setSelected(new Set())
      // Status neu laden, damit frisch Eingestempelte ausgegraut erscheinen.
      const status = await getClockStatus()
      setClockedIn(new Set(status.clocked_in_staff_ids))
    } catch (e) {
      showToast(isOfflineError(e) ? 'Keine Verbindung — bitte erneut versuchen.' : 'Einstempeln fehlgeschlagen.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Massen-Einstempeln</div>
          <div className="admin-page-subtitle">
            {selectable.length} verfügbar · {clockedIn.size} bereits eingestempelt
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div className="admin-form-group" style={{ margin: 0 }}>
            <label className="admin-form-label">Einstempel-Uhrzeit</label>
            <input
              className="admin-form-input"
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              disabled={submitting}
            />
          </div>
          <button
            className="admin-btn admin-btn-primary"
            onClick={handleSubmit}
            disabled={submitting || selected.size === 0 || !time}
          >
            {submitting ? 'Einstempeln…' : `Einstempeln (${selected.size})`}
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={e => toggleAll(e.target.checked)}
                    disabled={selectable.length === 0 || submitting}
                    title="Alle auswählen"
                  />
                </th>
                <th>Name</th>
                <th>Funktion</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={4} className="admin-table-empty">Keine aktiven Mitarbeiter.</td></tr>
              ) : staff.map(s => {
                const isClockedIn = clockedIn.has(s.id)
                const result = results[s.id]
                return (
                  <tr
                    key={s.id}
                    style={isClockedIn ? { opacity: 0.5 } : { cursor: 'pointer' }}
                    onClick={() => !isClockedIn && !submitting && toggle(s.id)}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        disabled={isClockedIn || submitting}
                      />
                    </td>
                    <td className="primary">{s.name}</td>
                    <td>{s.funktion || '—'}</td>
                    <td>
                      {isClockedIn && !result ? (
                        <span className="admin-badge admin-badge-active">Eingestempelt</span>
                      ) : result ? (
                        <span className={`admin-badge ${STATUS_BADGE[result]}`}>{STATUS_LABEL[result]}</span>
                      ) : (
                        <span className="admin-badge admin-badge-draft">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <ToastHost toast={toast} />
    </div>
  )
}

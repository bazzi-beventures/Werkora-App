import { useState } from 'react'
import { getOvertimeResetSettings, getWeeklyPlan, saveWeeklyPlan } from '../../../api/admin/hr'
import type { WeeklyPlanEntry } from '../../../api/admin/hr'
import { useTenantSetting } from '../useTenantSetting'
import { useToast, ToastHost } from '../../components/useToast'

function isoWeeksInYear(year: number): number {
  const jan1 = new Date(year, 0, 1).getDay()
  const dec31 = new Date(year, 11, 31).getDay()
  return (jan1 === 4 || dec31 === 4) ? 53 : 52
}

export function WeeklyPlanTab() {
  const { toast, showToast } = useToast()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [defaultHours, setDefaultHours] = useState<number>(40)

  const {
    value: entries, setValue: setEntries, loading, saving, dirty, persist,
  } = useTenantSetting<Map<number, WeeklyPlanEntry>>({
    load: async () => {
      const [plan, settings] = await Promise.all([
        getWeeklyPlan(year),
        getOvertimeResetSettings(),
      ])
      setDefaultHours(settings.soll_stunden_woche ?? 40)
      const map = new Map<number, WeeklyPlanEntry>()
      for (const e of plan) map.set(e.week_number, e)
      return map
    },
    save: async (map) => {
      await saveWeeklyPlan(year, Array.from(map.values()))
      return map
    },
    onToast: showToast,
    savedMsg: 'Wochenplan gespeichert',
    // Map serialisiert JSON zu {} — deshalb sortierte Einträge vergleichen.
    serialize: map => JSON.stringify(Array.from(map.entries()).sort(([a], [b]) => a - b)),
    reloadKey: year,
  })

  function setWeek(week: number, target_hours: number, note: string) {
    if (!entries) return
    const next = new Map(entries)
    next.set(week, { week_number: week, target_hours, note })
    setEntries(next)
  }

  function clearWeek(week: number) {
    if (!entries) return
    const next = new Map(entries)
    next.delete(week)
    setEntries(next)
  }

  function fillAll(hours: number) {
    if (!entries) return
    const next = new Map(entries)
    for (let w = 1; w <= weeksInYear; w++) {
      next.set(w, { week_number: w, target_hours: hours, note: next.get(w)?.note ?? '' })
    }
    setEntries(next)
  }

  const weeksInYear = isoWeeksInYear(year)

  return (
    <>
      <div className="admin-table-wrap" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="admin-form-group">
            <label className="admin-form-label">Jahr</label>
            <input
              type="number"
              className="admin-form-input"
              value={year}
              min={2020}
              max={2100}
              onChange={e => setYear(parseInt(e.target.value) || currentYear)}
              style={{ width: 120 }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: 'var(--muted)' }}>
            Standard (Tenant): <strong>{defaultHours} h/Woche</strong>. Einträge überschreiben den Standard für einzelne Kalenderwochen (z. B. Ferienwochen, Feiertagswochen).
          </div>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => fillAll(defaultHours)}
            disabled={loading || saving}
          >
            Alle KW mit {defaultHours}h füllen
          </button>
          <button
            className="admin-btn admin-btn-primary"
            onClick={persist}
            disabled={!dirty || saving || loading}
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>

      {loading || !entries ? (
        <div className="admin-loading"><div className="admin-spinner" /> Wochenplan wird geladen…</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table weekly-plan-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>KW</th>
                <th style={{ width: 160 }}>Soll-Stunden</th>
                <th>Notiz (optional)</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: weeksInYear }, (_, i) => i + 1).map(w => {
                const entry = entries.get(w)
                const effective = entry?.target_hours ?? defaultHours
                return (
                  <tr key={w}>
                    <td style={{ fontWeight: 600 }}>KW {w.toString().padStart(2, '0')}</td>
                    <td>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="80"
                        className="admin-form-input weekly-plan-hours"
                        value={entry?.target_hours ?? ''}
                        placeholder={`${defaultHours} (Standard)`}
                        onChange={e => {
                          const v = e.target.value
                          if (v === '') { clearWeek(w); return }
                          setWeek(w, parseFloat(v), entry?.note ?? '')
                        }}
                        style={{ color: entry ? undefined : 'var(--muted)' }}
                      />
                      <span className="weekly-plan-effective">= {effective}h</span>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="admin-form-input"
                        value={entry?.note ?? ''}
                        placeholder="z. B. Betriebsferien"
                        maxLength={100}
                        onChange={e => {
                          const v = e.target.value
                          if (!entry && !v) return
                          setWeek(w, entry?.target_hours ?? defaultHours, v)
                        }}
                      />
                    </td>
                    <td>
                      {entry && (
                        <button
                          className="admin-btn admin-btn-secondary"
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => clearWeek(w)}
                        >
                          Zurücksetzen
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

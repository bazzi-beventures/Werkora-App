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
  // Ein Eintrag IST die Abweichung — fehlt er, gilt die Mandanten-Vorgabe.
  const abweichend = entries?.size ?? 0

  return (
    <>
      {/* Der erklärende Satz stand früher zwischen Jahr-Feld und Knöpfen und
          drückte beide an den Rand, während er selbst zweizeilig umbrach. Er
          gehört unter die Bedienzeile: dort hat er die ganze Breite, und die
          Bedienelemente stehen beieinander. */}
      <div className="admin-table-wrap weekly-plan-toolbar">
        <div className="weekly-plan-toolbar-row">
          <div className="admin-form-group">
            <label className="admin-form-label">Jahr</label>
            <input
              type="number"
              className="admin-form-input weekly-plan-year"
              value={year}
              min={2020}
              max={2100}
              onChange={e => setYear(parseInt(e.target.value) || currentYear)}
            />
          </div>
          <div className="weekly-plan-toolbar-actions">
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
        <div className="admin-form-hint">
          Standard (Mandant): <strong>{defaultHours} h/Woche</strong>. Ein leeres Feld
          folgt dem Standard, ein eingetragenes überschreibt ihn — für Ferien- und
          Feiertagswochen.
          {!loading && entries && (
            <> Aktuell weichen <strong>{abweichend}</strong> von {weeksInYear} Wochen ab.</>
          )}
        </div>
      </div>

      {loading || !entries ? (
        <div className="admin-loading"><div className="admin-spinner" /> Wochenplan wird geladen…</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table weekly-plan-table">
            <thead>
              <tr>
                <th className="weekly-plan-col-kw">KW</th>
                <th className="weekly-plan-col-hours">Soll-Stunden</th>
                <th className="weekly-plan-col-note">Notiz (optional)</th>
                <th className="weekly-plan-col-reset"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: weeksInYear }, (_, i) => i + 1).map(w => {
                const entry = entries.get(w)
                const effective = entry?.target_hours ?? defaultHours
                return (
                  // Die abweichenden Wochen sind die interessanten — sie tragen
                  // die Akzentkante. Ohne sie sehen 52 Zeilen gleich aus, und man
                  // sucht die drei Ferienwochen mit dem Finger am Bildschirm.
                  <tr key={w} className={entry ? 'weekly-plan-row--abweichend' : undefined}>
                    <td className="weekly-plan-kw">KW {w.toString().padStart(2, '0')}</td>
                    <td>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="80"
                        className="admin-form-input weekly-plan-hours"
                        value={entry?.target_hours ?? ''}
                        // Nur die Zahl als Platzhalter: «40 (Standard)» wurde von
                        // der Spinner-Taste des Zahlenfelds abgeschnitten, und was
                        // sie bedeutet, sagt der Hinweis über der Tabelle.
                        placeholder={String(defaultHours)}
                        title={`Leer = Standard (${effective}h)`}
                        onChange={e => {
                          const v = e.target.value
                          if (v === '') { clearWeek(w); return }
                          setWeek(w, parseFloat(v), entry?.note ?? '')
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="admin-form-input weekly-plan-note"
                        value={entry?.note ?? ''}
                        // Der Beispieltext nur dort, wo eine Notiz etwas zu
                        // erklaeren hat: auf 53 Standardwochen wiederholt, las
                        // sich «z. B. Betriebsferien» wie Inhalt und uebertoente
                        // die drei Wochen, die wirklich eine Notiz tragen.
                        placeholder={entry ? 'z. B. Betriebsferien' : ''}
                        maxLength={100}
                        onChange={e => {
                          const v = e.target.value
                          if (!entry && !v) return
                          setWeek(w, entry?.target_hours ?? defaultHours, v)
                        }}
                      />
                    </td>
                    <td className="weekly-plan-col-reset">
                      {entry && (
                        <button
                          className="admin-btn admin-btn-secondary admin-btn-sm"
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

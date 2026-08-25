import { getOvertimeResetSettings, saveOvertimeResetSettings } from '../../../api/admin/hr'
import type { OvertimeSettings } from '../../../api/admin/hr'
import { useTenantSetting } from '../useTenantSetting'
import { useToast, ToastHost } from '../../components/useToast'

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

export function YearEndTab() {
  const { toast, showToast } = useToast()
  const {
    value: settings, setValue: setSettings, loading, saving, dirty, reload, persist,
  } = useTenantSetting<OvertimeSettings>({
    load: getOvertimeResetSettings,
    save: async (s) => {
      await saveOvertimeResetSettings(s)
      return s
    },
    onToast: showToast,
    savedMsg: 'Einstellungen gespeichert',
  })

  function update<K extends keyof OvertimeSettings>(key: K, value: OvertimeSettings[K]) {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
  }

  if (loading || !settings) {
    return <><div className="admin-loading"><div className="admin-spinner" /> Einstellungen werden geladen…</div><ToastHost toast={toast} /></>
  }

  const daysInMonth = new Date(new Date().getFullYear(), settings.overtime_reset_month, 0).getDate()

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Am konfigurierten Reset-Datum wird jeder Mitarbeiter-Saldo gemäss Policy gesaldet.
        Der Reset-Scheduler läuft täglich um 03:00 und prüft, ob heute das Reset-Datum ist.
        Vor dem Reset wird der bisherige Saldo in <code>overtime_yearly_cutoff</code> archiviert.
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <label className="admin-form-label">Standard-Wochensoll (h)</label>
          <input
            type="number"
            step="0.5"
            min="1"
            max="80"
            className="admin-form-input"
            value={settings.soll_stunden_woche}
            onChange={e => update('soll_stunden_woche', parseFloat(e.target.value) || 40)}
            style={{ width: 160 }}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Wird als Default für alle Wochen verwendet, sofern keine Ausnahme im Wochenplan hinterlegt ist.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="admin-form-label">Reset-Monat</label>
            <select
              className="admin-form-input"
              value={settings.overtime_reset_month}
              onChange={e => update('overtime_reset_month', parseInt(e.target.value))}
            >
              {MONTHS_DE.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="admin-form-label">Reset-Tag</label>
            <input
              type="number"
              min="1"
              max={daysInMonth}
              className="admin-form-input"
              value={settings.overtime_reset_day}
              onChange={e => update('overtime_reset_day', Math.min(daysInMonth, Math.max(1, parseInt(e.target.value) || 1)))}
            />
          </div>
        </div>

        <div>
          <label className="admin-form-label">Policy</label>
          <select
            className="admin-form-input"
            value={settings.overtime_reset_policy}
            onChange={e => update('overtime_reset_policy', e.target.value as OvertimeSettings['overtime_reset_policy'])}
          >
            <option value="full_reset">Voller Reset — Saldo wird auf 0 gesetzt</option>
            <option value="carry_all">Alles übertragen — Saldo bleibt unverändert</option>
            <option value="carry_max_hours">Maximal übertragen — bis zu X Stunden werden übernommen</option>
          </select>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16, marginTop: 4 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.6 }}>
            Ferienanspruch pro Mitarbeiter und Jahr. Ab der Altersgrenze gilt der erhöhte Anspruch automatisch.
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="admin-form-label">Standard-Ferientage / Jahr</label>
              <input
                type="number"
                min="0"
                max="60"
                className="admin-form-input"
                value={settings.vacation_default_days}
                onChange={e => update('vacation_default_days', parseInt(e.target.value) || 0)}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="admin-form-label">Ferientage ab Altersgrenze</label>
              <input
                type="number"
                min="0"
                max="60"
                className="admin-form-input"
                value={settings.vacation_50plus_days}
                onChange={e => update('vacation_50plus_days', parseInt(e.target.value) || 0)}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="admin-form-label">Altersgrenze (Jahre)</label>
              <input
                type="number"
                min="0"
                max="120"
                className="admin-form-input"
                value={settings.vacation_age_threshold}
                onChange={e => update('vacation_age_threshold', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>

        {settings.overtime_reset_policy === 'carry_max_hours' && (
          <div>
            <label className="admin-form-label">Max. Übertrag (h)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="500"
              className="admin-form-input"
              value={settings.overtime_carry_max_hours}
              onChange={e => update('overtime_carry_max_hours', parseFloat(e.target.value) || 0)}
              style={{ width: 160 }}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Gilt in beide Richtungen: Positive Übertragung max. +{settings.overtime_carry_max_hours}h, Minusstunden max. −{settings.overtime_carry_max_hours}h.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            className="admin-btn admin-btn-primary"
            onClick={persist}
            disabled={!dirty || saving}
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={reload}
            disabled={saving || !dirty}
          >
            Verwerfen
          </button>
        </div>
      </div>
    </div>
  )
}

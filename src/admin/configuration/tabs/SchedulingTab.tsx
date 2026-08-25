import { useState } from 'react'
import {
  getSchedulingConfig, updateSchedulingConfig, SchedulingConfig,
  SCHEDULING_VIEWS, SCHEDULING_KINDS, SCHEDULING_FIELDS,
} from '../../../api/admin'
import { useTenantSetting } from '../useTenantSetting'
import { useToast, ToastHost } from '../../components/useToast'

// ─── Einsatzplanung-Tab: Anzeige-Felder + Einsatz-Art-Farben pro Tenant ──────

// Mandanten-Config mit Defaults auffüllen, damit jedes Feld/jede Farbe gesetzt ist.
function withDefaults(cfg: Partial<SchedulingConfig>, def: SchedulingConfig): SchedulingConfig {
  return {
    fields: { ...def.fields, ...(cfg.fields || {}) },
    colors: { ...def.colors, ...(cfg.colors || {}) },
    views: { ...(def.views || {}), ...(cfg.views || {}) },
    show_distances: cfg.show_distances ?? def.show_distances ?? true,
    grey_after: cfg.grey_after ?? def.grey_after ?? '',
    grey_until: cfg.grey_until ?? def.grey_until ?? '',
    day_capacity_hours: cfg.day_capacity_hours ?? def.day_capacity_hours ?? 8,
  }
}

export function SchedulingTab() {
  const { toast, showToast } = useToast()
  const [defaults, setDefaults] = useState<SchedulingConfig | null>(null)

  const {
    value: config, setValue: setConfig, loading, saving, dirty, reload, persist,
  } = useTenantSetting<SchedulingConfig>({
    load: async () => {
      const res = await getSchedulingConfig()
      setDefaults(res.defaults)
      return withDefaults(res.config || {}, res.defaults)
    },
    save: async (cfg) => {
      const res = await updateSchedulingConfig(cfg)
      return defaults ? withDefaults(res.config, defaults) : cfg
    },
    onToast: showToast,
    savedMsg: 'Einsatzplanung gespeichert',
  })

  if (loading || !config || !defaults) {
    return <><div className="admin-loading"><div className="admin-spinner" /> Einstellungen werden geladen…</div><ToastHost toast={toast} /></>
  }

  // 'bis' muss nach 'von' liegen (HH:MM-Strings sind lexikografisch vergleichbar).
  const rangeInvalid = !!config.grey_after && !!config.grey_until && config.grey_until <= config.grey_after
  // Fehlender Key = Ansicht an (Default) — deshalb explizit auf false prüfen.
  const allViewsOff = SCHEDULING_VIEWS.every(v => config.views?.[v.key] === false)
  // Gleiche Grenzen wie serverseitig (db/tenants.py) — ein Speichern ausserhalb
  // würde ohnehin mit 400 zurückkommen.
  const capacity = config.day_capacity_hours ?? 8
  const capacityInvalid = !Number.isFinite(capacity) || capacity < 1 || capacity > 24

  function setField(key: string, value: boolean) {
    setConfig(prev => prev && { ...prev, fields: { ...prev.fields, [key]: value } })
  }

  function setView(key: string, value: boolean) {
    setConfig(prev => prev && { ...prev, views: { ...prev.views, [key]: value } })
  }

  function setColor(key: string, value: string) {
    setConfig(prev => prev && { ...prev, colors: { ...prev.colors, [key]: value } })
  }

  function setGreyAfter(value: string) {
    // Ohne Start ('von') ergibt ein Ende ('bis') keinen Sinn — mit leeren.
    setConfig(prev => prev && { ...prev, grey_after: value, grey_until: value ? prev.grey_until : '' })
  }

  function setGreyUntil(value: string) {
    setConfig(prev => prev && { ...prev, grey_until: value })
  }

  function resetToDefault() {
    if (defaults) setConfig(withDefaults({}, defaults))
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 640 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Steuert, was auf den Einsatz-Kacheln im Planungs-Kalender erscheint und welche
        Farbe jede Einsatz-Art bekommt. Uhrzeit und Titel werden immer angezeigt.
      </div>

      <div style={{ fontWeight: 600, marginBottom: 6 }}>Verfügbare Ansichten</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 10 }}>
        Welche Kalender-Ansichten in der Einsatzplanung zur Auswahl stehen.
        Die Plantafel zeigt jeden Monteur als eigene Zeile über die Woche, der
        Tagesplan zusätzlich mit Uhrzeit-Achse und Auslastungsgrad je Mitarbeiter.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: allViewsOff ? 6 : 24 }}>
        {SCHEDULING_VIEWS.map(v => (
          <label key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.views?.[v.key] !== false}
              onChange={e => setView(v.key, e.target.checked)}
            />
            {v.label}
          </label>
        ))}
      </div>
      {allViewsOff && (
        <div style={{ fontSize: 13, color: 'var(--danger, #c0392b)', marginBottom: 24 }}>
          Mindestens eine Ansicht muss aktiviert sein.
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 24 }}>
        <input
          type="checkbox"
          checked={config.show_distances !== false}
          onChange={e => setConfig(prev => prev && { ...prev, show_distances: e.target.checked })}
        />
        Fahrdistanzen zwischen Einsätzen anzeigen (Plantafel und Tagesplan)
      </label>

      <div style={{ fontWeight: 600, marginBottom: 6 }}>Tages-Kapazität</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 10 }}>
        Planbare Einsatzstunden pro Mitarbeiter und Werktag. Bezugsgrösse für den
        Auslastungsgrad im Tagesplan – 8&nbsp;h und 4&nbsp;h geplant ergeben 50&nbsp;%.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <input
          type="number"
          className="admin-input"
          min={1}
          max={24}
          step={0.5}
          value={config.day_capacity_hours ?? 8}
          onChange={e => setConfig(prev => {
            if (!prev) return prev
            const n = parseFloat(e.target.value)
            return { ...prev, day_capacity_hours: Number.isFinite(n) ? n : prev.day_capacity_hours }
          })}
          style={{ width: 120 }}
          aria-label="Tages-Kapazität in Stunden"
        />
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Stunden pro Werktag</span>
      </div>
      {capacityInvalid && (
        <div style={{ fontSize: 13, color: 'var(--danger, #c0392b)', marginTop: -14, marginBottom: 24 }}>
          Tages-Kapazität muss zwischen 1 und 24 Stunden liegen.
        </div>
      )}

      <div style={{ fontWeight: 600, marginBottom: 6 }}>Zusätzliche Felder auf der Kachel</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 10 }}>
        Im Tagesplan ist auf dem Balken nur Platz für eine Zusatzzeile: dort zeigt
        «Adresse (Objekt)» die Ortschaft. Die vollen Angaben stehen in der
        Info-Karte beim Überfahren mit der Maus.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {SCHEDULING_FIELDS.map(f => (
          <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!config.fields[f.key]}
              onChange={e => setField(f.key, e.target.checked)}
            />
            {f.label}
          </label>
        ))}
      </div>

      <div style={{ fontWeight: 600, marginBottom: 10 }}>Farbe je Einsatz-Art</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {SCHEDULING_KINDS.map(k => (
          <label key={k.key} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
            <input
              type="color"
              value={config.colors[k.key] || '#000000'}
              onChange={e => setColor(k.key, e.target.value)}
              style={{ width: 44, height: 30, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
            />
            <span style={{ width: 140 }}>{k.label}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{config.colors[k.key]}</span>
          </label>
        ))}
      </div>

      <div style={{ fontWeight: 600, marginBottom: 6 }}>Nicht-Arbeitszeit ausgrauen</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 10 }}>
        Blendet ein Zeitfenster an Werktagen (Mo–Fr) im Wochen-Kalender grau ein –
        z.&nbsp;B. die Mittagspause 12:00–13:00 oder einen Halbtag ab Mittag. Rein optisch,
        Einsätze lassen sich dort weiterhin planen. „Bis" leer&nbsp;= bis Feierabend.
        „Von" leer&nbsp;= aus.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: rangeInvalid ? 6 : 24, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>von</span>
        <input
          type="time"
          className="admin-input"
          value={config.grey_after || ''}
          onChange={e => setGreyAfter(e.target.value)}
          style={{ width: 120 }}
          aria-label="Ausgrauen von Uhrzeit"
        />
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>bis</span>
        <input
          type="time"
          className="admin-input"
          value={config.grey_until || ''}
          onChange={e => setGreyUntil(e.target.value)}
          style={{ width: 120 }}
          aria-label="Ausgrauen bis Uhrzeit"
          disabled={!config.grey_after}
        />
        {config.grey_after && (
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => setGreyAfter('')}
          >
            Aus
          </button>
        )}
      </div>
      {rangeInvalid && (
        <div style={{ fontSize: 13, color: 'var(--danger, #c0392b)', marginBottom: 24 }}>
          „Bis" muss nach „von" liegen.
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          className="admin-btn admin-btn-primary"
          onClick={persist}
          disabled={!dirty || saving || rangeInvalid || allViewsOff || capacityInvalid}
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
        <button
          className="admin-btn admin-btn-secondary"
          onClick={resetToDefault}
          disabled={saving}
          style={{ marginLeft: 'auto' }}
        >
          Auf System-Standard zurücksetzen
        </button>
      </div>
    </div>
  )
}

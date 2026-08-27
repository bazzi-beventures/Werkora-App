import { useEffect, useState } from 'react'
import {
  getTenantFeatures, updateTenantFeature,
  TenantFeaturesResponse, FeatureRegistryEntry, FeatureFieldSchema,
} from '../../../api/admin'
import { useToast, ToastHost } from '../../components/useToast'

// ─── Workflows-Tab: konfigurierbare Feature-Flags pro Tenant ─────────────────
//
// Bewusst NICHT auf useTenantSetting umgestellt: hier wird nicht ein Wert als
// Ganzes gespeichert, sondern jeder Registry-Eintrag einzeln (savingKey).

export function WorkflowsTab() {
  const { toast, showToast } = useToast()
  const [data, setData] = useState<TenantFeaturesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<Record<string, Record<string, unknown>>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    try {
      const result = await getTenantFeatures()
      setData(result)
      setDraft({ ...result.effective })
    } catch {
      showToast('Laden fehlgeschlagen', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading || !data) {
    return <><div className="admin-loading"><div className="admin-spinner" /> Workflows werden geladen…</div><ToastHost toast={toast} /></>
  }

  function setField(featureKey: string, fieldKey: string, value: unknown) {
    setDraft(prev => ({
      ...prev,
      [featureKey]: { ...(prev[featureKey] ?? {}), [fieldKey]: value },
    }))
  }

  function isDirty(featureKey: string): boolean {
    const eff = data?.effective[featureKey] ?? {}
    const d = draft[featureKey] ?? {}
    const keys = new Set([...Object.keys(eff), ...Object.keys(d)])
    for (const k of keys) {
      if (JSON.stringify(eff[k]) !== JSON.stringify(d[k])) return true
    }
    return false
  }

  async function save(entry: FeatureRegistryEntry) {
    const value = draft[entry.key]
    setSavingKey(entry.key)
    try {
      const res = await updateTenantFeature(entry.key, value)
      setData(prev => prev ? {
        ...prev,
        overrides: { ...prev.overrides, [entry.key]: value },
        effective: { ...prev.effective, [entry.key]: res.effective },
      } : prev)
      setDraft(prev => ({ ...prev, [entry.key]: res.effective }))
      showToast(`${entry.label} gespeichert`, 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Speichern fehlgeschlagen'
      showToast(msg, 'error')
    } finally {
      setSavingKey(null)
    }
  }

  function reset(featureKey: string) {
    setDraft(prev => ({ ...prev, [featureKey]: { ...(data?.effective[featureKey] ?? {}) } }))
  }

  function toggleOpen(featureKey: string) {
    setOpenKeys(prev => {
      const next = new Set(prev)
      if (next.has(featureKey)) next.delete(featureKey)
      else next.add(featureKey)
      return next
    })
  }

  // gruppiere Einträge nach category in der Reihenfolge data.categories
  const byCategory = new Map<string, FeatureRegistryEntry[]>()
  for (const cat of data.categories) byCategory.set(cat, [])
  for (const entry of data.registry) {
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, [])
    byCategory.get(entry.category)!.push(entry)
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 880 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Konfigurierbare Workflow-Bausteine pro Mandant. Module sind binär (an/aus) — Workflows
        haben zusätzlich Parameter (z. B. Pauschalbeträge, Erfassungs-Scope).
        Zeile anklicken für Beschreibung und Parameter; jeder Eintrag wird einzeln gespeichert.
      </div>

      {Array.from(byCategory.entries()).map(([cat, entries]) => {
        if (entries.length === 0) return null
        // "x von y aktiv" zählt nur Einträge mit Aktiv-Schalter — reine
        // Parameter-Einträge (z. B. Review-Fenster) sind weder an noch aus.
        const withToggle = entries.filter(e => e.schema.some(f => f.key === 'enabled'))
        const activeCount = withToggle.filter(e => !!(draft[e.key] ?? {}).enabled).length
        return (
          <div key={cat} style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
              textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8,
              display: 'flex', alignItems: 'baseline', gap: 8,
            }}>
              <span>{cat}</span>
              {withToggle.length > 0 && (
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  {activeCount} von {withToggle.length} aktiv
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {entries.map(entry => {
                const current = draft[entry.key] ?? {}
                // Nicht jedes Feature hat einen Aktiv-Schalter (z. B. aftersales_review_days
                // ist ein reiner Parameter). Nur wenn ein enabled-Feld existiert, dürfen die
                // übrigen Felder dahinter gesperrt werden — sonst blieben sie dauerhaft grau.
                const hasEnabledToggle = entry.schema.some(f => f.key === 'enabled')
                const enabled = !!current.enabled
                const dirty = isDirty(entry.key)
                const isOpen = openKeys.has(entry.key)
                return (
                  <div
                    key={entry.key}
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: enabled ? 'rgba(34,197,94,0.06)' : 'transparent',
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleOpen(entry.key)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(entry.key) } }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', cursor: 'pointer', userSelect: 'none',
                      }}
                    >
                      {hasEnabledToggle && (
                        <input
                          type="checkbox"
                          checked={enabled}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            // Schalter in der Zeile ändert nur den Entwurf — Zeile aufklappen,
                            // damit der Speichern-Knopf sichtbar ist und nichts "still" wirkt.
                            setField(entry.key, 'enabled', e.target.checked)
                            setOpenKeys(prev => new Set(prev).add(entry.key))
                          }}
                        />
                      )}
                      <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0 }}>
                        {entry.label}{' '}
                        <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)' }}>
                          ({entry.key})
                        </span>
                      </span>
                      {dirty && (
                        <span style={{ fontSize: 11, color: 'var(--warning, #d97706)', flexShrink: 0 }}>
                          ungespeichert
                        </span>
                      )}
                      <span aria-hidden style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>
                        {isOpen ? '▾' : '▸'}
                      </span>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '12px 12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>
                          {entry.description}
                        </div>

                        <div style={{ display: 'grid', gap: 12 }}>
                          {/* Der Aktiv-Schalter sitzt bereits in der Kopfzeile. */}
                          {entry.schema.filter(f => f.key !== 'enabled').map(field => (
                            <FeatureField
                              key={field.key}
                              field={field}
                              value={current[field.key]}
                              onChange={v => setField(entry.key, field.key, v)}
                              disabled={hasEnabledToggle && !enabled}
                            />
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button
                            className="admin-btn admin-btn-primary"
                            onClick={() => save(entry)}
                            disabled={!dirty || savingKey === entry.key}
                            style={{ fontSize: 12 }}
                          >
                            {savingKey === entry.key ? 'Speichern…' : 'Speichern'}
                          </button>
                          <button
                            className="admin-btn admin-btn-secondary"
                            onClick={() => reset(entry.key)}
                            disabled={!dirty || savingKey === entry.key}
                            style={{ fontSize: 12 }}
                          >
                            Verwerfen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <ToastHost toast={toast} />
    </div>
  )
}

function FeatureField({
  field, value, onChange, disabled,
}: {
  field: FeatureFieldSchema
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
}) {
  if (field.type === 'bool') {
    // Unter-Schalter eines Features (der 'enabled'-Schalter selbst sitzt in der
    // Kopfzeile): bei ausgeschaltetem Feature ausgegraut wie die anderen Feldtypen.
    return (
      <div style={{ opacity: disabled ? 0.5 : 1 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={!!value}
            disabled={disabled}
            onChange={e => onChange(e.target.checked)}
          />
          <span>{field.label}</span>
        </label>
        {field.help && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{field.help}</div>}
      </div>
    )
  }
  if (field.type === 'number') {
    return (
      <div style={{ opacity: disabled ? 0.5 : 1 }}>
        <label className="admin-form-label">{field.label}</label>
        <input
          type="number"
          className="admin-form-input"
          value={typeof value === 'number' ? value : ''}
          min={field.min}
          max={field.max}
          step={field.step}
          disabled={disabled}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={{ width: 160 }}
        />
        {field.help && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{field.help}</div>}
      </div>
    )
  }
  if (field.type === 'text') {
    // Einzeiliger Freitext (z.B. die Beschriftung einer automatisch ergänzten
    // Belegposition). Breiter als die Zahlenfelder: hier steht ein Satzfragment,
    // das auf einem Kundendokument landet, und es soll ganz lesbar sein.
    return (
      <div style={{ opacity: disabled ? 0.5 : 1 }}>
        <label className="admin-form-label">{field.label}</label>
        <input
          type="text"
          className="admin-form-input"
          value={typeof value === 'string' ? value : ''}
          maxLength={field.max_length}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          style={{ width: '100%', maxWidth: 360 }}
        />
        {field.help && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{field.help}</div>}
      </div>
    )
  }
  if (field.type === 'select') {
    return (
      <div style={{ opacity: disabled ? 0.5 : 1 }}>
        <label className="admin-form-label">{field.label}</label>
        <select
          className="admin-form-input"
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
        >
          {(field.options ?? []).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {field.help && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{field.help}</div>}
      </div>
    )
  }
  if (field.type === 'key_list') {
    // Mehrfachauswahl über feste Schlüssel (z.B. Beschaffungs-Arbeitsschritte).
    // Bewusst Checkboxen statt <select multiple>: die Liste ist kurz, und man will alle
    // Optionen gleichzeitig sehen. Die Reihenfolge kommt aus dem Server-Schema und ist
    // nicht änderbar — sie ist chronologisch, nicht Geschmackssache.
    const arr = Array.isArray(value) ? (value as string[]) : []
    return (
      <div style={{ opacity: disabled ? 0.5 : 1 }}>
        <label className="admin-form-label">{field.label}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(field.options ?? []).map(o => (
            <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={arr.includes(o.value)}
                disabled={disabled}
                onChange={e => {
                  const next = e.target.checked
                    ? [...arr, o.value]
                    : arr.filter(v => v !== o.value)
                  // In Schema-Reihenfolge zurückschreiben, damit der gespeicherte Wert
                  // nicht von der Klickreihenfolge abhängt.
                  const order = (field.options ?? []).map(x => x.value)
                  onChange(order.filter(v => next.includes(v)))
                }}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        {field.help && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{field.help}</div>}
      </div>
    )
  }
  if (field.type === 'number_list') {
    const arr = Array.isArray(value) ? (value as number[]) : []
    return (
      <div style={{ opacity: disabled ? 0.5 : 1 }}>
        <label className="admin-form-label">{field.label}</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {arr.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="number"
                className="admin-form-input"
                value={n}
                min={field.min}
                max={field.max}
                disabled={disabled}
                onChange={e => {
                  const next = [...arr]
                  next[i] = parseFloat(e.target.value) || 0
                  onChange(next)
                }}
                style={{ width: 90 }}
              />
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={disabled}
                onClick={() => onChange(arr.filter((_, j) => j !== i))}
                style={{ fontSize: 11, padding: '2px 6px' }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            disabled={disabled}
            onClick={() => onChange([...arr, field.min ?? 0])}
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            + Wert
          </button>
        </div>
        {field.help && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{field.help}</div>}
      </div>
    )
  }
  return null
}

import { useEffect, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { listAllMaterials } from '../../api/admin/materials'
import { deletePricingRule, listPricingRules, savePricingRule } from '../../api/admin/pricingRules'
import type { PricingRule } from '../../api/admin/pricingRules'
import { listSuppliers } from '../../api/admin/suppliers'
import type { Supplier } from '../../api/admin/suppliers'
import { ToastHost, useToast } from '../components/useToast'

interface EditState {
  supplier_name: string
  category: string
  markup_pct: string
}

export default function PricingRulesScreen() {
  const [rules, setRules] = useState<PricingRule[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<PricingRule | 'new' | null>(null)
  const [form, setForm] = useState<EditState>({ supplier_name: '', category: '', markup_pct: '' })
  const [customCategory, setCustomCategory] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { toast, showToast } = useToast()

  async function load() {
    setLoading(true)
    try {
      const [rulesData, suppliersData, materialsData] = await Promise.all([
        listPricingRules(),
        listSuppliers(),
        listAllMaterials(),
      ])
      setRules(rulesData)
      setSuppliers(suppliersData)
      setCategories(
        Array.from(new Set(materialsData.map(m => m.category).filter(Boolean))).sort() as string[]
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setForm({ supplier_name: '', category: '', markup_pct: '' })
    setCustomCategory(false)
    setEditing('new')
    setError('')
  }

  function openEdit(r: PricingRule) {
    const cat = r.category ?? ''
    setForm({
      supplier_name: r.suppliers?.name ?? '',
      category: cat,
      markup_pct: r.markup_pct.toString(),
    })
    setCustomCategory(!!cat && !categories.includes(cat))
    setEditing(r)
    setError('')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.supplier_name.trim() || !form.markup_pct) return
    setSaving(true)
    setError('')
    try {
      const isEdit = editing !== 'new' && editing !== null
      await savePricingRule({
        supplier_name: form.supplier_name.trim(),
        category: form.category.trim() || null,
        markup_pct: parseFloat(form.markup_pct),
      }, isEdit ? (editing as PricingRule).id : undefined)
      setEditing(null)
      showToast('Preisregel gespeichert')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (editing === 'new' || editing === null) return
    const rule = editing
    const label = rule.suppliers?.name
      ? `${rule.suppliers.name}${rule.category ? ` · ${rule.category}` : ''}`
      : 'diese Preisregel'
    if (!window.confirm(`Preisregel für ${label} wirklich löschen?`)) return
    setSaving(true)
    setError('')
    try {
      await deletePricingRule(rule.id)
      setEditing(null)
      showToast('Preisregel gelöscht')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  // VK = EK × (1 + markup_pct / 100)
  const pctNum = parseFloat(form.markup_pct)
  const previewFactor = isNaN(pctNum) ? null : (1 + pctNum / 100).toFixed(3)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Lieferantenpreise</div>
          <div className="admin-page-subtitle">Aufschläge auf Einkaufspreise (VK = EK × (1 + Aufschlag%))</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openNew}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
          Neue Regel
        </button>
      </div>

      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Lieferant</th>
                <th>Kategorie</th>
                <th>Aufschlag %</th>
                <th>Faktor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr><td colSpan={5} className="admin-table-empty">Keine Preisregeln definiert.</td></tr>
              ) : rules.map(r => (
                <tr key={r.id} onClick={() => openEdit(r)} style={{ cursor: 'pointer' }}>
                  <td><strong>{r.suppliers?.name ?? '—'}</strong></td>
                  <td style={{ color: 'var(--muted)' }}>{r.category || 'Alle Kategorien'}</td>
                  <td style={{ fontWeight: 700 }}>{r.markup_pct.toFixed(1)} %</td>
                  <td style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    × {(1 + r.markup_pct / 100).toFixed(3)}
                  </td>
                  <td>
                    <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={e => { e.stopPropagation(); openEdit(r) }}>
                      Bearbeiten
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit/New Modal */}
      {editing !== null && (
        <div className="admin-modal-overlay" {...backdropCloseProps(() => setEditing(null))}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">{editing === 'new' ? 'Neue Preisregel' : `${form.supplier_name} bearbeiten`}</div>
              <button className="admin-modal-close" onClick={() => setEditing(null)}>×</button>
            </div>
            <form onSubmit={handleSave} className="admin-modal-body">
              {error && <div className="admin-form-error">{error}</div>}
              <div className="admin-form-group">
                <label className="admin-form-label">Lieferant *</label>
                <select
                  className="admin-form-input"
                  value={form.supplier_name}
                  onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                  required
                >
                  <option value="">— Lieferant wählen —</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Kategorie (leer = alle)</label>
                {customCategory ? (
                  <input
                    className="admin-form-input"
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="Neue Kategorie…"
                    autoFocus
                  />
                ) : (
                  <select
                    className="admin-form-input"
                    value={form.category}
                    onChange={e => {
                      if (e.target.value === '__new__') {
                        setCustomCategory(true)
                        setForm(f => ({ ...f, category: '' }))
                      } else {
                        setForm(f => ({ ...f, category: e.target.value }))
                      }
                    }}
                  >
                    <option value="">— Alle Kategorien —</option>
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__new__">+ Neue Kategorie…</option>
                  </select>
                )}
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Aufschlag % *</label>
                <input
                  className="admin-form-input"
                  type="number"
                  step="0.1"
                  min="0"
                  max="300"
                  value={form.markup_pct}
                  onChange={e => setForm(f => ({ ...f, markup_pct: e.target.value }))}
                  required
                  placeholder="z.B. 25"
                />
                {previewFactor && (
                  <div className="admin-form-hint">
                    Faktor: × {previewFactor} — EK CHF 100 → VK CHF {(100 * (1 + pctNum / 100)).toFixed(2)}
                  </div>
                )}
              </div>
            </form>
            <div className="admin-modal-footer">
              {editing !== 'new' && (
                <button
                  className="admin-btn admin-btn-danger"
                  onClick={handleDelete}
                  disabled={saving}
                  style={{ marginRight: 'auto' }}
                >
                  Löschen
                </button>
              )}
              <button className="admin-btn admin-btn-secondary" onClick={() => setEditing(null)}>Abbrechen</button>
              <button className="admin-btn admin-btn-primary" onClick={e => { (e.currentTarget.closest('div.admin-modal')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }} disabled={saving}>
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

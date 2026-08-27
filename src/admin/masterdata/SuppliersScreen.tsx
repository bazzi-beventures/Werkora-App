import { useEffect, useRef, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import {
  deleteSupplier, listSuppliers, lookupSuppliers, saveSupplier,
} from '../../api/admin/suppliers'
import type { Supplier, SupplierLookupHit } from '../../api/admin/suppliers'
import { AdminCardList } from '../components/AdminCardList'
import { useIsMobile } from '../useIsMobile'
import { useToast, ToastHost } from '../components/useToast'

const EMPTY_FORM = {
  name: '',
  prefix: '',
  contact_person: '',
  phone: '',
  email: '',
  website: '',
  street: '',
  zip: '',
  city: '',
  notes: '',
}

export default function SuppliersScreen() {
  const isMobile = useIsMobile()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { toast, showToast } = useToast()

  const [lookupHits, setLookupHits] = useState<SupplierLookupHit[]>([])
  const [lookupOpen, setLookupOpen] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const lookupTimer = useRef<number | null>(null)

  async function load() {
    setLoading(true)
    try {
      setSuppliers(await listSuppliers())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setLookupHits([])
    setLookupOpen(false)
    setError('')
    setShowForm(true)
  }

  function openEdit(s: Supplier) {
    setEditingId(s.id)
    setForm({
      name: s.name,
      prefix: s.prefix,
      contact_person: s.contact_person ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      website: s.website ?? '',
      street: s.street ?? '',
      zip: s.zip ?? '',
      city: s.city ?? '',
      notes: s.notes ?? '',
    })
    setLookupHits([])
    setLookupOpen(false)
    setError('')
    setShowForm(true)
  }

  function updateField<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function onNameChange(value: string) {
    updateField('name', value)
    if (editingId) return
    const q = value.trim()
    if (lookupTimer.current) window.clearTimeout(lookupTimer.current)
    if (q.length < 3) {
      setLookupHits([])
      setLookupOpen(false)
      return
    }
    lookupTimer.current = window.setTimeout(() => runLookup(q), 300)
  }

  async function runLookup(q: string) {
    setLookupLoading(true)
    try {
      const hits = await lookupSuppliers(q)
      setLookupHits(hits)
      setLookupOpen(hits.length > 0)
    } catch {
      setLookupHits([])
      setLookupOpen(false)
    } finally {
      setLookupLoading(false)
    }
  }

  function applyHit(hit: SupplierLookupHit) {
    setForm(prev => ({
      ...prev,
      name: hit.name || prev.name,
      prefix: prev.prefix || hit.name.slice(0, 3).toUpperCase(),
      phone: hit.phone || prev.phone,
      email: hit.email || prev.email,
      website: hit.website || prev.website,
      street: hit.street || prev.street,
      zip: hit.zip || prev.zip,
      city: hit.city || prev.city,
    }))
    setLookupOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || form.prefix.trim().length !== 3) {
      setError('Name Pflichtfeld; Prefix muss genau 3 Zeichen sein (z.B. GRI)')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveSupplier({
        name: form.name.trim(),
        prefix: form.prefix.trim().toUpperCase(),
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        street: form.street.trim() || null,
        zip: form.zip.trim() || null,
        city: form.city.trim() || null,
        notes: form.notes.trim() || null,
      }, editingId || undefined)
      setShowForm(false)
      showToast(editingId ? 'Lieferant aktualisiert' : 'Lieferant erstellt')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: Supplier) {
    if (!confirm(`Lieferant "${s.name}" wirklich löschen? Zugehörige Preisregeln werden ebenfalls gelöscht.`)) return
    try {
      await deleteSupplier(s.id)
      showToast('Lieferant gelöscht')
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Löschen')
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Lieferanten</div>
          <div className="admin-page-subtitle">Lieferantenstamm für Preisregeln und Artikelnummern</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openForm}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
          Neuer Lieferant
        </button>
      </div>

      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          <AdminCardList
            items={suppliers}
            keyFor={s => String(s.id)}
            onItemClick={s => openEdit(s)}
            empty="Keine Lieferanten vorhanden."
            renderCard={s => (
              <>
                <div className="admin-card-head">
                  <span className="admin-card-title">{s.name}</span>
                  <span className="admin-card-meta" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.prefix}</span>
                </div>
                {(s.city || s.phone) && (
                  <div className="admin-card-meta">{[s.city, s.phone].filter(Boolean).join(' · ')}</div>
                )}
                <div className="admin-card-actions">
                  <button
                    className="admin-btn admin-btn-danger admin-btn-sm"
                    onClick={e => { e.stopPropagation(); handleDelete(s) }}
                  >
                    Löschen
                  </button>
                </div>
              </>
            )}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Ort</th>
                <th>Telefon</th>
                <th>Artikelnummer-Beispiel</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr><td colSpan={6} className="admin-table-empty">Keine Lieferanten vorhanden.</td></tr>
              ) : suppliers.map(s => (
                <tr key={s.id} onClick={() => openEdit(s)} style={{ cursor: 'pointer' }}>
                  <td><strong>{s.name}</strong></td>
                  <td><code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>{s.prefix}</code></td>
                  <td style={{ color: 'var(--muted)' }}>{s.city || '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{s.phone || '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{s.prefix}-0001</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="admin-btn admin-btn-danger admin-btn-sm"
                      onClick={(e) => { e.stopPropagation(); handleDelete(s) }}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="admin-modal-overlay" {...backdropCloseProps(() => setShowForm(false))}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">{editingId ? 'Lieferant bearbeiten' : 'Neuer Lieferant'}</div>
              <button className="admin-modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="admin-modal-body">
              {error && <div className="admin-form-error">{error}</div>}

              <div className="admin-form-group" style={{ position: 'relative' }}>
                <label className="admin-form-label">Name *</label>
                <input
                  className="admin-form-input"
                  value={form.name}
                  onChange={e => onNameChange(e.target.value)}
                  onFocus={() => { if (lookupHits.length > 0) setLookupOpen(true) }}
                  onBlur={() => { setTimeout(() => setLookupOpen(false), 150) }}
                  placeholder="z.B. Griesser"
                  required
                  autoFocus
                  autoComplete="off"
                />
                {!editingId && (
                  <div className="admin-form-hint">
                    {lookupLoading ? 'Suche in tel.search.ch…' : 'Firmenname eingeben — Adresse wird automatisch vorgeschlagen.'}
                  </div>
                )}
                {lookupOpen && lookupHits.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--surface, #fff)',
                    border: '1px solid var(--border, #ddd)',
                    borderRadius: 'var(--radius-xs)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    maxHeight: 260,
                    overflowY: 'auto',
                    zIndex: 10,
                    marginTop: 4,
                  }}>
                    {lookupHits.map((hit, i) => (
                      <button
                        type="button"
                        key={i}
                        onMouseDown={(e) => { e.preventDefault(); applyHit(hit) }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: i < lookupHits.length - 1 ? '1px solid var(--border, #eee)' : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{hit.name}</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                          {[hit.street, [hit.zip, hit.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                          {hit.phone && <> · {hit.phone}</>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Prefix * (3 Zeichen)</label>
                <input
                  className="admin-form-input"
                  value={form.prefix}
                  onChange={e => updateField('prefix', e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="z.B. GRI"
                  maxLength={3}
                  required
                />
                <div className="admin-form-hint">Wird für Artikelnummern verwendet: {form.prefix || 'XXX'}-0001</div>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Ansprechperson</label>
                <input
                  className="admin-form-input"
                  value={form.contact_person}
                  onChange={e => updateField('contact_person', e.target.value)}
                  placeholder="z.B. Hans Muster"
                />
              </div>

              <div className="admin-form-row">
                <div className="admin-form-group">
                  <label className="admin-form-label">Telefon</label>
                  <input
                    className="admin-form-input"
                    value={form.phone}
                    onChange={e => updateField('phone', e.target.value)}
                    placeholder="+41 …"
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">E-Mail</label>
                  <input
                    type="email"
                    className="admin-form-input"
                    value={form.email}
                    onChange={e => updateField('email', e.target.value)}
                    placeholder="bestellung@…"
                  />
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Website</label>
                <input
                  className="admin-form-input"
                  value={form.website}
                  onChange={e => updateField('website', e.target.value)}
                  placeholder="https://…"
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Strasse</label>
                <input
                  className="admin-form-input"
                  value={form.street}
                  onChange={e => updateField('street', e.target.value)}
                  placeholder="Strasse und Hausnummer"
                />
              </div>

              <div className="admin-form-row admin-form-row-label">
                <div className="admin-form-group">
                  <label className="admin-form-label">PLZ</label>
                  <input
                    className="admin-form-input"
                    value={form.zip}
                    onChange={e => updateField('zip', e.target.value)}
                    placeholder="8000"
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Ort</label>
                  <input
                    className="admin-form-input"
                    value={form.city}
                    onChange={e => updateField('city', e.target.value)}
                    placeholder="Zürich"
                  />
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Notizen</label>
                <textarea
                  className="admin-form-input"
                  value={form.notes}
                  onChange={e => updateField('notes', e.target.value)}
                  rows={3}
                  placeholder="Interne Bemerkungen…"
                />
              </div>
            </form>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-secondary" onClick={() => setShowForm(false)}>Abbrechen</button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={e => { (e.currentTarget.closest('div.admin-modal')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }}
                disabled={saving}
              >
                {saving ? (editingId ? 'Speichern…' : 'Erstellen…') : (editingId ? 'Speichern' : 'Erstellen')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

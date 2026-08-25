import { useCallback, useEffect, useMemo, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { adjustStock } from '../../api/admin/inventory'
import {
  deleteMaterialImage, getMaterialsMeta, listMaterials, saveMaterial, uploadMaterialImage,
} from '../../api/admin/materials'
import type {
  Material, MaterialSortKey, MaterialsListResponse,
} from '../../api/admin/materials'
import { listSuppliers } from '../../api/admin/suppliers'
import type { Supplier } from '../../api/admin/suppliers'
import { createUnit } from '../../api/admin/units'
import FrequentMaterialsPanel from './FrequentMaterialsPanel'
import MaterialVkBulkPanel from './MaterialVkBulkPanel'
import ImportScreen from '../system/ImportScreen'
import { UserInfo } from '../../api/auth'
import { isFeatureEnabled } from '../../api/modules'
import { AdminCardList } from '../components/AdminCardList'
import { useIsMobile } from '../useIsMobile'
import { useTabStrip } from '../hooks/useTabStrip'
import { vkFromEk } from '../utils/quotePricing'

interface StockModalProps {
  material: Material
  onClose: () => void
  onSaved: () => void
}

function StockModal({ material, onClose, onSaved }: StockModalProps) {
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const currentStock = material.inventory[0]?.quantity ?? 0
  const minStock = material.inventory[0]?.min_quantity ?? null
  // Negativer oder unter-Mindest-Bestand ist ein Problem → rot (wie in der Liste).
  const stockLow = currentStock < 0 || (minStock !== null && currentStock <= minStock)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = parseFloat(delta)
    if (isNaN(num) || num === 0) return
    setSaving(true)
    setError('')
    try {
      await adjustStock(material.art_nr, num, { note: note || null })
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Lager anpassen — {material.name}</div>
          <button className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="admin-modal-body">
          {/* Stat-Kasten folgt dem Theme: im Light-Theme heller Kasten mit dunklem
              Text, im Dark-Theme umgekehrt. Kein fixes Dunkel mehr. Nur --surface/
              --border/--text/--muted sind real definiert (--surface-2 nur als Fallback). */}
          <div style={{
            background: 'var(--surface-2, rgba(148,163,184,0.10))',
            border: '1px solid var(--border)',
            borderRadius: 9, padding: '12px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Aktueller Bestand</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stockLow ? '#ef4444' : 'var(--text)' }}>{currentStock} {material.unit || ''}</div>
          </div>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-form-group">
            <label className="admin-form-label">Änderung (+ Zugang / − Abgang)</label>
            <input
              className="admin-form-input"
              type="number"
              step="any"
              value={delta}
              onChange={e => setDelta(e.target.value)}
              placeholder="z.B. 10 oder -3"
              required
            />
            <div className="admin-form-hint">
              Neuer Bestand: {isNaN(parseFloat(delta)) ? currentStock : (currentStock + parseFloat(delta)).toFixed(2)} {material.unit || ''}
            </div>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Notiz (optional)</label>
            <input className="admin-form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="z.B. Inventur" />
          </div>
        </form>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" onClick={e => { e.preventDefault(); (e.currentTarget.closest('div.admin-modal')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }} disabled={saving || !delta}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MaterialModal({ material, onClose, onSaved, existingCategories, existingUnits, suppliers, suggestedArtNr }: { material: Material | null; onClose: () => void; onSaved: () => void; existingCategories: string[]; existingUnits: string[]; suppliers: Supplier[]; suggestedArtNr: string }) {
  const isNew = !material
  const [artNr, setArtNr] = useState(material?.art_nr ?? suggestedArtNr)
  const [name, setName] = useState(material?.name ?? '')
  const [category, setCategory] = useState(material?.category ?? '')
  const [isNewCategory, setIsNewCategory] = useState(!!(material?.category && !existingCategories.includes(material.category)))
  const [unit, setUnit] = useState(material?.unit ?? '')
  const [isNewUnit, setIsNewUnit] = useState(false)
  const [costPrice, setCostPrice] = useState(material?.cost_price?.toString() ?? '')
  // Aufschlag % pro Artikel (Quelle der Wahrheit) + daraus abgeleiteter Ziel-VK.
  // Beide Felder sind gekoppelt: Aufschlag ändern → VK folgt, VK eingeben → Aufschlag folgt.
  const [markupPct, setMarkupPct] = useState(material?.markup_pct != null ? String(material.markup_pct) : '')
  const [targetVk, setTargetVk] = useState(
    material?.calc_vk != null && material.calc_vk > 0
      ? String(material.calc_vk)
      : (material?.unit_price != null && material.unit_price > 0 ? String(material.unit_price) : '')
  )
  const [supplierId, setSupplierId] = useState(material?.supplier_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Bild: bestehendes (signierte URL aus der Liste) als Startvorschau; neue Auswahl
  // wird erst nach dem Speichern der Stammdaten hochgeladen (art_nr muss existieren).
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(material?.image_url ?? null)
  const [removeImage, setRemoveImage] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)  // Bild-Vollansicht per Klick

  // Ein Bild übernehmen — egal ob per Datei-Auswahl oder aus der Zwischenablage.
  const acceptImageFile = useCallback((f: File | null) => {
    if (!f || !f.type.startsWith('image/')) return
    setImageFile(f)
    setRemoveImage(false)
    setImagePreview(URL.createObjectURL(f))
  }, [])

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    acceptImageFile(e.target.files?.[0] ?? null)
  }

  // Bild per Strg+V aus der Zwischenablage einfügen (z.B. Screenshot oder kopiertes
  // Bild), solange das Modal offen ist. Ergänzt den Datei-Upload, ersetzt ihn nicht.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'))
      if (!item) return
      const f = item.getAsFile()
      if (f) { e.preventDefault(); acceptImageFile(f) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [acceptImageFile])

  function onRemoveImage() {
    setImageFile(null)
    setImagePreview(null)
    setRemoveImage(!!material?.image_path)  // nur löschen, wenn vorher ein Bild da war
  }

  // Nur für den Aufschlag in PROZENT — das ist kein Geldbetrag und wird auf zwei
  // Stellen gerundet. Der VK dagegen läuft über `vkFromEk` (5-Rappen-Aufrundung,
  // Pendant zu db.pricing.compute_material_vk): mit round2 zeigte die Maske 448.94,
  // verrechnet wurden 448.95.
  const round2 = (n: number) => Math.round(n * 100) / 100
  const ekNum = costPrice ? parseFloat(costPrice) : 0
  const hasEk = !isNaN(ekNum) && ekNum > 0

  // EK geändert → mit gehaltenem Aufschlag den VK neu rechnen (zeigt Teuerung live);
  // falls nur ein Ziel-VK gesetzt war, daraus den Aufschlag ableiten.
  function onChangeCost(v: string) {
    setCostPrice(v)
    const ek = v ? parseFloat(v) : 0
    if (isNaN(ek) || ek <= 0) return
    if (markupPct !== '') setTargetVk(String(vkFromEk(ek, parseFloat(markupPct))))
    else if (targetVk !== '') setMarkupPct(String(round2((parseFloat(targetVk) / ek - 1) * 100)))
  }

  function onChangeMarkup(v: string) {
    setMarkupPct(v)
    if (!hasEk) return
    setTargetVk(v !== '' ? String(vkFromEk(ekNum, parseFloat(v))) : '')
  }

  function onChangeTargetVk(v: string) {
    setTargetVk(v)
    if (!hasEk) return  // ohne EK ist der VK ein Fixpreis, kein Aufschlag ableitbar
    setMarkupPct(v !== '' ? String(round2((parseFloat(v) / ekNum - 1) * 100)) : '')
  }

  // Legacy-Einheit eines Materials, die (noch) nicht im Vokabular steht, trotzdem
  // als Auswahl anbieten — sonst ginge der Alt-Wert beim Speichern verloren.
  const unitOptions = useMemo(() => {
    const set = new Set(existingUnits)
    if (material?.unit) set.add(material.unit)
    return Array.from(set)
  }, [existingUnits, material])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!artNr.trim() || !name.trim()) return
    setSaving(true)
    setError('')
    try {
      const trimmedUnit = unit.trim()
      // Mit EK: Aufschlag % ist die Quelle der Wahrheit → VK dynamisch (Teuerung).
      // Ohne EK: kein Aufschlag berechenbar → Ziel-VK als fixer unit_price speichern.
      const markup_pct = hasEk ? (markupPct !== '' ? round2(parseFloat(markupPct)) : null) : null
      const unit_price = hasEk ? 0 : (targetVk ? round2(parseFloat(targetVk)) : 0)
      await saveMaterial({
        art_nr: artNr.trim(),
        name: name.trim(),
        category: category || null,
        unit: trimmedUnit || null,
        unit_price,
        cost_price: costPrice ? parseFloat(costPrice) : null,
        markup_pct,
        supplier_id: supplierId || null,
      }, isNew ? undefined : artNr)
      // Bild nach dem Speichern der Stammdaten verarbeiten (art_nr steht jetzt fest,
      // Artikel existiert auch bei Neuanlage). Fehler hier nicht verschlucken.
      if (imageFile) {
        await uploadMaterialImage(artNr.trim(), imageFile)
      } else if (removeImage) {
        await deleteMaterialImage(artNr.trim())
      }
      // Neue Einheit best-effort ins Vokabular aufnehmen (409 = existiert schon → egal).
      if (trimmedUnit && !existingUnits.includes(trimmedUnit)) {
        try { await createUnit(trimmedUnit) } catch { /* ignore */ }
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">{isNew ? 'Neues Material' : material.name}</div>
          <button className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="admin-modal-body">
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-form-group">
            <label className="admin-form-label">Art.-Nr. *</label>
            <input className="admin-form-input" value={artNr} onChange={e => setArtNr(e.target.value)} required disabled />
            {isNew && <div className="admin-form-hint">Automatisch vergeben</div>}
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Bezeichnung *</label>
            <input className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-form-label">Kategorie</label>
              {isNewCategory ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="admin-form-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="Neue Kategorie…" autoFocus />
                  <button type="button" className="admin-btn admin-btn-secondary" style={{ flexShrink: 0, padding: '6px 10px' }} onClick={() => { setIsNewCategory(false); setCategory('') }}>×</button>
                </div>
              ) : (
                <select className="admin-form-select" value={category} onChange={e => {
                  if (e.target.value === '__new__') { setIsNewCategory(true); setCategory('') }
                  else setCategory(e.target.value)
                }}>
                  <option value="">— Keine —</option>
                  {existingCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__new__">+ Neue Kategorie…</option>
                </select>
              )}
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Einheit</label>
              {isNewUnit ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="admin-form-input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="z.B. m², Stk, kg" autoFocus />
                  <button type="button" className="admin-btn admin-btn-secondary" style={{ flexShrink: 0, padding: '6px 10px' }} onClick={() => { setIsNewUnit(false); setUnit('') }}>×</button>
                </div>
              ) : (
                <select className="admin-form-select" value={unit} onChange={e => {
                  if (e.target.value === '__new__') { setIsNewUnit(true); setUnit('') }
                  else setUnit(e.target.value)
                }}>
                  <option value="">— Keine —</option>
                  {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                  <option value="__new__">+ neue Einheit…</option>
                </select>
              )}
            </div>
          </div>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-form-label">EK-Preis (CHF)</label>
              <input className="admin-form-input" type="number" step="0.01" min="0" value={costPrice} onChange={e => onChangeCost(e.target.value)} placeholder="Einkaufspreis" />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Aufschlag %</label>
              <input className="admin-form-input" type="number" step="0.01" value={markupPct} onChange={e => onChangeMarkup(e.target.value)} placeholder={hasEk ? 'leer = Lieferanten-Aufschlag' : 'EK nötig'} disabled={!hasEk} />
            </div>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">VK-Preis (CHF)</label>
            <input className="admin-form-input" type="number" step="0.01" min="0" value={targetVk} onChange={e => onChangeTargetVk(e.target.value)} placeholder={hasEk ? 'aus EK × Aufschlag' : 'Fixpreis (kein EK)'} />
            <div className="admin-form-hint">
              {hasEk
                ? 'VK = EK × Aufschlag und steigt automatisch mit dem EK (Teuerung). Direkt einen VK eingeben → der Aufschlag wird daraus bestimmt. Beide leer = Lieferanten-Aufschlag.'
                : 'Ohne EK wird der VK als fixer Preis gespeichert (gibt keine Teuerung weiter).'}
            </div>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Lieferant</label>
            <select className="admin-form-select" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">— Kein —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Bild</label>
            {imagePreview ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={imagePreview} alt={name} title="Zum Vergrössern klicken" onClick={() => setLightboxOpen(true)} style={{ height: 72, width: 'auto', maxWidth: 160, objectFit: 'contain', display: 'block', borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="admin-btn admin-btn-secondary admin-btn-sm" style={{ cursor: 'pointer' }}>
                    Ändern
                    <input type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} />
                  </label>
                  <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onRemoveImage}>Entfernen</button>
                </div>
              </div>
            ) : (
              <label className="admin-btn admin-btn-secondary admin-btn-sm" style={{ cursor: 'pointer', width: 'fit-content' }}>
                Bild wählen…
                <input type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} />
              </label>
            )}
            <div className="admin-form-hint">JPEG/PNG/WebP — wird automatisch verkleinert (max. ~1024 px). Bild aus der Zwischenablage mit Strg+V einfügen.</div>
          </div>
        </form>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" onClick={e => { (e.currentTarget.closest('div.admin-modal')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }} disabled={saving}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
    {lightboxOpen && imagePreview && (
      <div
        onClick={() => setLightboxOpen(false)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 24 }}
      >
        <img src={imagePreview} alt={name} style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 8 }} />
      </div>
    )}
    </>
  )
}

// Nur echte DB-Spalten sind serverseitig sortierbar. VK-Preis (berechnet) und
// Bestand (separate inventory-Tabelle) sind es nicht — siehe MaterialsListResponse.
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 50

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 11 }}>
      {active && dir === 'desc' ? '↓' : '↑'}
    </span>
  )
}

function MaterialInventoryPanel() {
  const isMobile = useIsMobile()
  const [data, setData] = useState<MaterialsListResponse>({ rows: [], total: 0, page: 1, page_size: PAGE_SIZE })
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [units, setUnits] = useState<string[]>([])
  const [nextArtNr, setNextArtNr] = useState('1')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [sortKey, setSortKey] = useState<MaterialSortKey>('art_nr')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [editMaterial, setEditMaterial] = useState<Material | null | 'new'>()
  const [stockMaterial, setStockMaterial] = useState<Material | null>(null)

  // Lieferanten, Kategorien-Dropdown und naechste Art.-Nr. sind nicht aus der
  // (paginierten) Liste ableitbar → separat laden, nach jedem Speichern auffrischen.
  const loadMeta = useCallback(async () => {
    try {
      const [sups, meta] = await Promise.all([listSuppliers(), getMaterialsMeta()])
      setSuppliers(sups)
      setCategories(meta.categories ?? [])
      setUnits(meta.units ?? [])
      setNextArtNr(meta.next_art_nr ?? '1')
    } catch { /* nicht blockierend */ }
  }, [])

  useEffect(() => { loadMeta() }, [loadMeta])

  // Suche: 300ms Debounce, damit nicht jeder Tastendruck einen Roundtrip ausloest.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Filter/Suche/Sort aendern → zurueck auf Seite 1.
  useEffect(() => { setPage(1) }, [debouncedSearch, categoryFilter, supplierFilter, sortKey, sortDir])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listMaterials({
        sort: sortKey,
        dir: sortDir,
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch,
        category: categoryFilter,
        supplierId: supplierFilter,
      }))
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, categoryFilter, supplierFilter, sortKey, sortDir, page])

  useEffect(() => { load() }, [load])

  // Nach Speichern/Lager-Anpassung: aktuelle Seite + Meta neu laden.
  const reload = useCallback(() => { load(); loadMeta() }, [load, loadMeta])

  function toggleSort(key: MaterialSortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const supplierMap = Object.fromEntries(suppliers.map(s => [s.id, s.name]))
  const { rows, total } = data
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }
  const thStaticStyle: React.CSSProperties = { whiteSpace: 'nowrap' }

  return (
    <>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Material / Lager</div>
          <div className="admin-page-subtitle">{total} Artikel</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setEditMaterial('new')}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
          Neues Material
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input className="admin-search" placeholder="Art.-Nr., Bezeichnung oder Lieferant…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">Alle Kategorien</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
            <option value="">Alle Lieferanten</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          <AdminCardList
            items={rows}
            keyFor={m => String(m.id)}
            onItemClick={m => setEditMaterial(m)}
            empty="Keine Materialien gefunden."
            renderCard={m => {
              const stock = m.inventory[0]?.quantity ?? null
              const minStock = m.inventory[0]?.min_quantity ?? null
              const stockLow = stock !== null && minStock !== null && stock <= minStock
              const supplierName = m.supplier_id ? (supplierMap[m.supplier_id] ?? null) : null
              return (
                <>
                  <div className="admin-card-head">
                    <span className="admin-card-title">{m.name}</span>
                    <span className="admin-card-meta" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{m.art_nr}</span>
                  </div>
                  <div className="admin-card-meta">
                    {[m.category, m.unit, supplierName].filter(Boolean).join(' · ') || '—'}
                  </div>
                  <div className="admin-card-meta">
                    EK: {m.cost_price != null ? `CHF ${m.cost_price.toFixed(2)}` : '—'} · VK: {m.calc_vk != null && m.calc_vk > 0 ? `CHF ${m.calc_vk.toFixed(2)}` : '—'}
                    {stock !== null && <> · Bestand: <span style={{ color: stockLow ? '#ef4444' : 'inherit', fontWeight: stockLow ? 700 : undefined }}>{stock} {m.unit || ''}</span></>}
                  </div>
                  <div className="admin-card-actions">
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={e => { e.stopPropagation(); setStockMaterial(m) }}
                    >
                      Lager
                    </button>
                  </div>
                </>
              )
            }}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th style={thStyle} onClick={() => toggleSort('art_nr')}>
                  Art.-Nr. <SortIcon active={sortKey === 'art_nr'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('name')}>
                  Bezeichnung <SortIcon active={sortKey === 'name'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('category')}>
                  Kategorie <SortIcon active={sortKey === 'category'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('unit')}>
                  Einheit <SortIcon active={sortKey === 'unit'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('cost_price')}>
                  EK-Preis <SortIcon active={sortKey === 'cost_price'} dir={sortDir} />
                </th>
                <th style={thStaticStyle}>VK-Preis</th>
                <th style={thStaticStyle}>Bestand</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="admin-table-empty">Keine Materialien gefunden.</td></tr>
              ) : rows.map(m => {
                const stock = m.inventory[0]?.quantity ?? null
                const minStock = m.inventory[0]?.min_quantity ?? null
                const stockLow = stock !== null && minStock !== null && stock <= minStock
                const supplierName = m.supplier_id ? (supplierMap[m.supplier_id] ?? null) : null
                return (
                  <tr key={m.id} onClick={() => setEditMaterial(m)}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{m.art_nr}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {m.image_url ? <img src={m.image_url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} /> : null}
                        <span><strong>{m.name}</strong>{supplierName ? <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 12 }}>{supplierName}</span> : null}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{m.category || '—'}</td>
                    <td>{m.unit || '—'}</td>
                    <td>{m.cost_price != null ? `CHF ${m.cost_price.toFixed(2)}` : '—'}</td>
                    <td>
                      {m.calc_vk != null && m.calc_vk > 0 ? `CHF ${m.calc_vk.toFixed(2)}` : '—'}
                      {m.markup_pct != null ? (
                        <span style={{ color: 'var(--muted)', marginLeft: 4, fontSize: 11 }} title={`Per-Artikel-Aufschlag ${m.markup_pct}% (steigt mit dem EK)`}>+{m.markup_pct}%</span>
                      ) : m.unit_price != null && m.unit_price > 0 ? (
                        <span style={{ color: 'var(--muted)', marginLeft: 4, fontSize: 11 }} title="Fixer VK-Preis">✎</span>
                      ) : null}
                    </td>
                    <td>
                      {stock !== null
                        ? <span style={{ color: stockLow ? '#ef4444' : 'inherit', fontWeight: stockLow ? 700 : undefined }}>{stock} {m.unit || ''}</span>
                        : <span style={{ color: 'var(--muted)' }}>—</span>
                      }
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        onClick={() => setStockMaterial(m)}
                      >
                        Lager
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              {rangeStart}–{rangeEnd} von {total}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                ← Zurück
              </button>
              <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 90, textAlign: 'center' }}>
                Seite {page} / {totalPages}
              </span>
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Weiter →
              </button>
            </div>
          </div>
        )}
      </div>

      {editMaterial !== undefined && (
        <MaterialModal
          material={editMaterial === 'new' ? null : (editMaterial as Material)}
          onClose={() => setEditMaterial(undefined)}
          onSaved={() => { setEditMaterial(undefined); reload() }}
          existingCategories={categories}
          existingUnits={units}
          suppliers={suppliers}
          suggestedArtNr={nextArtNr}
        />
      )}

      {stockMaterial && (
        <StockModal
          material={stockMaterial}
          onClose={() => setStockMaterial(null)}
          onSaved={() => { setStockMaterial(null); reload() }}
        />
      )}
    </>
  )
}

// Der frühere Reiter "Einheiten" sitzt jetzt in den Admin-Tools (admin/system/UnitsPanel):
// ein Rename kaskadiert über den ganzen Materialstamm, das ist Wartung, kein Tagesgeschäft.
type MaterialTab = 'inventory' | 'frequent' | 'vkbulk' | 'import'

export default function MaterialsScreen({ user }: { user: UserInfo }) {
  const [tab, setTab] = useState<MaterialTab>('inventory')
  const tabsRef = useTabStrip(tab)
  // Tab "Häufig benutzte Produkte" nur, wenn der Workflow ersatzteil_prompt aktiv ist.
  const ersatzteilEnabled = isFeatureEnabled(user, 'ersatzteil_prompt')
  // Tab "VK-Massenänderung" nur, wenn eigene Artikel im Einsatz sind (import_eigenartikel).
  const ownArticleEnabled = isFeatureEnabled(user, 'import_eigenartikel')

  return (
    <div className="admin-page">
      <div className="kpi-admin-tabs" ref={tabsRef} style={{ marginBottom: 20 }}>
        <button
          className={`kpi-admin-tab${tab === 'inventory' ? ' active' : ''}`}
          onClick={() => setTab('inventory')}
        >
          Material / Lager
        </button>
        {ersatzteilEnabled && (
          <button
            className={`kpi-admin-tab${tab === 'frequent' ? ' active' : ''}`}
            onClick={() => setTab('frequent')}
          >
            Häufig benutzte Produkte
          </button>
        )}
        {ownArticleEnabled && (
          <button
            className={`kpi-admin-tab${tab === 'vkbulk' ? ' active' : ''}`}
            onClick={() => setTab('vkbulk')}
          >
            VK-Massenänderung
          </button>
        )}
        <button
          className={`kpi-admin-tab${tab === 'import' ? ' active' : ''}`}
          onClick={() => setTab('import')}
        >
          Import
        </button>
      </div>

      {tab === 'inventory' && <MaterialInventoryPanel />}
      {tab === 'frequent' && ersatzteilEnabled && <FrequentMaterialsPanel />}
      {tab === 'vkbulk' && ownArticleEnabled && <MaterialVkBulkPanel />}
      {tab === 'import' && <ImportScreen ownArticleEnabled={ownArticleEnabled} />}
    </div>
  )
}

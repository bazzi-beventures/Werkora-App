import { useCallback, useEffect, useMemo, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { adjustStock } from '../../api/admin/inventory'
import type { StockMovementType } from '../../api/admin/inventory'
import MovementList from './MovementList'
import {
  deleteMaterialImage, getMaterialsMeta, listMaterials, saveMaterial, setMaterialArchived,
  uploadMaterialImage,
} from '../../api/admin/materials'
import type {
  Material, MaterialSortKey, MaterialStatusFilter, MaterialsListResponse,
} from '../../api/admin/materials'
import { listSuppliers } from '../../api/admin/suppliers'
import type { Supplier } from '../../api/admin/suppliers'
import { createUnit } from '../../api/admin/units'
import FrequentMaterialsPanel from './FrequentMaterialsPanel'
import MaterialVkBulkPanel from './MaterialVkBulkPanel'
import ImportScreen from '../system/ImportScreen'
import CountsScreen from '../lager/CountsScreen'
import LagerOverview from '../lager/LagerOverview'
import UnitsPanel from './UnitsPanel'
import { UserInfo } from '../../api/auth'
import { hasModule, isFeatureEnabled } from '../../api/modules'
import { AdminCardList } from '../components/AdminCardList'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useIsMobile } from '../useIsMobile'
import { useTabStrip } from '../hooks/useTabStrip'
import { vkFromEk } from '../utils/quotePricing'

interface StockModalProps {
  material: Material
  onClose: () => void
  onSaved: () => void
}

// Von Hand buchbar sind drei Arten. `usage` fehlt bewusst: Verbrauch entsteht am
// Rapport — von Hand gebucht stünde im Journal ein Abgang ohne Beleg. Die Werte
// müssen zur CHECK-Constraint der Datenbank passen; bis 20260919 taten sie das
// nicht, und jede Korrektur aus dieser Maske ging still verloren.
const BEWEGUNGSARTEN: { wert: StockMovementType; label: string; hilfe: string }[] = [
  { wert: 'delivery', label: 'Lieferung', hilfe: 'Ware ist eingetroffen' },
  { wert: 'correction', label: 'Korrektur', hilfe: 'Bruch, Schwund, Zählfehler' },
  { wert: 'return', label: 'Rückgabe', hilfe: 'unverbaut von der Baustelle zurück' },
]

// Benannt exportiert für den Ratchet in MaterialsScreen.stock.test.tsx: Was
// dieser Dialog an Bewegungsarten rausschickt, muss die Datenbank annehmen —
// bis 20260919 tat es das nicht, und die Bewegung ging still verloren. Den
// ganzen Screen dafür aufzubauen hiesse ein Dutzend Netzaufrufe zu mocken, die
// mit der Frage nichts zu tun haben.
export function StockModal({ material, onClose, onSaved }: StockModalProps) {
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [art, setArt] = useState<StockMovementType>('delivery')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'buchen' | 'journal'>('buchen')
  const currentStock = material.inventory[0]?.quantity ?? 0
  const minStock = material.inventory[0]?.min_quantity ?? null
  // Negativer oder unter-Mindest-Bestand ist ein Problem → rot (wie in der Liste).
  // Vergleich mit '<', wie Trigger, View und KPI: genau auf der Schwelle ist der
  // Bestand noch in Ordnung. Bis 20260919 stand hier '<=', und ein Artikel auf
  // der Schwelle war rot, obwohl die Datenbank ihn 'ok' nannte.
  const stockLow = currentStock < 0 || (minStock !== null && currentStock < minStock)
  // Eine Korrektur ohne Begründung ist der Anfang vom Ende jeder Inventur; der
  // Server lehnt sie ab, also sperren wir den Knopf schon hier.
  const begruendungFehlt = art === 'correction' && !note.trim()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = parseFloat(delta)
    if (isNaN(num) || num === 0 || begruendungFehlt) return
    setSaving(true)
    setError('')
    try {
      await adjustStock(material.art_nr, num, { movementType: art, note: note || null })
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
          <div className="admin-modal-title">Lager — {material.name}</div>
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
            <div style={{ fontSize: 28, fontWeight: 700, color: stockLow ? 'var(--danger)' : 'var(--text)' }}>{currentStock} {material.unit || ''}</div>
            {minStock !== null && minStock > 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Mindestbestand {minStock} {material.unit || ''}</div>
            )}
          </div>
          <div className="kpi-admin-tabs" style={{ marginTop: 12 }}>
            <button
              type="button"
              className={`kpi-admin-tab${tab === 'buchen' ? ' active' : ''}`}
              onClick={() => setTab('buchen')}
            >
              Neue Buchung
            </button>
            <button
              type="button"
              className={`kpi-admin-tab${tab === 'journal' ? ' active' : ''}`}
              onClick={() => setTab('journal')}
            >
              Bewegungen
            </button>
          </div>
          {tab === 'journal' ? (
            <div style={{ marginTop: 12 }}>
              <MovementList artNr={material.art_nr} unit={material.unit} />
            </div>
          ) : (
            <>
              {error && <div className="admin-form-error">{error}</div>}
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="lager-art">Art der Bewegung</label>
                <select id="lager-art" className="admin-form-input" value={art} onChange={e => setArt(e.target.value as StockMovementType)}>
                  {BEWEGUNGSARTEN.map(a => (
                    <option key={a.wert} value={a.wert}>{a.label} — {a.hilfe}</option>
                  ))}
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="lager-delta">Änderung (+ Zugang / − Abgang)</label>
                <input
                  id="lager-delta"
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
                <label className="admin-form-label" htmlFor="lager-notiz">
                  Begründung {art === 'correction' ? '' : '(optional)'}
                </label>
                <input
                  id="lager-notiz"
                  className="admin-form-input"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={art === 'correction' ? 'z.B. 2 Stk beschädigt' : 'z.B. Lieferschein 4711'}
                  required={art === 'correction'}
                />
                {art === 'correction' && (
                  <div className="admin-form-hint">
                    Pflicht bei einer Korrektur — sonst steht beim nächsten Zählen eine
                    Differenz da, die niemand mehr erklären kann.
                  </div>
                )}
              </div>
            </>
          )}
        </form>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary" onClick={onClose}>
            {tab === 'journal' ? 'Schliessen' : 'Abbrechen'}
          </button>
          {tab === 'buchen' && (
            <button className="admin-btn admin-btn-primary" onClick={e => { e.preventDefault(); (e.currentTarget.closest('div.admin-modal')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }} disabled={saving || !delta || begruendungFehlt}>
              {saving ? 'Speichern…' : 'Buchen'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function MaterialModal({ material, onClose, onSaved, existingCategories, existingUnits, suppliers, suggestedArtNr, lagerAktiv }: { material: Material | null; onClose: () => void; onSaved: () => void; existingCategories: string[]; existingUnits: string[]; suppliers: Supplier[]; suggestedArtNr: string; lagerAktiv: boolean }) {
  const isNew = !material
  const [artNr, setArtNr] = useState(material?.art_nr ?? suggestedArtNr)
  const [name, setName] = useState(material?.name ?? '')
  const [category, setCategory] = useState(material?.category ?? '')
  const [isNewCategory, setIsNewCategory] = useState(!!(material?.category && !existingCategories.includes(material.category)))
  const [unit, setUnit] = useState(material?.unit ?? '')
  const [isNewUnit, setIsNewUnit] = useState(false)
  const [costPrice, setCostPrice] = useState(material?.cost_price?.toString() ?? '')
  // Schwellenwerte des Lagers. Sie stehen an der Lagerzeile, werden aber hier
  // gepflegt — bis 20260919 gab es dafür überhaupt keine Maske, und der
  // Mindestbestand kam ausschliesslich über das Import-Tool herein. Ohne ihn
  // war "unter Meldebestand" bei jedem von Hand angelegten Artikel bedeutungslos.
  const [minQuantity, setMinQuantity] = useState(
    material?.inventory?.[0]?.min_quantity != null ? String(material.inventory[0].min_quantity) : '',
  )
  const [reorderQuantity, setReorderQuantity] = useState(
    material?.inventory?.[0]?.reorder_quantity != null ? String(material.inventory[0].reorder_quantity) : '',
  )
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
        // Nur mitschicken, wenn das Lager-Modul läuft — sonst stünden an einem
        // Mandanten ohne Lager Schwellenwerte, die niemand je sieht.
        // min_quantity ist in der Datenbank NOT NULL: leeres Feld = 0, also
        // keine Überwachung. reorder_quantity darf null sein und heisst dann
        // "Menge aus dem Verbrauch vorschlagen".
        ...(lagerAktiv ? {
          min_quantity: minQuantity !== '' ? parseFloat(minQuantity) : 0,
          reorder_quantity: reorderQuantity !== '' ? parseFloat(reorderQuantity) : null,
        } : {}),
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
          {lagerAktiv && (
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-form-label">Mindestbestand</label>
                <input
                  className="admin-form-input" type="number" step="any" min="0"
                  value={minQuantity} onChange={e => setMinQuantity(e.target.value)}
                  placeholder="0 = keine Überwachung"
                />
                <div className="admin-form-hint">
                  Fällt der Bestand darunter, erscheint der Artikel als «unter Meldebestand».
                </div>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Bestellmenge</label>
                <input
                  className="admin-form-input" type="number" step="any" min="0"
                  value={reorderQuantity} onChange={e => setReorderQuantity(e.target.value)}
                  placeholder="leer = aus dem Verbrauch"
                />
                <div className="admin-form-hint">
                  Menge für den Bestellvorschlag.
                </div>
              </div>
            </div>
          )}
          <div className="admin-form-group">
            <label className="admin-form-label">Bild</label>
            {imagePreview ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={imagePreview} alt={name} title="Zum Vergrössern klicken" onClick={() => setLightboxOpen(true)} style={{ height: 72, width: 'auto', maxWidth: 160, objectFit: 'contain', display: 'block', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', cursor: 'zoom-in' }} />
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
        <img src={imagePreview} alt={name} style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }} />
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

/** Kennzeichnet eine Zeile, die nur im Filter «Archivierte»/«Alle» ueberhaupt
 *  auftaucht — ohne das Schild sieht ein archivierter Artikel dort aus wie
 *  jeder andere. */
function ArchivBadge() {
  return (
    <span
      className="admin-badge"
      style={{ marginLeft: 6, fontSize: 11 }}
      title="Archiviert — nicht in Offerte, Rechnung und Katalog"
    >
      Archiviert
    </span>
  )
}

function MaterialInventoryPanel({ user }: { user: UserInfo }) {
  // Seit Lager v2 (20260919) legt der Server zu jedem Artikel eine Lagerzeile an.
  // Vorher verschwand die Bestandsspalte von selbst, wenn keine existierte —
  // ohne diese Abfrage sähe ein Mandant ohne Lager-Modul jetzt Bestände und
  // liefe beim Buchen in ein 403.
  const lagerAktiv = hasModule(user, 'inventory')
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
  const [statusFilter, setStatusFilter] = useState<MaterialStatusFilter>('active')
  const [sortKey, setSortKey] = useState<MaterialSortKey>('art_nr')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [editMaterial, setEditMaterial] = useState<Material | null | 'new'>()
  const [stockMaterial, setStockMaterial] = useState<Material | null>(null)
  // Artikel, fuer den die Archivieren-/Zurueckholen-Rueckfrage offen ist.
  const [archivMaterial, setArchivMaterial] = useState<Material | null>(null)
  const [archivBusy, setArchivBusy] = useState(false)
  const [archivFehler, setArchivFehler] = useState('')

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
  useEffect(() => { setPage(1) }, [debouncedSearch, categoryFilter, supplierFilter, statusFilter, sortKey, sortDir])

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
        status: statusFilter,
      }))
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, categoryFilter, supplierFilter, statusFilter, sortKey, sortDir, page])

  useEffect(() => { load() }, [load])

  // Nach Speichern/Lager-Anpassung: aktuelle Seite + Meta neu laden.
  const reload = useCallback(() => { load(); loadMeta() }, [load, loadMeta])

  // Archivieren ist kein Loeschen: der Artikel verschwindet aus dieser Liste,
  // aus dem Katalog der Monteur-App und aus den Auswahlfeldern von Offerte und
  // Rechnung — Bestand, Warenbewegungen und jede bereits geschriebene Position
  // bleiben. Genau deshalb die Rueckfrage statt eines stillen Umschaltens: der
  // Knopf sitzt in der Zeile, und ein Fehlgriff waere sonst erst auffaellig,
  // wenn der Artikel in der naechsten Offerte fehlt.
  async function archivStatusSetzen(m: Material, archivieren: boolean) {
    setArchivBusy(true)
    setArchivFehler('')
    try {
      await setMaterialArchived(m.art_nr, archivieren)
      setArchivMaterial(null)
      reload()
    } catch (e) {
      setArchivFehler(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.')
    } finally {
      setArchivBusy(false)
    }
  }

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
          {/* Ohne diesen Filter waere ein archivierter Artikel nicht mehr
              auffindbar — und das Archivieren damit eine Einbahnstrasse. */}
          <select
            className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }}
            value={statusFilter} onChange={e => setStatusFilter(e.target.value as MaterialStatusFilter)}
          >
            <option value="active">Aktive Artikel</option>
            <option value="archived">Archivierte</option>
            <option value="all">Aktive und archivierte</option>
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
              const stockLow = stock !== null && minStock !== null && stock < minStock
              const supplierName = m.supplier_id ? (supplierMap[m.supplier_id] ?? null) : null
              return (
                <>
                  <div className="admin-card-head">
                    <span className="admin-card-title">
                      {m.name}
                      {!m.is_active && <ArchivBadge />}
                    </span>
                    <span className="admin-card-meta" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{m.art_nr}</span>
                  </div>
                  <div className="admin-card-meta">
                    {[m.category, m.unit, supplierName].filter(Boolean).join(' · ') || '—'}
                  </div>
                  <div className="admin-card-meta">
                    EK: {m.cost_price != null ? `CHF ${m.cost_price.toFixed(2)}` : '—'} · VK: {m.calc_vk != null && m.calc_vk > 0 ? `CHF ${m.calc_vk.toFixed(2)}` : '—'}
                    {lagerAktiv && stock !== null && <> · Bestand: <span style={{ color: stockLow ? 'var(--danger)' : 'inherit', fontWeight: stockLow ? 700 : undefined }}>{stock} {m.unit || ''}</span></>}
                  </div>
                  <div className="admin-card-actions">
                    {lagerAktiv && (
                      <button
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        onClick={e => { e.stopPropagation(); setStockMaterial(m) }}
                      >
                        Lager
                      </button>
                    )}
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={e => { e.stopPropagation(); setArchivFehler(''); setArchivMaterial(m) }}
                    >
                      {m.is_active ? 'Archivieren' : 'Zurückholen'}
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
                {lagerAktiv && <th style={thStaticStyle}>Bestand</th>}
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={lagerAktiv ? 8 : 7} className="admin-table-empty">Keine Materialien gefunden.</td></tr>
              ) : rows.map(m => {
                const stock = m.inventory[0]?.quantity ?? null
                const minStock = m.inventory[0]?.min_quantity ?? null
                const stockLow = stock !== null && minStock !== null && stock < minStock
                const supplierName = m.supplier_id ? (supplierMap[m.supplier_id] ?? null) : null
                return (
                  <tr key={m.id} onClick={() => setEditMaterial(m)}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{m.art_nr}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {m.image_url ? <img src={m.image_url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} /> : null}
                        <span>
                          <strong>{m.name}</strong>
                          {supplierName ? <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 12 }}>{supplierName}</span> : null}
                          {!m.is_active && <ArchivBadge />}
                        </span>
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
                    {lagerAktiv && (
                      <td>
                        {stock !== null
                          ? <span style={{ color: stockLow ? 'var(--danger)' : 'inherit', fontWeight: stockLow ? 700 : undefined }}>{stock} {m.unit || ''}</span>
                          : <span style={{ color: 'var(--muted)' }}>—</span>
                        }
                      </td>
                    )}
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {lagerAktiv && (
                          <button
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            onClick={() => setStockMaterial(m)}
                          >
                            Lager
                          </button>
                        )}
                        <button
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => { setArchivFehler(''); setArchivMaterial(m) }}
                          title={m.is_active
                            ? 'Artikel ausblenden — erscheint nicht mehr in Offerte, Rechnung und Katalog'
                            : 'Artikel wieder zur Auswahl stellen'}
                        >
                          {m.is_active ? 'Archivieren' : 'Zurückholen'}
                        </button>
                      </div>
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
          lagerAktiv={lagerAktiv}
        />
      )}

      {archivMaterial && (
        <ConfirmDialog
          title={archivMaterial.is_active ? 'Artikel archivieren?' : 'Artikel zurückholen?'}
          message={archivMaterial.is_active ? (
            <>
              <strong>{archivMaterial.name}</strong> (Art.-Nr. {archivMaterial.art_nr}) erscheint
              danach nicht mehr in Offerte, Rechnung, Materialliste und im Katalog der
              Mitarbeiter-App. Gelöscht wird nichts: Bestand, Lagerbewegungen und alle
              bereits geschriebenen Positionen bleiben unverändert, und der Artikel lässt
              sich jederzeit zurückholen.
            </>
          ) : (
            <>
              <strong>{archivMaterial.name}</strong> (Art.-Nr. {archivMaterial.art_nr}) steht
              danach wieder in Materialliste, Katalog und den Auswahlfeldern von Offerte und
              Rechnung.
            </>
          )}
          warning={archivFehler}
          confirmLabel={archivMaterial.is_active ? 'Archivieren' : 'Zurückholen'}
          variant={archivMaterial.is_active ? 'danger' : 'primary'}
          busy={archivBusy}
          busyLabel="Speichern…"
          onConfirm={() => archivStatusSetzen(archivMaterial, archivMaterial.is_active)}
          onCancel={() => setArchivMaterial(null)}
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

// "Einheiten" ist seit P4 wieder hier (Spec docs/specs/admin-werkora-ch.md §6.5,
// Entscheid E7). Der Reiter war in die Admin-Tools gewandert, weil ein Rename über
// den ganzen Materialstamm kaskadiert — Wartung, kein Tagesgeschäft. Superadmin-only
// war er damit nur als Nebeneffekt des Containers; Masseinheiten sind eine
// Einstellung des Mandanten. Mit dem Container ist der Nebeneffekt weg.
//
// Ganz rechts, neben "Import": beides sind Werkzeuge am Stamm, nicht am Tagesbestand.
type MaterialTab = 'inventory' | 'lager' | 'inventur' | 'frequent' | 'vkbulk' | 'import' | 'units'

/**
 * Wohin ein Direktsprung führt. Muster wie bei `QuotesScreen initialStatus`:
 * Die Kachel auf dem Dashboard und die Push tragen ein `detailId`, und der
 * Screen wertet es genau einmal aus (`onConsumed`).
 *
 * `'lager'` und `'inventur'` öffnen den Reiter, `'inventur:<id>'` zusätzlich
 * die Zählung. Alles andere wird ignoriert — ein unbekanntes Ziel soll den
 * Screen nicht leer lassen.
 */
function parseSprung(detailId?: string): { tab: MaterialTab; countId?: string } | null {
  if (!detailId) return null
  if (detailId === 'lager') return { tab: 'lager' }
  if (detailId === 'inventur') return { tab: 'inventur' }
  if (detailId.startsWith('inventur:')) {
    const id = detailId.slice('inventur:'.length).trim()
    return id ? { tab: 'inventur', countId: id } : { tab: 'inventur' }
  }
  return null
}

export default function MaterialsScreen({ user, detailId, onConsumed }: {
  user: UserInfo
  /** Direktsprung: 'lager' | 'inventur' | 'inventur:<count_id>' (siehe parseSprung). */
  detailId?: string
  onConsumed?: () => void
}) {
  const sprung = parseSprung(detailId)
  const [tab, setTab] = useState<MaterialTab>(sprung?.tab ?? 'inventory')
  const [sprungCountId, setSprungCountId] = useState<string | undefined>(sprung?.countId)
  const tabsRef = useTabStrip(tab)
  // Tab "Häufig benutzte Produkte" nur, wenn der Workflow ersatzteil_prompt aktiv ist.
  const ersatzteilEnabled = isFeatureEnabled(user, 'ersatzteil_prompt')
  // Tab "VK-Massenänderung" nur, wenn eigene Artikel im Einsatz sind (import_eigenartikel).
  const ownArticleEnabled = isFeatureEnabled(user, 'import_eigenartikel')
  // Reiter «Lager» nur mit Lager-Modul UND dem Flag lager_v2. Ohne das Flag gibt
  // es die Bestandsführung in dieser Tiefe nicht — die Bestandsspalte im Katalog
  // bleibt davon unberührt, sie hängt allein am Modul.
  const lagerV2 = hasModule(user, 'inventory') && isFeatureEnabled(user, 'lager_v2')

  return (
    <div className="admin-page">
      <div className="kpi-admin-tabs" ref={tabsRef} style={{ marginBottom: 20 }}>
        <button
          className={`kpi-admin-tab${tab === 'inventory' ? ' active' : ''}`}
          onClick={() => setTab('inventory')}
        >
          Material / Lager
        </button>
        {lagerV2 && (
          <button
            className={`kpi-admin-tab${tab === 'lager' ? ' active' : ''}`}
            onClick={() => setTab('lager')}
          >
            Lager
          </button>
        )}
        {lagerV2 && (
          <button
            className={`kpi-admin-tab${tab === 'inventur' ? ' active' : ''}`}
            onClick={() => setTab('inventur')}
          >
            Inventur
          </button>
        )}
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
        <button
          className={`kpi-admin-tab${tab === 'units' ? ' active' : ''}`}
          onClick={() => setTab('units')}
        >
          Einheiten
        </button>
      </div>

      {tab === 'inventory' && <MaterialInventoryPanel user={user} />}
      {tab === 'lager' && lagerV2 && <LagerOverview />}
      {tab === 'inventur' && lagerV2 && (
        <CountsScreen
          openCountId={sprungCountId}
          onConsumed={() => { setSprungCountId(undefined); onConsumed?.() }}
        />
      )}
      {tab === 'frequent' && ersatzteilEnabled && <FrequentMaterialsPanel />}
      {tab === 'vkbulk' && ownArticleEnabled && <MaterialVkBulkPanel />}
      {tab === 'import' && <ImportScreen ownArticleEnabled={ownArticleEnabled} />}
      {tab === 'units' && <UnitsPanel />}
    </div>
  )
}

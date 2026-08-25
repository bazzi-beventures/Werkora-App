// Bestehende Offerte bearbeiten (Charge H2 — aus QuotesScreen.tsx herausgelöst).
//
// Unterschied zum Erstellen: hier gibt es keinen localStorage-Entwurf (was in der
// Maske steht, existiert nur im State) und kein Katalog-Material — die
// gespeicherte Offerte trägt aufgelöste Zeilen ohne Artikelnummer. Dafür ist der
// Rechnungsempfänger änderbar und Fahrtkosten sind eigene Zeilen.

import { useEffect, useState } from 'react'
import { updateQuote } from '../../../api/admin/quotes'
import type { QuoteDetail } from '../../../api/admin/quotes'
import { getAllCustomers } from '../../../api/admin/customers'
import type { Customer } from '../../../api/admin/customers'
import { fmtCHF } from '../../utils/format'
import { factorToPct } from '../../utils/quotePricing'
import { InfoHint } from '../../components/InfoHint'
import { CustomerCombobox } from '../CustomerCombobox'
import { MaterialCombobox } from '../MaterialCombobox'
import { PdfExtractionReviewModal } from '../PdfExtractionReviewModal'
import type { ConfirmedExtraProduct } from '../PdfExtractionReviewModal'
import { DescPriceFieldset, DiscountsFieldset, SkontoFieldset, skontoValidationError } from '../QuoteFormParts'
import { AutoGrowTextarea, RowReorder, useReorder } from '../QuoteRowControls'
import {
  CHECKBOX_LABEL_STYLE, ExtraProductsFieldset, FIELDSET_STYLE, InstallationFieldset, LaborFieldset,
  LEGEND_STYLE, MaterialFilters, MaterialLegend, OPTIONAL_HINT, QuoteTextFields,
  SpecialPositionsFieldset,
} from './QuoteFieldsets'
import { buildEditQuotePayload } from './quotePayload'
import { applyEkMargin } from './quoteRows'
import { useQuoteMasterData } from './useQuoteMasterData'
import { useQuotePdfImport } from './useQuotePdfImport'
import { useRowList } from './useRowList'
import type {
  EditChargeRow, EditExtraRow, EditFreeRow, EditLaborRow, EditTravelRow, InstallationRow, SpecialRow,
} from './quoteTypes'

interface Props {
  quote: QuoteDetail
  onDone: (warning?: string) => void
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
}

export function QuoteEditForm({ quote, onDone, onCancel, onDirtyChange }: Props) {
  const master = useQuoteMasterData()

  const labor = useRowList<EditLaborRow>(() =>
    quote.labor_items.map(i => ({ description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price), hidden: !!i.hidden })))
  const material = useRowList<EditFreeRow>(() =>
    quote.material_items.map(i => ({ description: i.description, quantity: String(i.quantity), unit: i.unit, unit_price: String(i.unit_price), optional: !!i.optional })))
  const extraProducts = useRowList<EditExtraRow>(() =>
    quote.extra_product_items.map(i => ({
      description: i.description, quantity: String(i.quantity), unit: i.unit,
      unit_price: String(i.unit_price), optional: !!i.optional,
      ek: i.ek_price != null ? String(i.ek_price) : undefined,
      margin_pct: i.margin_factor != null ? String(factorToPct(i.margin_factor)) : undefined,
      supplier_id: i.supplier_id, category: i.category, positions: i.positions,
    })), applyEkMargin)
  const extraCharges = useRowList<EditChargeRow>(() =>
    quote.extra_charge_items.map(i => ({
      description: i.description, total_price: String(i.total_price),
      werkora_bonus: i.werkora_bonus,
    })))
  const travel = useRowList<EditTravelRow>(() =>
    quote.travel_items.map(i => ({ description: i.description, total_price: String(i.total_price) })))
  const installation = useRowList<InstallationRow>(() =>
    quote.installation_items.map(i => ({ description: i.description, unit_price: String(i.unit_price) })))
  const special = useRowList<SpecialRow>(() =>
    (quote.special_items || []).map(i => ({
      description: i.description,
      mode: i.unit === 'h' ? 'stunden' : 'pauschal',
      unit_price: String(i.unit_price),
      hours: i.unit === 'h' ? String(i.quantity) : '',
    })))

  const [laborDiscount, setLaborDiscount] = useState(String(quote.labor_discount_pct || ''))
  const [materialDiscount, setMaterialDiscount] = useState(String(quote.material_discount_pct || ''))
  // Fixpreis (brutto inkl. MwSt). Leer = keiner; gesetzt ersetzt er den Material-Rabattsatz.
  const [fixedPrice, setFixedPrice] = useState(quote.fixed_price != null ? String(quote.fixed_price) : '')
  // Gespeicherter %-Satz = Skonto war an. Ein eigenes DB-Feld braucht es dafür nicht:
  // quotes.skonto_pct IS NULL ist seit jeher die Aussage "kein Skonto".
  const [skontoActive, setSkontoActive] = useState(quote.skonto_pct != null)
  const [skontoPct, setSkontoPct] = useState(quote.skonto_pct != null ? String(quote.skonto_pct) : '')
  const [skontoDays, setSkontoDays] = useState(quote.skonto_days != null ? String(quote.skonto_days) : '')
  const [skontoError, setSkontoError] = useState('')
  const [notes, setNotes] = useState(quote.notes || '')
  const [productDescription, setProductDescription] = useState(quote.product_description || '')
  // Kunde der Offerte: beim Erstellen vom Projekt übernommen, hier unabhängig davon
  // änderbar. Ein Wechsel hängt nur diese Offerte um — Projekt, Rapporte und
  // Rechnungen bleiben, wo sie sind.
  const [customerId, setCustomerId] = useState(quote.customer_id ?? '')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materialSupplierFilter, setMaterialSupplierFilter] = useState('')
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const pdf = useQuotePdfImport((confirmed: ConfirmedExtraProduct[]) => {
    extraProducts.append(confirmed.map(c => ({
      description: c.description,
      quantity: String(c.quantity),
      unit: c.unit,
      unit_price: String(c.unit_price),
      ek: String(c.ek_price),
      margin_pct: String(factorToPct(c.margin_factor)),
      supplier_id: c.supplier_id,
      category: c.category,
      positions: c.positions,
    })))
  })

  // Verschieben (Griff + ▲/▼) für Material- und Freie-Positions-Zeilen.
  const materialReorder = useReorder(material.set)
  const extraReorder = useReorder(extraProducts.set)

  useEffect(() => { getAllCustomers().then(setCustomers).catch(() => {}) }, [])

  // ── Dirty-Check ──
  // Anders als beim Erstellen gibt es hier keinen localStorage-Entwurf: was in
  // dieser Maske steht, existiert nur im State. Der Aufrufer (Projekt-Dialog)
  // erfährt darüber, ob ein Klick neben das Fenster etwas wegwerfen würde.
  // Alle Felder stammen aus `quote` und werden nicht nachgeladen — der erste
  // Render taugt darum als Vergleichswert.
  const editSnapshot = JSON.stringify({
    laborRows: labor.rows, materialRows: material.rows, extraProducts: extraProducts.rows,
    extraCharges: extraCharges.rows, travelRows: travel.rows, installationRows: installation.rows,
    specialRows: special.rows, laborDiscount, materialDiscount, fixedPrice, skontoActive, skontoPct,
    skontoDays, notes, productDescription, customerId,
  })
  // useState statt useRef: der Startwert wird nur beim ersten Render berechnet
  // und darf im Render gelesen werden.
  const [initialSnapshot] = useState(editSnapshot)
  const isDirty = editSnapshot !== initialSnapshot
  useEffect(() => { onDirtyChange?.(isDirty) }, [isDirty, onDirtyChange])

  // Katalog-Material an die (Freitext-)Materialliste anhängen: art_nr wird beim
  // Bearbeiten NICHT gespeichert (das PATCH erwartet aufgelöste Zeilen), daher lösen
  // wir Name + VK (calc_vk, sonst unit_price) client-seitig auf.
  function addCatalogMaterial(artNr: string) {
    const m = master.materials.find(x => String(x.art_nr) === String(artNr))
    if (!m) return
    material.add({
      description: m.name,
      quantity: '1',
      unit: m.unit || 'Stk',
      unit_price: String(m.calc_vk ?? m.unit_price ?? 0),
    })
  }

  async function handleSave() {
    // Wie im Erstell-Formular: angehaktes, aber leeres Skonto ist ein Fehler, kein
    // stilles "kein Skonto". Vor setSaving, damit der Knopf nicht kurz blockiert.
    const skontoMsg = skontoValidationError(skontoActive, skontoPct, skontoDays)
    if (skontoMsg) { setSkontoError(skontoMsg); setError(skontoMsg); return }
    setSkontoError('')
    setSaving(true)
    setError('')
    try {
      const updated = await updateQuote(quote.id, buildEditQuotePayload({
        laborRows: labor.rows,
        materialRows: material.rows,
        extraProducts: extraProducts.rows,
        extraCharges: extraCharges.rows,
        travelRows: travel.rows,
        installationRows: installation.rows,
        specialRows: special.rows,
        laborDiscount, materialDiscount, fixedPrice,
        skontoActive, skontoPct, skontoDays, notes, productDescription, customerId,
      }))
      // Per OCR eingelesene Lieferanten-PDFs als Projekt-Datei ablegen (Kategorie
      // 'bestellungen'). Best-effort — die Offerte ist zu diesem Zeitpunkt gespeichert.
      if (quote.project_id && pdf.hasSupplierDocs) await pdf.fileSupplierDocs(quote.project_id)
      onDone(updated.fixed_price_missed ? `Gespeichert — aber der Fixpreis geht nicht auf: Total der Offerte ist CHF ${fmtCHF(updated.total_amount ?? 0)}, nicht der eingegebene Fixpreis. Bitte prüfen.` : undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onCancel} disabled={saving} style={{ marginBottom: 12 }}>← Zurück</button>
      <h3 style={{ margin: '0 0 4px' }}>Offerte bearbeiten</h3>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>{quote.quote_number} · {quote.project_name}</div>

      {error && <div className="admin-alert admin-alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Kunde — eigenständig gegenüber dem Projektkunden. overflow:visible, damit
          das Combobox-Dropdown nicht am fieldset abgeschnitten wird. */}
      <fieldset style={{ ...FIELDSET_STYLE, overflow: 'visible' }}>
        <legend style={LEGEND_STYLE}>Kunde</legend>
        <div className="admin-form-group">
          <label className="admin-form-label">
            Rechnungsempfänger
            <InfoHint text="Gilt nur für diese Offerte. Ein Wechsel hängt das Projekt nicht um — Rapporte und Rechnungen bleiben beim Projektkunden." />
          </label>
          <CustomerCombobox customers={customers} value={customerId} onChange={setCustomerId} />
          {!customerId && quote.customer_name && (
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)' }}>
              Aktuell auf der Offerte: <strong>{quote.customer_name}</strong> — noch keinem
              Kundenstamm-Eintrag zugeordnet. Ohne Auswahl bleibt dieser Text stehen.
            </div>
          )}
        </div>
      </fieldset>

      <LaborFieldset
        rows={labor.rows}
        roles={master.roles}
        montageEnabled={master.montageEnabled}
        onRoleChange={(i, name) => {
          const role = master.roles.find(r => r.name === name)
          labor.update(i, role
            ? { description: name, unit_price: String(role.hourly_rate) }
            : { description: name })
        }}
        onQuantityChange={(i, v) => labor.update(i, { quantity: v })}
        onHiddenChange={(i, v) => labor.update(i, { hidden: v })}
        onRemove={labor.remove}
        onAdd={() => labor.add({ description: '', quantity: '', unit_price: '', hidden: false })}
        rateField={(row, i) => (
          <input className="admin-form-input" style={{ flex: 1 }} placeholder="CHF/h" value={row.unit_price}
            onChange={e => labor.update(i, { unit_price: e.target.value })} />
        )}
      />

      {/* Material: aufgelöste Zeilen. Der Katalog hängt unten als Picker dran —
          er löst Name und VK client-seitig auf, weil das PATCH keine art_nr kennt. */}
      <fieldset style={FIELDSET_STYLE}>
        <MaterialLegend />
        {material.rows.map((row, i) => (
          <div key={i} className="quote-row" {...materialReorder.rowProps(i)}>
            <RowReorder index={i} count={material.rows.length} moveRow={materialReorder.moveRow} handleProps={materialReorder.handleProps} />
            <AutoGrowTextarea className="admin-form-input quote-main" style={{ flex: 3, minWidth: 180 }} placeholder="Bezeichnung" value={row.description}
              onChange={v => material.update(i, { description: v })} />
            <input className="admin-form-input" style={{ flex: 1, minWidth: 60 }} placeholder="Menge" value={row.quantity}
              onChange={e => material.update(i, { quantity: e.target.value })} />
            <input className="admin-form-input" style={{ flex: 1, minWidth: 60 }} placeholder="Einheit" value={row.unit}
              onChange={e => material.update(i, { unit: e.target.value })} />
            <input className="admin-form-input" style={{ flex: 1, minWidth: 80 }} placeholder="CHF/Stk" value={row.unit_price}
              onChange={e => material.update(i, { unit_price: e.target.value })} />
            {master.optionalEnabled && (
              <label style={CHECKBOX_LABEL_STYLE} title={OPTIONAL_HINT}>
                <input type="checkbox" checked={!!row.optional} onChange={e => material.update(i, { optional: e.target.checked })} />
                Option
              </label>
            )}
            <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => material.remove(i)}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
          <button className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => material.add({ description: '', quantity: '', unit: 'Stk', unit_price: '' })}>+ Materialposition</button>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <MaterialFilters
              supplierOptions={master.supplierOptions}
              categories={master.categories}
              supplierFilter={materialSupplierFilter}
              categoryFilter={materialCategoryFilter}
              onSupplierChange={setMaterialSupplierFilter}
              onCategoryChange={setMaterialCategoryFilter}
              labelled
            />
            <div style={{ flexBasis: '100%', minWidth: 220 }}>
              <MaterialCombobox
                materials={master.materials}
                supplierMap={master.supplierMap}
                supplierFilter={materialSupplierFilter}
                categoryFilter={materialCategoryFilter}
                value=""
                onChange={artNr => { if (artNr) addCatalogMaterial(artNr) }}
              />
            </div>
          </div>
        </div>
      </fieldset>

      <ExtraProductsFieldset
        rows={extraProducts.rows}
        optionalEnabled={master.optionalEnabled}
        reorder={extraReorder}
        onUpdate={extraProducts.update}
        onRemove={extraProducts.remove}
        onAdd={() => extraProducts.add({ description: '', quantity: '1', unit: 'Stk', unit_price: '' })}
        uploading={pdf.uploading}
        pdfError={pdf.pdfError}
        fileRef={pdf.fileRef}
        onPickPdf={pdf.handlePdfUpload}
      />

      <DescPriceFieldset
        title="Sonderaufwände"
        rows={extraCharges.rows}
        onChange={extraCharges.reset}
        addLabel="+ Sonderaufwand"
      />

      <DescPriceFieldset
        title="Fahrtkosten"
        rows={travel.rows}
        onChange={travel.reset}
        addLabel="+ Fahrtkosten"
        defaultDescription="Fahrtpauschale"
      />

      <InstallationFieldset
        rows={installation.rows}
        templates={master.installationTemplates}
        onChange={installation.reset}
      />

      {/* Sonderpositionen: rendert wenn Feature aktiv ODER bereits Positionen
          vorhanden sind — eine alte Offerte darf ihre Zeilen nicht verlieren,
          nur weil das Flag inzwischen aus ist. */}
      {(master.specialEnabled || special.rows.length > 0) && (
        <SpecialPositionsFieldset
          rows={special.rows}
          templates={master.specialTemplates}
          onChange={special.reset}
        />
      )}

      <DiscountsFieldset
        laborDiscount={laborDiscount}
        materialDiscount={materialDiscount}
        fixedPrice={fixedPrice}
        onLaborChange={setLaborDiscount}
        onMaterialChange={setMaterialDiscount}
        onFixedPriceChange={setFixedPrice}
      />

      <SkontoFieldset
        skontoActive={skontoActive}
        skontoPct={skontoPct}
        skontoDays={skontoDays}
        error={skontoError}
        onActiveChange={v => { setSkontoActive(v); setSkontoError('') }}
        onPctChange={v => { setSkontoPct(v); setSkontoError('') }}
        onDaysChange={v => { setSkontoDays(v); setSkontoError('') }}
      />

      <QuoteTextFields
        productDescription={productDescription}
        notes={notes}
        onProductDescriptionChange={setProductDescription}
        onNotesChange={setNotes}
        notesPlaceholder="Optionale Bemerkungen…"
      />

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Wird gespeichert…' : 'Änderungen speichern'}
        </button>
        <button className="admin-btn admin-btn-secondary" onClick={onCancel} disabled={saving}>Abbrechen</button>
      </div>

      {pdf.pdfReview && (
        <PdfExtractionReviewModal
          data={pdf.pdfReview}
          mode="pdf"
          suppliers={master.suppliers}
          pricingRules={master.pricingRules}
          onCancel={pdf.cancelReview}
          onConfirm={pdf.confirmReview}
        />
      )}
    </div>
  )
}

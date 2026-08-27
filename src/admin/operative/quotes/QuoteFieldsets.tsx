// Sektionen, die Erstellen und Bearbeiten teilen (Charge H2).
//
// Dieselben Positionsarten standen zweimal als JSX im QuotesScreen — ein Feld,
// das nur in einer Maske korrigiert wurde, hätte die beiden Offert-Wege still
// auseinanderlaufen lassen. Was hier steht, rendern beide Masken.
//
// Zwei Sektionen bleiben absichtlich draussen: die Materialliste (Erstellen
// wählt Katalog-Artikel über die Artikelnummer, Bearbeiten hat aufgelöste
// Freitextzeilen) und die Bemerkungen (nur das Erstellen hat die
// Standardtext-Checkbox).

import type { ReactNode } from 'react'
import { InfoHint } from '../../components/InfoHint'
import { fmtCHF } from '../../utils/format'
import { RichTextField } from '../../components/RichTextField'
import { SpellcheckTextarea } from '../SpellcheckTextarea'
import { AutoGrowTextarea, RowReorder } from '../QuoteRowControls'
import type { Reorder } from '../QuoteRowControls'
import type { InstallationTpl, InstallationRow, SpecialMode, SpecialRow, SpecialTpl, StaffRole, Supplier } from './quoteTypes'

export const FIELDSET_STYLE: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20,
}
const LEGEND_STYLE: React.CSSProperties = { fontWeight: 600, padding: '0 8px' }
const CHECKBOX_LABEL_STYLE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, whiteSpace: 'nowrap',
}
const BUTTON_ROW_STYLE: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }

const OPTIONAL_HINT = 'Eventualposition — nicht im Total, erscheint mit Preis auf der Offerte'

// ─── Lohn ───────────────────────────────────────────────────

interface LaborRowView { description: string; quantity: string; hidden?: boolean }

interface LaborFieldsetProps<T extends LaborRowView> {
  rows: T[]
  roles: StaffRole[]
  montageEnabled: boolean
  onRoleChange: (i: number, name: string) => void
  onQuantityChange: (i: number, v: string) => void
  onHiddenChange: (i: number, v: boolean) => void
  onRemove: (i: number) => void
  onAdd: () => void
  /** Bearbeiten zeigt den Stundenansatz als eigenes Feld — die gespeicherte
   *  Offerte kennt die Funktion nicht mehr, aus der er beim Erstellen kommt. */
  rateField?: (row: T, i: number) => ReactNode
  /** Erstellen lässt die letzte Zeile stehen (leeres Formular braucht eine),
   *  Bearbeiten erlaubt das vollständige Leeren. */
  keepLastRow?: boolean
}

export function LaborFieldset<T extends LaborRowView>({
  rows, roles, montageEnabled, onRoleChange, onQuantityChange, onHiddenChange,
  onRemove, onAdd, rateField, keepLastRow = false,
}: LaborFieldsetProps<T>) {
  return (
    <fieldset style={FIELDSET_STYLE}>
      <legend style={LEGEND_STYLE}>Lohnpositionen</legend>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <select
            className="admin-form-select"
            style={{ flex: 2 }}
            value={row.description}
            onChange={e => onRoleChange(i, e.target.value)}
          >
            <option value="">Funktion wählen…</option>
            {roles.map(r => (
              <option key={r.name} value={r.name}>
                {r.name}{r.job_title ? ` — ${r.job_title}` : ''} ({fmtCHF(r.hourly_rate)}/h)
              </option>
            ))}
          </select>
          <input
            className="admin-form-input"
            style={{ flex: 1 }}
            placeholder="Stunden"
            value={row.quantity}
            onChange={e => onQuantityChange(i, e.target.value)}
          />
          {rateField?.(row, i)}
          {montageEnabled && (
            <label style={CHECKBOX_LABEL_STYLE} title="Dem Kunden nicht als eigene Zeile zeigen — in die Produktpreise einrechnen">
              <input type="checkbox" checked={!!row.hidden} onChange={e => onHiddenChange(i, e.target.checked)} />
              verstecken
            </label>
          )}
          {(!keepLastRow || rows.length > 1) && (
            <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => onRemove(i)} title="Entfernen">✕</button>
          )}
        </div>
      ))}
      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onAdd}>+ Lohnposition</button>
    </fieldset>
  )
}

// ─── Material-Filter ────────────────────────────────────────

/** Lieferant + Artikelgruppe grenzen die Katalog-Auswahl ein (Materialstämme
 *  haben je nach Mandant mehrere tausend Artikel). Rein optional. */
export function MaterialFilters({
  supplierOptions, categories, supplierFilter, categoryFilter, onSupplierChange, onCategoryChange, labelled = false,
}: {
  supplierOptions: Supplier[]
  categories: string[]
  supplierFilter: string
  categoryFilter: string
  onSupplierChange: (v: string) => void
  onCategoryChange: (v: string) => void
  labelled?: boolean
}) {
  return (
    <>
      <select
        className="admin-form-select"
        style={{ flex: 1, minWidth: 160 }}
        aria-label={labelled ? 'Lieferant filtern' : undefined}
        value={supplierFilter}
        onChange={e => onSupplierChange(e.target.value)}
      >
        <option value="">Alle Lieferanten</option>
        {supplierOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select
        className="admin-form-select"
        style={{ flex: 1, minWidth: 160 }}
        aria-label={labelled ? 'Artikelgruppe filtern' : undefined}
        value={categoryFilter}
        onChange={e => onCategoryChange(e.target.value)}
      >
        <option value="">Alle Artikelgruppen</option>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </>
  )
}

// ─── Weitere Produkte / Freie Positionen ────────────────────

interface ExtraRowView {
  description: string
  quantity: string
  unit: string
  unit_price: string
  ek?: string
  margin_pct?: string
  optional?: boolean
}

interface ExtraProductsFieldsetProps<T extends ExtraRowView> {
  rows: T[]
  optionalEnabled: boolean
  reorder: Reorder
  onUpdate: (i: number, patch: Partial<T>) => void
  onRemove: (i: number) => void
  onAdd: () => void
  // PDF-Import (useQuotePdfImport)
  uploading: boolean
  pdfError: string
  fileRef: React.RefObject<HTMLInputElement | null>
  onPickPdf: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** Nur beim Erstellen: «Manuell erfassen» öffnet dieselbe Prüf-Maske ohne PDF. */
  extraActions?: ReactNode
}

export function ExtraProductsFieldset<T extends ExtraRowView>({
  rows, optionalEnabled, reorder, onUpdate, onRemove, onAdd,
  uploading, pdfError, fileRef, onPickPdf, extraActions,
}: ExtraProductsFieldsetProps<T>) {
  return (
    <fieldset style={FIELDSET_STYLE}>
      <legend style={LEGEND_STYLE}>Weitere Produkte / Freie Positionen</legend>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
        EK + Aufschlag % füllen den Preis automatisch (aufgerundet auf 0.05). EK leer lassen, um den Preis direkt einzutippen. „Option" markiert eine Eventualposition (erscheint auf der Offerte, zählt nicht ins Total).
      </p>
      {rows.map((row, i) => (
        <div key={i} className="quote-row" {...reorder.rowProps(i)}>
          <RowReorder index={i} count={rows.length} moveRow={reorder.moveRow} handleProps={reorder.handleProps} />
          <AutoGrowTextarea className="admin-form-input quote-main" style={{ flex: 3, minWidth: 160 }} placeholder="Beschreibung"
            value={row.description} onChange={v => onUpdate(i, { description: v } as Partial<T>)} />
          <input className="admin-form-input" style={{ flex: 1, minWidth: 55 }} placeholder="Menge" value={row.quantity}
            onChange={e => onUpdate(i, { quantity: e.target.value } as Partial<T>)} />
          <input className="admin-form-input" style={{ flex: 1, minWidth: 55 }} placeholder="Einheit" value={row.unit}
            onChange={e => onUpdate(i, { unit: e.target.value } as Partial<T>)} />
          <input className="admin-form-input" style={{ flex: 1, minWidth: 65 }} placeholder="EK" value={row.ek ?? ''}
            title="Einkaufspreis (optional) — füllt mit dem Aufschlag den Preis automatisch"
            onChange={e => onUpdate(i, { ek: e.target.value } as Partial<T>)} />
          <input className="admin-form-input" style={{ flex: 1, minWidth: 55 }} placeholder="Auf. %" value={row.margin_pct ?? ''}
            title="Aufschlag in % auf den EK"
            onChange={e => onUpdate(i, { margin_pct: e.target.value } as Partial<T>)} />
          <input className="admin-form-input" style={{ flex: 1, minWidth: 75 }} placeholder="Preis/Stk" value={row.unit_price}
            title={row.ek?.trim() ? 'Verkaufspreis (aus EK × Aufschlag; überschreibbar)' : 'Verkaufspreis pro Stück'}
            onChange={e => onUpdate(i, { unit_price: e.target.value } as Partial<T>)} />
          {optionalEnabled && (
            <label style={CHECKBOX_LABEL_STYLE} title={OPTIONAL_HINT}>
              <input type="checkbox" checked={!!row.optional} onChange={e => onUpdate(i, { optional: e.target.checked } as Partial<T>)} />
              Option
            </label>
          )}
          <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => onRemove(i)} title="Entfernen">✕</button>
        </div>
      ))}
      <div style={{ ...BUTTON_ROW_STYLE, alignItems: 'center', marginTop: 4 }}>
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onAdd}>+ Freie Position</button>
        {extraActions}
        {/* Lieferanten-PDF per OCR einlesen (Griesser/Stobag) — die erkannten
            Produkte landen nach dem Review als Zeilen hier. */}
        <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={onPickPdf} disabled={uploading} />
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? 'Wird extrahiert…' : 'Lieferanten-PDF hochladen'}
        </button>
      </div>
      {pdfError && (
        <div className="admin-alert admin-alert-error" role="alert" style={{ marginTop: 8 }}>{pdfError}</div>
      )}
    </fieldset>
  )
}

// ─── Montage ────────────────────────────────────────────────

export function InstallationFieldset({ rows, templates, onChange }: {
  rows: InstallationRow[]
  templates: InstallationTpl[]
  onChange: (rows: InstallationRow[]) => void
}) {
  const update = (i: number, patch: Partial<InstallationRow>) =>
    onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  return (
    <fieldset style={FIELDSET_STYLE}>
      <legend style={LEGEND_STYLE}>Montagepositionen</legend>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input className="admin-form-input" style={{ flex: 3 }} placeholder="Beschreibung" value={row.description}
            onChange={e => update(i, { description: e.target.value })} />
          <input className="admin-form-input" style={{ flex: 1 }} placeholder="Betrag CHF" value={row.unit_price}
            onChange={e => update(i, { unit_price: e.target.value })} />
          <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} title="Entfernen">✕</button>
        </div>
      ))}
      <div style={BUTTON_ROW_STYLE}>
        {templates.map(tpl => (
          <button key={tpl.id} className="admin-btn admin-btn-secondary admin-btn-sm" title={tpl.notes ?? undefined}
            onClick={() => onChange([...rows, { description: tpl.label, unit_price: String(tpl.default_fee) }])}>
            + {tpl.label} (CHF {tpl.default_fee})
          </button>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => onChange([...rows, { description: '', unit_price: '' }])}>+ Manuell</button>
      </div>
    </fieldset>
  )
}

// ─── Sonderpositionen (Demontage / Entsorgung) ──────────────

export function SpecialPositionsFieldset({ rows, templates, onChange }: {
  rows: SpecialRow[]
  templates: SpecialTpl[]
  onChange: (rows: SpecialRow[]) => void
}) {
  const update = (i: number, patch: Partial<SpecialRow>) =>
    onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  return (
    <fieldset style={FIELDSET_STYLE}>
      <legend style={LEGEND_STYLE}>Sonderpositionen</legend>
      {rows.map((row, i) => (
        <div key={i} className="quote-row">
          <input className="admin-form-input" style={{ flex: 3, minWidth: 160 }} placeholder="Beschreibung" value={row.description}
            onChange={e => update(i, { description: e.target.value })} />
          <select className="admin-form-select" style={{ flex: 1, minWidth: 120 }} value={row.mode}
            onChange={e => update(i, { mode: e.target.value as SpecialMode })}>
            <option value="pauschal">Pauschale</option>
            <option value="stunden">Stundenansatz</option>
          </select>
          {row.mode === 'stunden' ? (
            <>
              <input className="admin-form-input" style={{ flex: 1, minWidth: 70 }} placeholder="Stunden" value={row.hours}
                onChange={e => update(i, { hours: e.target.value })} />
              <input className="admin-form-input" style={{ flex: 1, minWidth: 80 }} placeholder="CHF/h" value={row.unit_price}
                onChange={e => update(i, { unit_price: e.target.value })} />
            </>
          ) : (
            <input className="admin-form-input" style={{ flex: 1, minWidth: 90 }} placeholder="Betrag CHF" value={row.unit_price}
              onChange={e => update(i, { unit_price: e.target.value })} />
          )}
          <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} title="Entfernen">✕</button>
        </div>
      ))}
      <div style={BUTTON_ROW_STYLE}>
        {templates.map(tpl => (
          <button key={tpl.id} className="admin-btn admin-btn-secondary admin-btn-sm" title={tpl.notes ?? undefined}
            onClick={() => onChange([...rows, {
              description: tpl.label,
              mode: tpl.pricing_mode,
              unit_price: String(tpl.default_fee),
              hours: tpl.default_hours != null ? String(tpl.default_hours) : '',
            }])}>
            + {tpl.label} ({tpl.pricing_mode === 'stunden' ? `CHF ${tpl.default_fee}/h` : `CHF ${tpl.default_fee}`})
          </button>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => onChange([...rows, { description: '', mode: 'pauschal', unit_price: '', hours: '' }])}>+ Manuell</button>
      </div>
    </fieldset>
  )
}

/** Die Info-Blase über der Materialliste — in beiden Masken derselbe Text. */
export function MaterialLegend() {
  return (
    <legend style={LEGEND_STYLE}>
      Materialpositionen
      <InfoHint text="Menge je Position erfassen. Eine als Option markierte Zeile ist eine Eventualposition: erscheint mit Preis auf der Offerte, zählt aber nicht ins Total." />
    </legend>
  )
}

// ─── Produktbeschreibung und Bemerkungen ────────────────────

/** Die beiden Textblöcke am Fuss beider Masken. Die Checkbox «Standard-Bemerkungen
 *  verwenden» gibt es nur beim Erstellen — beim Bearbeiten steht dort der Text,
 *  der auf der Offerte steht, und der Mandanten-Standard hat nichts mehr zu suchen. */
export function QuoteTextFields({
  productDescription, notes, onProductDescriptionChange, onNotesChange, notesPlaceholder, standardNotes,
}: {
  productDescription: string
  notes: string
  onProductDescriptionChange: (v: string) => void
  onNotesChange: (v: string) => void
  notesPlaceholder: string
  standardNotes?: { checked: boolean; onChange: (on: boolean) => void }
}) {
  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <label className="admin-form-label">Produktbeschreibung</label>
        <SpellcheckTextarea value={productDescription} onChange={onProductDescriptionChange} placeholder="Beschreibung der angebotenen Produkte…" />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label className="admin-form-label">Bemerkungen</label>
        {standardNotes && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 'normal', cursor: 'pointer' }}>
            <input type="checkbox" checked={standardNotes.checked} onChange={e => standardNotes.onChange(e.target.checked)} />
            <span>Standard-Bemerkungen verwenden</span>
          </label>
        )}
        <RichTextField value={notes} onChange={onNotesChange} placeholder={notesPlaceholder} />
      </div>
    </>
  )
}

// ─── Fahrspesen (nur beim Erstellen) ────────────────────────

/** Beim Erstellen kommt die Pauschale aus der Projektdistanz und der wirksamen
 *  Staffelung des Mandanten; beim Bearbeiten sind Fahrtkosten normale Zeilen. */
export function TravelCostFieldset({ distanceKm, amount, checked, onChange }: {
  distanceKm: number | null | undefined
  amount: number
  checked: boolean
  onChange: (v: boolean) => void
}) {
  const hasDistance = distanceKm !== null && distanceKm !== undefined
  return (
    <fieldset style={FIELDSET_STYLE}>
      <legend style={LEGEND_STYLE}>Fahrspesen</legend>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: hasDistance ? 'pointer' : 'not-allowed', opacity: hasDistance ? 1 : 0.6 }}>
        <input
          type="checkbox"
          checked={checked && hasDistance}
          disabled={!hasDistance}
          onChange={e => onChange(e.target.checked)}
        />
        <span>
          Fahrspesen einrechnen
          {hasDistance ? (
            <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
              ({distanceKm} km → {fmtCHF(amount)})
            </span>
          ) : (
            <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
              — Distanz beim Projekt fehlt, bitte zuerst dort eintragen
            </span>
          )}
        </span>
      </label>
    </fieldset>
  )
}

export { CHECKBOX_LABEL_STYLE, LEGEND_STYLE, OPTIONAL_HINT, BUTTON_ROW_STYLE }

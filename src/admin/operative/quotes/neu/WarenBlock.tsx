// Block «Waren» der Maske «Offerte neu»: Katalog-Artikel und freie Positionen (von
// Hand, «Manuell erfassen» oder Lieferanten-PDF) in einem Block — für Rabatt und
// Rohertrag sind sie dasselbe. Gespeichert wird weiter getrennt (material_items /
// extra_product_items), damit das PDF und die Bearbeiten-Maske unverändert bleiben.

import { useState } from 'react'
import { MaterialCombobox } from '../../MaterialCombobox'
import { AutoGrowTextarea } from '../../QuoteRowControls'
import type { Reorder } from '../../QuoteRowControls'
import { lineTotal, parseNum, round2 } from '../../../utils/quotePricing'
import { fmtCHF } from '../../../utils/format'
import { MaterialFilters } from '../QuoteFieldsets'
import type { QuoteMasterData } from '../useQuoteMasterData'
import type { RowList } from '../useRowList'
import type { ExtraProductRow, MaterialRow } from '../quoteTypes'
import { BlockKopf, Feld, Marke, Rechenwert, ZeilenMenu } from './Bausteine'
import type { MenuAktion } from './Bausteine'

/** Lieferanten-PDF und «Mit Unter-Positionen» (useQuotePdfImport) — einzeln
 *  durchgereicht wie bei ExtraProductsFieldset, nicht als ganzes Hook-Objekt: es trägt
 *  eine Ref, und die darf beim Rendern nicht gelesen werden (react-hooks/refs). Die
 *  Ref selbst kommt deshalb als eigenes Prop (`pdfFileRef`). */
export interface PdfEinlesen {
  uploading: boolean
  pdfError: string
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void
  onManuell: () => void
}

const LEERE_KATALOGZEILE: MaterialRow = { art_nr: '', quantity: '' }
const LEERE_FREIE_ZEILE: ExtraProductRow = { description: '', quantity: '1', unit: 'Stk', unit_price: '' }

/** Verschieben + Option + Entfernen als Menü-Aktionen einer Zeile. */
function zeilenAktionen(i: number, anzahl: number, reorder: Reorder, opts: {
  optionalEnabled: boolean; optional: boolean; onOptional: (v: boolean) => void; onRemove: () => void
}): MenuAktion[] {
  return [
    { label: 'Nach oben', disabled: i === 0, onClick: () => reorder.moveRow(i, i - 1) },
    { label: 'Nach unten', disabled: i === anzahl - 1, onClick: () => reorder.moveRow(i, i + 1) },
    ...(opts.optionalEnabled ? [{
      label: 'Option (nicht im Total)', an: opts.optional, onClick: () => opts.onOptional(!opts.optional),
    }] : []),
    { label: 'Entfernen', gefahr: true, onClick: opts.onRemove },
  ]
}

export function WarenBlock({
  material, extraProducts, master, materialReorder, extraReorder, katalogPreise, summe, rabattHinweis, pdf, pdfFileRef,
}: {
  material: RowList<MaterialRow>
  extraProducts: RowList<ExtraProductRow>
  master: QuoteMasterData
  materialReorder: Reorder
  extraReorder: Reorder
  /** art_nr → Verkaufspreis laut Vorschau (massgeblich); sonst der VK des Katalogs. */
  katalogPreise: Map<string, number>
  summe: number | null
  rabattHinweis?: string
  pdf: PdfEinlesen
  pdfFileRef: React.RefObject<HTMLInputElement | null>
}) {
  const [filterOffen, setFilterOffen] = useState(false)
  const [lieferant, setLieferant] = useState('')
  const [gruppe, setGruppe] = useState('')
  const filterAktiv = !!(lieferant || gruppe)

  return (
    <section className="on-block" aria-label="Waren">
      <BlockKopf titel="Waren" summe={summe} hinweis={rabattHinweis} />

      {material.rows.map((row, i) => {
        const mat = master.materials.find(m => m.art_nr === row.art_nr)
        const preis = row.art_nr ? (katalogPreise.get(row.art_nr) ?? mat?.calc_vk ?? mat?.unit_price ?? null) : null
        const total = preis == null ? null : lineTotal(parseNum(row.quantity), preis)
        return (
          <div key={`k${i}`} className="on-karte" {...materialReorder.rowProps(i)}>
            <div className="on-karte-kopf">
              <MaterialCombobox
                materials={master.materials}
                supplierMap={master.supplierMap}
                supplierFilter={lieferant}
                categoryFilter={gruppe}
                value={row.art_nr}
                onChange={artNr => material.update(i, { art_nr: artNr })}
                className="on-karte-haupt"
              />
              <Marke>Katalog</Marke>
              <ZeilenMenu aktionen={zeilenAktionen(i, material.rows.length, materialReorder, {
                optionalEnabled: master.optionalEnabled, optional: !!row.optional,
                onOptional: v => material.update(i, { optional: v }), onRemove: () => material.remove(i),
              })} />
            </div>
            <div className="on-felder on-felder-3">
              <Feld label={`Menge${mat?.unit ? ` (${mat.unit})` : ''}`} zahl value={row.quantity}
                onChange={v => material.update(i, { quantity: v })} />
              <Rechenwert label="Preis" betrag={preis} />
              <Rechenwert label="Total" betrag={total} />
            </div>
            {row.optional && <p className="on-karte-fuss"><Marke ton="warn">Option</Marke>erscheint mit Preis auf der Offerte, zählt nicht ins Total</p>}
          </div>
        )
      })}

      {extraProducts.rows.map((row, i) => {
        const ek = parseNum(row.ek ?? '')
        const preis = parseNum(row.unit_price)
        const menge = parseNum(row.quantity)
        const vonLieferant = !!(row.supplier_id || row.positions?.length)
        return (
          <div key={`f${i}`} className="on-karte" {...extraReorder.rowProps(i)}>
            <div className="on-karte-kopf">
              <AutoGrowTextarea className="admin-form-input on-karte-haupt" placeholder="Bezeichnung"
                value={row.description} onChange={v => extraProducts.update(i, { description: v })} />
              <Marke ton="akzent">{vonLieferant ? 'Lieferant' : 'Frei'}</Marke>
              <ZeilenMenu aktionen={zeilenAktionen(i, extraProducts.rows.length, extraReorder, {
                optionalEnabled: master.optionalEnabled, optional: !!row.optional,
                onOptional: v => extraProducts.update(i, { optional: v }), onRemove: () => extraProducts.remove(i),
              })} />
            </div>
            <div className="on-felder on-felder-3">
              <Feld label="Menge" zahl value={row.quantity} onChange={v => extraProducts.update(i, { quantity: v })} />
              <Feld label="Einheit" value={row.unit} onChange={v => extraProducts.update(i, { unit: v })} />
              <Feld label="EK" zahl value={row.ek ?? ''} placeholder="optional"
                title="Einkaufspreis — füllt mit dem Aufschlag den Preis (aufgerundet auf 0.05)"
                onChange={v => extraProducts.update(i, { ek: v })} />
              <Feld label="Aufschlag %" zahl value={row.margin_pct ?? ''}
                onChange={v => extraProducts.update(i, { margin_pct: v })} />
              <Feld label="Preis/Einheit" zahl value={row.unit_price} berechnet={ek > 0}
                title={ek > 0 ? 'Aus EK × Aufschlag — überschreibbar' : 'Verkaufspreis je Einheit'}
                onChange={v => extraProducts.update(i, { unit_price: v })} />
              <Rechenwert label="Total" betrag={row.unit_price.trim() ? lineTotal(menge, preis) : null} />
            </div>
            {(ek > 0 && preis > 0) || row.optional ? (
              <p className="on-karte-fuss">
                {row.optional && <Marke ton="warn">Option</Marke>}
                {ek > 0 && preis > 0 && <>Marge {fmtCHF(round2(preis - ek))} je {row.unit || 'Einheit'}</>}
              </p>
            ) : null}
          </div>
        )
      })}

      <div className="on-knoepfe">
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => material.add({ ...LEERE_KATALOGZEILE })}>+ Katalog-Artikel</button>
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => extraProducts.add({ ...LEERE_FREIE_ZEILE })}>+ Freie Position</button>
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={pdf.onManuell}
          title="Produkt mit Einkaufspreis, Aufschlag und Unter-Positionen erfassen — wie beim PDF, nur von Hand">
          + Mit Unter-Positionen
        </button>
        <input ref={pdfFileRef} type="file" accept=".pdf" hidden onChange={pdf.onPick} disabled={pdf.uploading} />
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={pdf.uploading}
          onClick={() => pdfFileRef.current?.click()}>
          {pdf.uploading ? 'Wird gelesen…' : 'Lieferanten-PDF'}
        </button>
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm on-knopf-leise"
          aria-expanded={filterOffen} onClick={() => setFilterOffen(o => !o)}>
          Katalog filtern{filterAktiv ? ' ●' : ''}
        </button>
      </div>
      {filterOffen && (
        <div className="on-filter">
          <MaterialFilters supplierOptions={master.supplierOptions} categories={master.categories}
            supplierFilter={lieferant} categoryFilter={gruppe}
            onSupplierChange={setLieferant} onCategoryChange={setGruppe} labelled />
        </div>
      )}
      {pdf.pdfError && <div className="admin-alert admin-alert-error" role="alert">{pdf.pdfError}</div>}
    </section>
  )
}

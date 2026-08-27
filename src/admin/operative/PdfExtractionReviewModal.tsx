import { useEffect, useMemo, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { fmtCHF } from '../utils/format'
import { parseNum, vkFromEk, factorToPct, pctToFactor } from '../utils/quotePricing'

export interface ExtractedPosition {
  label: string
  ek_price: number
}

export interface ExtractedProduct {
  name: string
  description: string
  quantity: number
  unit: string
  // null = kein EK vorbelegt (manuelle Erfassung); OCR liefert immer eine Zahl.
  ek_price: number | null
  positions?: ExtractedPosition[]
  suggested_category: string | null
  suggested_margin_factor: number | null
  suggested_vk_price: number | null
}

export interface PricingRule {
  category: string
  margin_factor: number
}

/** Lieferant zur Auswahl im manuellen Modus. */
export interface SupplierOption {
  id: string
  name: string
}

/** Rohe Preisregel aus GET /pwa/admin/pricing-rules — über alle Lieferanten. */
export interface SupplierPricingRule {
  supplier_id: string
  category: string | null
  markup_pct: number | null
}

export interface PdfExtractionResponse {
  supplier: string
  supplier_label: string
  supplier_id: string | null
  project_ref: string
  products: ExtractedProduct[]
  available_pricing_rules?: PricingRule[]
}

// Metadaten der Positionsauswahl, die an der Produktzeile mitgespeichert werden.
export interface ConfirmedPosition {
  label: string
  ek_price: number
  selected: boolean
  separate: boolean
}

export interface ConfirmedExtraProduct {
  description: string
  quantity: string
  unit: string
  unit_price: string
  ek_price: number
  margin_factor: number
  supplier_id: string | null
  category: string | null
  positions?: ConfirmedPosition[]
}

export interface PositionState {
  label: string
  ek_price: string
  selected: boolean   // Häkchen: kommt überhaupt in die Offerte
  separate: boolean   // „separat ausweisen": wird eine eigene Offert-Zeile
}

export interface RowState {
  name: string
  description: string
  quantity: string
  unit: string
  ek_price: string  // nur relevant, wenn keine Positionen vorhanden (Griesser/manuell)
  category: string  // '' = keine Kategorie gewählt
  margin_pct: string
  positions: PositionState[]
}

interface Props {
  data: PdfExtractionResponse
  onCancel: () => void
  onConfirm: (rows: ConfirmedExtraProduct[]) => void
  /** 'pdf' = Review einer OCR-Extraktion (Default), 'manual' = freie Erfassung ohne PDF. */
  mode?: 'pdf' | 'manual'
  /** Nur manueller Modus: Lieferanten zur Auswahl (bestimmt die Warengruppen). */
  suppliers?: SupplierOption[]
  /** Nur manueller Modus: alle Preisregeln; werden nach gewähltem Lieferanten gefiltert. */
  pricingRules?: SupplierPricingRule[]
}

// EK der Produktzeile = Summe der angehakten, NICHT separat ausgewiesenen Positionen.
// Ohne Positionen (Griesser/manuell): das freie EK-Feld.
function productEk(row: RowState): number {
  if (row.positions.length === 0) return parseNum(row.ek_price)
  return row.positions
    .filter(p => p.selected && !p.separate)
    .reduce((sum, p) => sum + parseNum(p.ek_price), 0)
}

// Baut die finalen Offert-Zeilen aus EINER Produktkarte:
// 1 Produktzeile (EK = Summe nicht-separater Positionen) + N separate Zeilen.
// Exportiert für Unit-Tests — reine Funktion, keine React-Abhängigkeit.
export function buildConfirmedRow(row: RowState, supplierId: string | null): ConfirmedExtraProduct[] {
  const out: ConfirmedExtraProduct[] = []
  const pct = parseNum(row.margin_pct)
  const factor = pctToFactor(pct)
  const hasPositions = row.positions.length > 0
  const category = row.category || null

  // Produktzeile: immer ohne Positionen, sonst nur wenn ≥1 nicht-separate Position gewählt ist.
  // Ohne Bezeichnung entsteht keine Zeile — sonst zählt der „Übernehmen"-Button Zeilen mit,
  // die das Formular beim Speichern ohnehin wegfiltert.
  const includeProduct = !hasPositions || row.positions.some(p => p.selected && !p.separate)
  const fullDescription = [row.name.trim(), row.description.trim()].filter(Boolean).join(' — ')
  if (includeProduct && fullDescription) {
    const ek = productEk(row)
    const vk = vkFromEk(ek, pct)
    out.push({
      description: fullDescription,
      quantity: row.quantity || '1',
      unit: row.unit || 'Stk',
      unit_price: String(vk),
      ek_price: ek,
      margin_factor: factor,
      supplier_id: supplierId,
      category,
      positions: hasPositions
        ? row.positions.map(p => ({
            label: p.label,
            ek_price: parseNum(p.ek_price),
            selected: p.selected,
            separate: p.separate,
          }))
        : undefined,
    })
  }

  // Separate Zeilen: jede angehakte Position mit „separat ausweisen".
  // Produktname als Kontext voranstellen (z. B. „P206C.03, Lamisol III 70 Fix — Küche 1570×965").
  for (const p of row.positions) {
    if (p.selected && p.separate && p.label.trim()) {
      const ek = parseNum(p.ek_price)
      const vk = vkFromEk(ek, pct)
      out.push({
        description: [row.name.trim(), p.label.trim()].filter(Boolean).join(' — '),
        quantity: '1',
        unit: row.unit || 'Stk',
        unit_price: String(vk),
        ek_price: ek,
        margin_factor: factor,
        supplier_id: supplierId,
        category,
      })
    }
  }
  return out
}

function buildConfirmed(rows: RowState[], supplierId: string | null): ConfirmedExtraProduct[] {
  return rows.flatMap(row => buildConfirmedRow(row, supplierId))
}

// Stück-Sicht der Karte: alle erzeugten Zeilen (Produktzeile + separate Zeilen) zum
// jeweiligen Stückpreis. Speist die Felder „EK/VK — Summe gewählter Positionen" bzw.
// „… / Stk" — beide meinen einen Stückpreis, deshalb hier bewusst OHNE Menge. Auch
// wenn alle Positionen separat sind (Griesser) und die Produktzeile leer bleibt,
// steht so die Summe der Positionen da statt 0.
function cardTotals(row: RowState, supplierId: string | null): { ek: number; vk: number } {
  const lines = buildConfirmedRow(row, supplierId)
  const ek = lines.reduce((s, l) => s + l.ek_price, 0)
  const vk = lines.reduce((s, l) => s + parseNum(l.unit_price), 0)
  return { ek, vk }
}

// Was die Karte tatsächlich in die Offerte einbringt: jede erzeugte Zeile mit IHRER Menge.
// Nötig, weil die Menge nur an der Produktzeile hängt — separate Positionen sind eigene
// Zeilen à 1 Stk. Ohne diese Sicht zeigt eine Karte mit Menge 3 + separater Position eine
// Summe an, die weder Stückpreis noch Offert-Betrag ist.
// Exportiert für Unit-Tests — reine Funktion, keine React-Abhängigkeit.
export function cardOfferTotal(
  row: RowState, supplierId: string | null,
): { ek: number; vk: number; lines: number } {
  const lines = buildConfirmedRow(row, supplierId)
  const ek = lines.reduce((s, l) => s + l.ek_price * parseNum(l.quantity), 0)
  const vk = lines.reduce((s, l) => s + parseNum(l.unit_price) * parseNum(l.quantity), 0)
  return { ek, vk, lines: lines.length }
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--muted, #666)',
  marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4,
}

export function PdfExtractionReviewModal({
  data, onCancel, onConfirm,
  mode = 'pdf', suppliers = [], pricingRules = [],
}: Props) {
  const isManual = mode === 'manual'

  // PDF: Lieferant steht durch die OCR-Erkennung fest. Manuell: der Admin wählt ihn,
  // denn davon hängen die verfügbaren Warengruppen und deren Aufschlag ab.
  const [supplierId, setSupplierId] = useState<string | null>(data.supplier_id)

  const rules: PricingRule[] = useMemo(() => {
    if (!isManual) return data.available_pricing_rules ?? []
    if (!supplierId) return []
    return pricingRules
      .filter(r => r.supplier_id === supplierId && r.category)
      .map(r => ({
        category: r.category as string,
        margin_factor: pctToFactor(r.markup_pct ?? 0),
      }))
  }, [isManual, data.available_pricing_rules, pricingRules, supplierId])

  const ruleMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rules) m.set(r.category, r.margin_factor)
    return m
  }, [rules])

  // Griesser-Positionen sind eigenständige, bereits rabattierte POS-Zeilen (je Raum/Fenster) —
  // jede soll standardmässig angehakt UND als eigene Offert-Zeile ausgewiesen werden.
  const isGriesser = data.supplier === 'griesser'

  const [rows, setRows] = useState<RowState[]>(() =>
    (data.products ?? []).map(p => {
      const factor = p.suggested_margin_factor ?? 1
      return {
        name: p.name,
        description: p.description,
        quantity: String(p.quantity ?? 1),
        unit: p.unit || 'Stk',
        ek_price: p.ek_price != null ? String(p.ek_price) : '',
        category: p.suggested_category ?? '',
        margin_pct: String(factorToPct(factor)),
        positions: (p.positions ?? []).map(pos => ({
          label: pos.label,
          ek_price: String(pos.ek_price ?? 0),
          // Griesser: jede Position ist eine echte Offert-Zeile → angehakt + separat.
          // Stobag: Minus-Positionen sind Lieferanten-/Einkaufsrabatte des Tenants (z. B. „WebShop
          // Rabatt", „Tuch Preis-Gruppe 1") — sie gehören dem Tenant, nicht dem Kunden. Darum dort
          // standardmässig abgewählt: sonst landen sie in der Produktkopf-Zeile und erzeugen einen
          // Phantom-Minusbetrag. Bei Bedarf kann der Admin sie pro Position manuell wieder anhaken.
          selected: isGriesser ? true : (pos.ek_price ?? 0) >= 0,
          separate: isGriesser,
        })),
      }
    })
  )

  function updateRow(i: number, patch: Partial<RowState>) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  function updatePosition(i: number, k: number, patch: Partial<PositionState>) {
    setRows(rs => rs.map((r, j) => {
      if (j !== i) return r
      return { ...r, positions: r.positions.map((p, l) => (l === k ? { ...p, ...patch } : p)) }
    }))
  }

  // Neue Position: bei Griesser passend zu den Geschwisterzeilen separat, sonst in den EK.
  function addPosition(i: number) {
    setRows(rs => rs.map((r, j) => j === i
      ? { ...r, positions: [...r.positions, { label: '', ek_price: '', selected: true, separate: isGriesser }] }
      : r))
  }

  function removePosition(i: number, k: number) {
    setRows(rs => rs.map((r, j) => j === i ? { ...r, positions: r.positions.filter((_, l) => l !== k) } : r))
  }

  function addRow() {
    setRows(rs => [...rs, {
      name: '', description: '', quantity: '1', unit: 'Stk',
      ek_price: '', category: '', margin_pct: '', positions: [],
    }])
  }

  function removeRow(i: number) {
    setRows(rs => rs.filter((_, j) => j !== i))
  }

  // Lieferantenwechsel invalidiert die Warengruppen — Aufschlag bleibt als Eingabe stehen.
  function onSupplierChange(id: string) {
    setSupplierId(id || null)
    setRows(rs => rs.map(r => ({ ...r, category: '' })))
  }

  function onCategoryChange(i: number, category: string) {
    const factor = ruleMap.get(category)
    if (factor !== undefined) {
      updateRow(i, { category, margin_pct: String(factorToPct(factor)) })
    } else {
      updateRow(i, { category })
    }
  }

  function positionsLabel(hasPositions: boolean): string {
    if (isGriesser) {
      return 'Positionen — jede wird eine eigene Offert-Zeile; EK ist Netto inkl. Auftrags- und Kundenrabatt. Abwählen entfernt die Zeile.'
    }
    if (!hasPositions) {
      return 'Positionen (optional) — z. B. Einzelteile oder Varianten. „separat" macht daraus eine eigene Offert-Zeile.'
    }
    return isManual
      ? 'Positionen — anhaken übernimmt in den EK, „separat" wird eigene Zeile'
      : 'Positionen — anhaken übernimmt in den EK, „separat" wird eigene Zeile · Lieferanten-Rabatte (Minus) sind standardmässig abgewählt'
  }

  const confirmed = useMemo(() => buildConfirmed(rows, supplierId), [rows, supplierId])

  function handleConfirm() {
    onConfirm(confirmed)
  }

  const supplierLabel = data.supplier_label || 'Unbekannt'
  // Klick neben das Fenster schliesst nur, solange nichts zu übernehmen wäre.
  // Sonst wären eine ganze OCR-Extraktion bzw. die manuell erfassten Positionen
  // weg — sie stecken nur in diesem Modal, nicht im Offert-Entwurf.
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // Esc bei offener Rückfrage schliesst nur die Rückfrage. Ohne diesen
  // Capture-Handler käme der Esc-Handler des Offert-Formulars dran (window,
  // Bubble-Phase) und würde das Review-Fenster samt Positionen zumachen —
  // genau das, wovor die Rückfrage schützen soll.
  useEffect(() => {
    if (!confirmDiscard) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.stopImmediatePropagation()
      setConfirmDiscard(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirmDiscard])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      {...backdropCloseProps(onCancel, {
        blockWhen: () => confirmed.length > 0,
        onBlocked: () => setConfirmDiscard(true),
      })}
    >
      <div
        style={{ background: 'var(--bg, #fff)', borderRadius: 12, padding: 24, maxWidth: 880, width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>
            {isManual ? 'Position manuell erfassen' : 'Lieferanten-Offerte prüfen'}
          </h3>
          {!isManual && (
            <span className="admin-badge admin-badge-sent" style={{ padding: '2px 10px' }}>{supplierLabel}</span>
          )}
          {data.project_ref && (
            <span style={{ color: 'var(--muted, #666)', fontSize: 13 }}>· {data.project_ref}</span>
          )}
        </div>
        <p style={{ marginTop: 0, marginBottom: 16, color: 'var(--muted, #666)', fontSize: 12 }}>
          {isManual
            ? 'EK = dein Einkaufspreis. VK = EK × (1 + Aufschlag), aufgerundet auf 0.05. Lieferant + Warengruppe wählen lädt den Aufschlag automatisch.'
            : 'EK = Netto aus der Lieferanten-Offerte. VK = EK × (1 + Aufschlag). Warengruppe wählen lädt den Aufschlag aus den Lieferanten-Preisregeln.'}
        </p>

        {/* Manueller Modus: Lieferant bestimmt die Warengruppen. Ohne Lieferant bleibt
            die Warengruppe leer und der Aufschlag wird von Hand eingetragen. */}
        {isManual && (
          <div style={{ marginBottom: 16, maxWidth: 340 }}>
            <label style={LABEL_STYLE}>Lieferant (optional)</label>
            <select
              className="admin-form-select"
              value={supplierId ?? ''}
              onChange={e => onSupplierChange(e.target.value)}
            >
              <option value="">— kein Lieferant —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {!isManual && rules.length === 0 && (
          <div className="admin-alert admin-alert-warning" style={{ marginBottom: 16, fontSize: 13, padding: '8px 12px' }}>
            Keine Lieferanten-Preisregeln für <strong>{supplierLabel}</strong> hinterlegt — Aufschlag manuell eintragen.
          </div>
        )}
        {isManual && supplierId && rules.length === 0 && (
          <div className="admin-alert admin-alert-warning" style={{ marginBottom: 16, fontSize: 13, padding: '8px 12px' }}>
            Für diesen Lieferanten sind keine Warengruppen-Preisregeln hinterlegt — Aufschlag manuell eintragen.
          </div>
        )}

        {/* Karten pro Produkt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map((row, i) => {
            const totals = cardTotals(row, supplierId)
            const offerTotal = cardOfferTotal(row, supplierId)
            const hasPositions = row.positions.length > 0
            return (
              <div
                key={i}
                style={{
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: 'var(--radius-md)',
                  padding: 14,
                  background: 'var(--surface-2)',
                }}
              >
                {/* Zeile 1: Produktname (gross) */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <label style={LABEL_STYLE}>Produkt</label>
                    {isManual && rows.length > 1 && (
                      <button
                        className="admin-btn admin-btn-danger admin-btn-sm"
                        onClick={() => removeRow(i)}
                        title="Produkt entfernen"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <input
                    className="admin-form-input"
                    style={{ fontWeight: 600, fontSize: 14 }}
                    value={row.name}
                    onChange={e => updateRow(i, { name: e.target.value })}
                  />
                </div>

                {/* Zeile 2: Artikeltext */}
                <div style={{ marginBottom: 10 }}>
                  <label style={LABEL_STYLE}>Artikeltext</label>
                  <textarea
                    className="admin-form-input"
                    rows={2}
                    style={{ resize: 'vertical', minHeight: 50 }}
                    value={row.description}
                    onChange={e => updateRow(i, { description: e.target.value })}
                  />
                </div>

                {/* Positionsliste: an-/abwählbar, optional separat ausweisen.
                    Kommt aus der OCR (Stobag/Griesser) oder wird von Hand angelegt. */}
                <div style={{ marginBottom: 10 }}>
                  <label style={LABEL_STYLE}>{positionsLabel(hasPositions)}</label>
                  {hasPositions && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {row.positions.map((p, k) => (
                        <div
                          key={k}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '24px 1fr 110px 92px 32px',
                            gap: 8,
                            alignItems: 'center',
                            opacity: p.selected ? 1 : 0.45,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={p.selected}
                            onChange={e => updatePosition(i, k, { selected: e.target.checked, separate: e.target.checked ? p.separate : false })}
                            title="In die Offerte übernehmen"
                          />
                          <input
                            className="admin-form-input"
                            style={{ fontSize: 13 }}
                            placeholder="Bezeichnung"
                            value={p.label}
                            onChange={e => updatePosition(i, k, { label: e.target.value })}
                            disabled={!p.selected}
                          />
                          <input
                            className="admin-form-input"
                            style={{ fontSize: 13, textAlign: 'right' }}
                            placeholder="EK"
                            value={p.ek_price}
                            onChange={e => updatePosition(i, k, { ek_price: e.target.value })}
                            disabled={!p.selected}
                            title="Netto / EK dieser Position (CHF)"
                          />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted, #666)' }}>
                            <input
                              type="checkbox"
                              checked={p.separate}
                              disabled={!p.selected}
                              onChange={e => updatePosition(i, k, { separate: e.target.checked })}
                            />
                            separat
                          </label>
                          <button
                            className="admin-btn admin-btn-danger admin-btn-sm"
                            onClick={() => removePosition(i, k)}
                            title="Position entfernen"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    className="admin-btn admin-btn-secondary admin-btn-sm"
                    style={{ marginTop: hasPositions ? 6 : 0 }}
                    onClick={() => addPosition(i)}
                  >
                    + Position
                  </button>
                </div>

                {/* Zeile 3: Menge / Einheit / EK */}
                <div style={{ display: 'grid', gridTemplateColumns: '90px 100px 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={LABEL_STYLE}>Menge</label>
                    <input className="admin-form-input" value={row.quantity} onChange={e => updateRow(i, { quantity: e.target.value })} />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Einheit</label>
                    <input className="admin-form-input" value={row.unit} onChange={e => updateRow(i, { unit: e.target.value })} />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>EK (CHF){hasPositions ? ' — Summe gewählter Positionen' : ' / Stk'}</label>
                    {hasPositions ? (
                      <div className="admin-form-input" style={{ background: 'transparent', fontWeight: 600 }}>
                        {fmtCHF(totals.ek)}
                      </div>
                    ) : (
                      <input className="admin-form-input" value={row.ek_price} onChange={e => updateRow(i, { ek_price: e.target.value })} />
                    )}
                  </div>
                </div>

                {/* Zeile 4: Warengruppe / Aufschlag / VK */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 10, alignItems: 'end' }}>
                  <div>
                    <label style={LABEL_STYLE}>Warengruppe</label>
                    <select
                      className="admin-form-select"
                      value={row.category}
                      onChange={e => onCategoryChange(i, e.target.value)}
                      disabled={rules.length === 0}
                    >
                      <option value="">— wählen —</option>
                      {rules.map(r => (
                        <option key={r.category} value={r.category}>{r.category}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Aufschlag %</label>
                    <input className="admin-form-input" value={row.margin_pct} onChange={e => updateRow(i, { margin_pct: e.target.value })} />
                  </div>
                  <div style={{ minWidth: 140, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted, #666)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>VK{hasPositions ? ' — Summe gewählter Positionen' : ' / Stk'}</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtCHF(totals.vk)}</div>
                  </div>
                </div>

                {/* Fusszeile: der Betrag, der wirklich in die Offerte wandert. Die Felder oben
                    sind Stückpreise — hier zählt die Menge mit, plus jede separate Zeile. */}
                {offerTotal.lines > 0 && (
                  <div
                    style={{
                      display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline',
                      gap: 8, flexWrap: 'wrap',
                      marginTop: 12, paddingTop: 8,
                      borderTop: '1px dashed var(--border, #e5e7eb)',
                      fontSize: 12, color: 'var(--muted, #666)',
                    }}
                  >
                    <span>
                      Total in der Offerte ({offerTotal.lines} {offerTotal.lines === 1 ? 'Zeile' : 'Zeilen'}, inkl. Menge)
                      {' · EK '}{fmtCHF(offerTotal.ek)}
                    </span>
                    <strong style={{ fontSize: 15, color: 'var(--text)' }}>{fmtCHF(offerTotal.vk)}</strong>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20, alignItems: 'center' }}>
          {isManual && (
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={addRow}>+ Produkt</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="admin-btn admin-btn-secondary" onClick={onCancel}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" onClick={handleConfirm} disabled={confirmed.length === 0}>
            Übernehmen ({confirmed.length})
          </button>
        </div>
      </div>

      {/* Geschwister der Modal-Box, nicht darin: so liegt die Rückfrage im selben
          Stacking-Kontext wie das Overlay (z-index 1000) und damit über der Box —
          ein eigener Wrapper wäre nötig, stünde sie ausserhalb. */}
      {confirmDiscard && (
        <ConfirmDialog
          title="Positionen verwerfen?"
          message={`${confirmed.length} erfasste ${confirmed.length === 1 ? 'Position' : 'Positionen'} sind noch nicht übernommen. Schliessen verwirft sie.`}
          confirmLabel="Verwerfen"
          cancelLabel="Weiter bearbeiten"
          variant="danger"
          onConfirm={onCancel}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </div>
  )
}

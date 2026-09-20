// Reiter «Lager» (Lager v2, Modul `inventory` + Flag `lager_v2`).
//
// Die Antwort auf die Frage, die der Material-Katalog nie beantwortet hat:
// Was geht mir aus, was ist bestellt, und was steht im Minus? Der Katalog
// zeigt den Bestand als Zahl je Zeile — hier steht er im Zusammenhang mit
// Meldebestand, Reichweite und Lieferant.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getStockOverview } from '../../api/admin/inventory'
import type { ReorderState, StockOverviewRow } from '../../api/admin/inventory'
import { listSuppliers } from '../../api/admin/suppliers'
import type { Supplier } from '../../api/admin/suppliers'
import AnomalyList from './AnomalyList'
import DeliveryModal from './DeliveryModal'
import ReorderDrafts from './ReorderDrafts'

const ZUSTAND_LABEL: Record<ReorderState, string> = {
  ok: 'OK',
  unter_meldebestand: 'Unter Meldebestand',
  bestellt: 'Bestellt',
}

function ZustandsChip({ zeile }: { zeile: StockOverviewRow }) {
  // Negativ schlägt jeden Zustand: Das ist kein Meldefall, sondern ein Fehler —
  // entweder stimmt ein Rapport nicht, oder eine Lieferung wurde nie gebucht.
  if (zeile.quantity < 0) {
    return <span className="admin-badge" style={{ color: 'var(--danger)', fontWeight: 700 }}>Im Minus</span>
  }
  const farbe =
    zeile.reorder_state === 'unter_meldebestand' ? 'var(--warning, #b45309)'
    : zeile.reorder_state === 'bestellt' ? 'var(--accent, #3081ab)'
    : 'var(--muted)'
  return <span className="admin-badge" style={{ color: farbe }}>{ZUSTAND_LABEL[zeile.reorder_state]}</span>
}

function chf(v: number | null): string {
  return v == null ? '—' : `CHF ${v.toFixed(2)}`
}

export default function LagerOverview() {
  const [rows, setRows] = useState<StockOverviewRow[]>([])
  const [summary, setSummary] = useState({ unter_meldebestand: 0, bestellt: 0, negativ: 0, lagerwert_ek: 0 })
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [zustand, setZustand] = useState<'' | ReorderState>('')
  const [suche, setSuche] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lieferungOffen, setLieferungOffen] = useState(false)

  const laden = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getStockOverview()
      setRows(res.rows)
      setSummary(res.summary)
      setError('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void laden() }, [laden])
  useEffect(() => { listSuppliers().then(setSuppliers).catch(() => { /* Filter bleibt leer */ }) }, [])

  const lieferantNamen = useMemo(
    () => Object.fromEntries(suppliers.map(s => [s.id, s.name])),
    [suppliers],
  )

  // Gefiltert wird im Browser: Die Liste ist einmal geladen, und ein Rundlauf
  // zum Server je Tastendruck kostet mehr, als er hier bringt.
  const gefiltert = useMemo(() => {
    const n = suche.trim().toLowerCase()
    return rows.filter(r => {
      if (zustand && r.reorder_state !== zustand) return false
      if (!n) return true
      return r.name.toLowerCase().includes(n) || r.art_nr.toLowerCase().includes(n)
    })
  }, [rows, zustand, suche])

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Lager</div>
          <div className="admin-page-subtitle">{rows.length} Artikel mit Bestandsführung</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setLieferungOffen(true)}>
          Lieferung buchen
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { label: 'Unter Meldebestand', value: summary.unter_meldebestand, danger: summary.unter_meldebestand > 0 },
          { label: 'Bestellt', value: summary.bestellt, danger: false },
          { label: 'Im Minus', value: summary.negativ, danger: summary.negativ > 0 },
        ].map(k => (
          <div key={k.label} style={{
            border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', minWidth: 140,
          }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.danger ? 'var(--danger)' : 'var(--text)' }}>
              {k.value}
            </div>
          </div>
        ))}
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', minWidth: 140 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Lagerwert (EK)</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{chf(summary.lagerwert_ek)}</div>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search" placeholder="Bezeichnung oder Art.-Nr.…"
            value={suche} onChange={e => setSuche(e.target.value)}
          />
          <select
            className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }}
            aria-label="Zustand" value={zustand}
            onChange={e => setZustand(e.target.value as '' | ReorderState)}
          >
            <option value="">Alle Zustände</option>
            <option value="unter_meldebestand">Unter Meldebestand</option>
            <option value="bestellt">Bestellt</option>
            <option value="ok">OK</option>
          </select>
        </div>

        {error && <div className="admin-form-error">{error}</div>}

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : gefiltert.length === 0 ? (
          <div className="admin-table-empty">Keine Artikel gefunden.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Artikel</th>
                <th>Zustand</th>
                <th style={{ textAlign: 'right' }}>Bestand</th>
                <th style={{ textAlign: 'right' }}>Mindest</th>
                <th style={{ textAlign: 'right' }}>Reichweite</th>
                <th style={{ textAlign: 'right' }}>Vorschlag</th>
                <th>Lieferant</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map(r => (
                <tr key={r.material_id}>
                  <td>
                    <strong>{r.name}</strong>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{r.art_nr}</div>
                  </td>
                  <td><ZustandsChip zeile={r} /></td>
                  <td style={{ textAlign: 'right', color: r.quantity < 0 ? 'var(--danger)' : undefined, fontWeight: r.quantity < 0 ? 700 : undefined }}>
                    {r.quantity} {r.unit || ''}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>
                    {r.min_quantity > 0 ? r.min_quantity : '—'}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>
                    {/* «—» statt 0: ohne Verbrauch gibt es keine Reichweite,
                        und 0 hiesse fälschlich «sofort leer». */}
                    {r.reichweite_tage == null ? '—' : `${r.reichweite_tage} Tage`}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {r.reorder_state === 'unter_meldebestand' ? `${r.bestellvorschlag} ${r.unit || ''}` : '—'}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{r.lieferant || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ReorderDrafts lieferantNamen={lieferantNamen} />

      <AnomalyList />

      {lieferungOffen && (
        <DeliveryModal
          artikel={rows}
          onClose={() => setLieferungOffen(false)}
          onSaved={() => { setLieferungOffen(false); void laden() }}
        />
      )}
    </div>
  )
}

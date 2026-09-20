// Bewegungsjournal eines Artikels (Modul `inventory`, Lager v2).
//
// Vor 20260919 gab es diese Ansicht nicht: Der Bestand war eine Zahl ohne
// Geschichte, und wer wissen wollte, warum ein Artikel auf 3 steht, hatte keine
// Stelle zum Nachschauen. Seit der Bestand aus den Bewegungen entsteht, ist das
// Journal die Begründung jeder Zahl — und beim Nachzählen der einzige Weg,
// einen Fehler zu finden statt ihn zu überschreiben.

import { useEffect, useState } from 'react'
import { listStockMovements } from '../../api/admin/inventory'
import type { StockMovement } from '../../api/admin/inventory'

const SEITENGROESSE = 20

function Vorzeichen({ menge }: { menge: number }) {
  const zugang = menge > 0
  return (
    <span style={{ color: zugang ? 'var(--success)' : 'var(--text)', fontWeight: 600 }}>
      {zugang ? '+' : ''}{menge}
    </span>
  )
}

function zeitpunkt(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function MovementList({ artNr, unit }: { artNr: string; unit?: string | null }) {
  const [rows, setRows] = useState<StockMovement[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let abgebrochen = false
    setLoading(true)
    listStockMovements(artNr, { page, pageSize: SEITENGROESSE })
      .then(res => {
        if (abgebrochen) return
        setRows(res.rows)
        setTotal(res.total)
        setError('')
      })
      .catch((err: unknown) => {
        if (abgebrochen) return
        setError(err instanceof Error ? err.message : 'Journal konnte nicht geladen werden')
      })
      .finally(() => { if (!abgebrochen) setLoading(false) })
    return () => { abgebrochen = true }
  }, [artNr, page])

  if (loading && rows.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Bewegungen werden geladen…</div>
  }
  if (error) return <div className="admin-form-error">{error}</div>
  if (rows.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Noch keine Bewegungen erfasst.</div>
  }

  const seiten = Math.max(1, Math.ceil(total / SEITENGROESSE))

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(m => (
          <div
            key={m.id}
            style={{
              display: 'flex', justifyContent: 'space-between', gap: 12,
              borderBottom: '1px solid var(--border)', paddingBottom: 6,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>
                {m.movement_label}
                {m.reference && (
                  <span style={{ color: 'var(--muted)' }}> · {m.reference.label}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {zeitpunkt(m.created_at)}
                {m.created_by ? ` · ${m.created_by}` : ''}
              </div>
              {m.note && (
                <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>{m.note}</div>
              )}
            </div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: 13 }}>
                <Vorzeichen menge={m.quantity_delta} /> {unit || ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {/* Bewegungen von vor dem 19.09.2026 tragen keinen Bestand:
                    er ist nicht rekonstruierbar, weil die verlorenen Korrekturen
                    fehlen. Eine gerechnete Zahl wäre eine Behauptung. */}
                Bestand: {m.balance_after === null ? '—' : m.balance_after}
              </div>
            </div>
          </div>
        ))}
      </div>
      {seiten > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 10 }}>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            Zurück
          </button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Seite {page} von {seiten}</span>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => setPage(p => Math.min(seiten, p + 1))}
            disabled={page >= seiten || loading}
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  )
}

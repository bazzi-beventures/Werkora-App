// Wareneingang buchen (Lager v2, Modul `inventory` + Flag `lager_v2`).
//
// Der Zugang, den es vorher nirgends gab: Bis 20260919 kannte das Lager nur
// Abgänge, jeder Artikel lief also zwangsläufig gegen 0 und darunter. Die
// Buchung entsteht hier als `delivery`-Bewegung; der Bestand folgt ihr.

import { useMemo, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { bookDelivery } from '../../api/admin/inventory'
import type { StockOverviewRow } from '../../api/admin/inventory'

interface Zeile {
  art_nr: string
  name: string
  unit: string | null
  qty: string
}

export default function DeliveryModal({
  artikel, vorauswahl, onClose, onSaved,
}: {
  artikel: StockOverviewRow[]
  /** Artikelnummern, die vorbelegt werden — z.B. die Positionen einer Bestellung. */
  vorauswahl?: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [lieferschein, setLieferschein] = useState('')
  const [lieferant, setLieferant] = useState('')
  const [suche, setSuche] = useState('')
  const [zeilen, setZeilen] = useState<Zeile[]>(() =>
    (vorauswahl ?? []).flatMap(nr => {
      const a = artikel.find(x => x.art_nr === nr)
      return a ? [{ art_nr: a.art_nr, name: a.name, unit: a.unit, qty: '' }] : []
    }),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const treffer = useMemo(() => {
    const n = suche.trim().toLowerCase()
    if (!n) return []
    const gewaehlt = new Set(zeilen.map(z => z.art_nr))
    return artikel
      .filter(a => !gewaehlt.has(a.art_nr))
      .filter(a => a.name.toLowerCase().includes(n) || a.art_nr.toLowerCase().includes(n))
      .slice(0, 8)
  }, [suche, artikel, zeilen])

  function hinzufuegen(a: StockOverviewRow) {
    setZeilen(z => [...z, { art_nr: a.art_nr, name: a.name, unit: a.unit, qty: '' }])
    setSuche('')
  }

  const buchbar = zeilen.filter(z => parseFloat(z.qty) > 0)

  async function speichern() {
    if (buchbar.length === 0) return
    setSaving(true)
    setError('')
    try {
      const res = await bookDelivery({
        lieferschein_nr: lieferschein.trim() || null,
        lieferant_name: lieferant.trim() || null,
        items: buchbar.map(z => ({ art_nr: z.art_nr, qty: parseFloat(z.qty) })),
      })
      if (res.status === 'partial') {
        // Nicht schweigen: Ein Teil ist gebucht, ein Teil nicht — wer das nicht
        // erfährt, bucht den Rest nie nach.
        const offen = res.rows.filter(r => r.status !== 'success')
        setError(
          `${res.booked} von ${res.rows.length} Positionen gebucht. Offen: ` +
          offen.map(o => `${o.art_nr} (${o.message ?? 'Fehler'})`).join(', '),
        )
        return
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Buchen fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Lieferung buchen</div>
          <button className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="ls-lieferant">Lieferant</label>
              <input
                id="ls-lieferant" className="admin-form-input" value={lieferant}
                onChange={e => setLieferant(e.target.value)} placeholder="z.B. Griesser"
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="ls-nr">Lieferschein-Nr.</label>
              <input
                id="ls-nr" className="admin-form-input" value={lieferschein}
                onChange={e => setLieferschein(e.target.value)} placeholder="z.B. 4711"
              />
              <div className="admin-form-hint">Steht später als Beleg im Journal.</div>
            </div>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="ls-suche">Artikel hinzufügen</label>
            <input
              id="ls-suche" className="admin-form-input" value={suche}
              onChange={e => setSuche(e.target.value)} placeholder="Bezeichnung oder Art.-Nr. tippen…"
            />
            {treffer.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 4 }}>
                {treffer.map(a => (
                  <button
                    key={a.material_id} type="button"
                    onClick={() => hinzufuegen(a)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)',
                    }}
                  >
                    {a.name} <span style={{ color: 'var(--muted)' }}>· {a.art_nr}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {zeilen.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Noch keine Position gewählt.
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>Artikel</th><th style={{ width: 120 }}>Menge</th><th style={{ width: 40 }} /></tr>
              </thead>
              <tbody>
                {zeilen.map((z, i) => (
                  <tr key={z.art_nr}>
                    <td>
                      {z.name}
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{z.art_nr}</div>
                    </td>
                    <td>
                      <input
                        className="admin-form-input" type="number" step="any" min="0"
                        aria-label={`Menge ${z.name}`}
                        value={z.qty}
                        onChange={e => setZeilen(alle => alle.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                      />
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{z.unit || 'Stk'}</span>
                    </td>
                    <td>
                      <button
                        type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                        onClick={() => setZeilen(alle => alle.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
          <button
            className="admin-btn admin-btn-primary"
            onClick={speichern}
            disabled={saving || buchbar.length === 0}
          >
            {saving ? 'Buchen…' : `${buchbar.length} Position(en) buchen`}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { getTenantTravelCost, updateTenantTravelCost, TravelCostRow } from '../../../api/admin'
import { useTenantSetting } from '../useTenantSetting'
import { useToast, ToastHost } from '../../components/useToast'

// ─── Fahrtkosten-Tab: Distanz-Staffelung pro Mandant ─────────────────────────
//
// Jede Zeile ist [km-Schwelle, CHF]. Die Distanz (km) wird bei Projekt-Anlage
// einmalig via Google Maps berechnet und auf den nächsten ganzen km aufgerundet;
// die erste Zeile, deren Schwelle ≥ diesem Wert ist, bestimmt den Pauschalbetrag.
// Der Preis der LETZTEN Zeile gilt automatisch für alle größeren Distanzen.
// Kein Override (null) ⇒ es greift die System-Default-Tabelle.

function validateTravelRows(rows: TravelCostRow[]): string[] {
  const errors: string[] = []
  if (rows.length === 0) {
    return ['Mindestens eine Zeile erforderlich (oder auf System-Default zurücksetzen).']
  }
  let prev: number | null = null
  rows.forEach((row, i) => {
    const km = row[0]
    const chf = row[1]
    if (km == null || !Number.isFinite(km) || km <= 0) {
      errors.push(`Zeile ${i + 1}: km-Schwelle muss eine positive Zahl sein.`)
      return
    }
    if (!Number.isFinite(chf) || chf < 0) {
      errors.push(`Zeile ${i + 1}: CHF muss ≥ 0 sein.`)
      return
    }
    if (prev != null && km <= prev) {
      errors.push(`Zeile ${i + 1}: km-Schwellen müssen streng aufsteigend sein.`)
    }
    prev = km
  })
  return errors
}

// Editierbarer Zustand als ein Wert: entweder System-Default (rows leer) oder
// die eigene Tabelle.
interface TravelCostState {
  isDefault: boolean
  rows: TravelCostRow[]
}

export function TravelCostTab() {
  const { toast, showToast } = useToast()
  const [defaultTable, setDefaultTable] = useState<TravelCostRow[]>([])

  function fromResponse(table: TravelCostRow[] | null | undefined): TravelCostState {
    return table && table.length > 0
      ? { isDefault: false, rows: table }
      : { isDefault: true, rows: [] }
  }

  const {
    value, setValue, loading, saving, dirty, reload, persist,
  } = useTenantSetting<TravelCostState>({
    load: async () => {
      const res = await getTenantTravelCost()
      setDefaultTable(res.default_table)
      return fromResponse(res.travel_cost_table)
    },
    save: async (v) => {
      const res = await updateTenantTravelCost(v.isDefault ? null : v.rows)
      return fromResponse(res.travel_cost_table)
    },
    onToast: showToast,
    savedMsg: 'Fahrtkosten gespeichert',
  })

  if (loading || !value) {
    return <><div className="admin-loading"><div className="admin-spinner" /> Fahrtkosten werden geladen…</div><ToastHost toast={toast} /></>
  }

  const { isDefault, rows } = value
  const errors = isDefault ? [] : validateTravelRows(rows)

  function startCustom() {
    // Vom System-Default ableiten: numerische Zeilen übernehmen, die „∞"-Zeile fällt weg
    // (der Preis der letzten Zeile gilt ohnehin automatisch für alle größeren Distanzen).
    const seeded = defaultTable
      .filter(([km]) => km != null)
      .map(([km, chf]) => [km as number, chf] as TravelCostRow)
    setValue({ isDefault: false, rows: seeded })
  }

  function setRow(i: number, km: number | null, chf: number) {
    setValue({ isDefault: false, rows: rows.map((r, j) => (j === i ? [km, chf] : r)) })
  }

  function addRow() {
    const lastKm = rows.length ? (rows[rows.length - 1][0] ?? 0) : 0
    setValue({ isDefault: false, rows: [...rows, [(lastKm || 0) + 1, 0]] })
  }

  function removeRow(i: number) {
    setValue({ isDefault: false, rows: rows.filter((_, j) => j !== i) })
  }

  function save() {
    if (errors.length > 0) {
      showToast('Bitte zuerst Fehler beheben', 'error')
      return
    }
    void persist()
  }

  function resetToDefault() {
    setValue({ isDefault: true, rows: [] })
  }

  const fmtKm = (km: number | null) => (km == null ? '∞ (und darüber)' : `bis ${km} km`)

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 640 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Fahrtkosten-Pauschale je nach Distanz (Firmensitz → Objektadresse). Die Distanz
        wird bei der Projekt-Anlage einmalig berechnet und auf den nächsten ganzen km
        aufgerundet. Es greift die erste Zeile, deren km-Schwelle ≥ der Distanz ist; der
        Preis der <strong>letzten</strong> Zeile gilt für alle größeren Distanzen.
        Diese Tabelle wird in Offerten <em>und</em> Rechnungen verwendet.
      </div>

      {isDefault ? (
        <>
          <div style={{
            padding: 12, marginBottom: 16, borderRadius: 8,
            background: 'rgba(59,130,171,0.08)', border: '1px solid rgba(59,130,171,0.25)',
            fontSize: 13,
          }}>
            Dieser Mandant nutzt aktuell die <strong>System-Standard-Tabelle</strong>.
          </div>
          <div className="admin-table-wrap" style={{ marginBottom: 16 }}>
          <table className="admin-table">
            <thead>
              <tr><th>Distanz</th><th>CHF</th></tr>
            </thead>
            <tbody>
              {defaultTable.map(([km, chf], i) => (
                <tr key={i}>
                  <td>{fmtKm(km)}</td>
                  <td>CHF {chf.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {dirty ? (
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="admin-btn admin-btn-primary"
                onClick={save}
                disabled={saving}
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={reload}
                disabled={saving}
              >
                Verwerfen
              </button>
            </div>
          ) : (
            <button className="admin-btn admin-btn-primary" onClick={startCustom}>
              Eigene Tabelle erstellen
            </button>
          )}
        </>
      ) : (
        <>
          <div className="admin-table-wrap" style={{ marginBottom: 12 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>bis … km</th>
                <th>CHF</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([km, chf], i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="number" min="0" step="1" className="admin-form-input"
                      value={km ?? ''}
                      onChange={e => setRow(i, e.target.value === '' ? null : parseFloat(e.target.value), chf)}
                      style={{ width: '100%', maxWidth: 130 }}
                    />
                    {i === rows.length - 1 && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>gilt auch darüber</div>
                    )}
                  </td>
                  <td>
                    <input
                      type="number" min="0" step="0.05" className="admin-form-input"
                      value={Number.isFinite(chf) ? chf : ''}
                      onChange={e => setRow(i, km, parseFloat(e.target.value) || 0)}
                      style={{ width: '100%', maxWidth: 130 }}
                    />
                  </td>
                  <td>
                    <button
                      className="admin-btn admin-btn-secondary"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => removeRow(i)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <button
            className="admin-btn admin-btn-secondary"
            onClick={addRow}
            style={{ fontSize: 12, marginBottom: 16 }}
          >
            + Zeile
          </button>

          {errors.length > 0 && (
            <div style={{
              padding: 12, marginBottom: 16, borderRadius: 8,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              fontSize: 13, color: '#fca5a5',
            }}>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="admin-btn admin-btn-primary"
              onClick={save}
              disabled={!dirty || saving || errors.length > 0}
            >
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
            <button
              className="admin-btn admin-btn-secondary"
              onClick={reload}
              disabled={saving || !dirty}
            >
              Verwerfen
            </button>
            <button
              className="admin-btn admin-btn-secondary"
              onClick={resetToDefault}
              disabled={saving}
              style={{ marginLeft: 'auto' }}
            >
              Auf System-Standard zurücksetzen
            </button>
          </div>
        </>
      )}
    </div>
  )
}

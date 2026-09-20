// Auffälligkeiten im Lager (Lager v2, Phase 4).
//
// Was der Nachtlauf gefunden hat, und was dagegen zu tun ist. Jeder Befund
// trägt seine Empfehlung vom Server — dieselbe, die auch im Lagerbericht
// steht. Ein Befund ohne Handlungsanweisung wird zur Kenntnis genommen und
// vergessen; die Liste füllt sich, und niemand räumt sie ab.

import { useCallback, useEffect, useState } from 'react'
import { createStockCount, ignoreAnomaly, listAnomalies } from '../../api/admin/inventory'
import type { AnomalySeverity, StockAnomaly } from '../../api/admin/inventory'
import { ConfirmDialog } from '../components/ConfirmDialog'

const SCHWERE_FARBE: Record<AnomalySeverity, string> = {
  hoch: 'var(--danger)',
  mittel: 'var(--warning, #b45309)',
  niedrig: 'var(--muted)',
}

const ART_LABEL: Record<string, string> = {
  negativ: 'Bestand im Minus',
  ausreisser: 'Ungewöhnlicher Verbrauch',
  ladenhueter: 'Ladenhüter',
  drift: 'Systemfehler',
  nachzaehlen: 'Nachzählen',
}

function IgnorierenDialog({ befund, onClose, onDone }: {
  befund: StockAnomaly
  onClose: () => void
  onDone: () => void
}) {
  const [notiz, setNotiz] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return (
    <ConfirmDialog
      title={`«${befund.name}» stilllegen?`}
      message="Der Befund verschwindet aus der Liste und kommt frühestens in einem Monat wieder."
      warning={error}
      confirmLabel="Stilllegen"
      confirmDisabled={notiz.trim().length < 3}
      busy={busy}
      onCancel={onClose}
      onConfirm={() => {
        setBusy(true)
        ignoreAnomaly(befund.id, notiz.trim())
          .then(onDone)
          .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Fehler'))
          .finally(() => setBusy(false))
      }}
    >
      <div className="admin-form-group">
        <label className="admin-form-label" htmlFor="anom-notiz">Begründung</label>
        <input
          id="anom-notiz" className="admin-form-input" value={notiz}
          onChange={e => setNotiz(e.target.value)}
          placeholder="z.B. Rest wird demnächst verbaut"
        />
        <div className="admin-form-hint">
          Pflicht — wer den Befund in einem Monat wiedersieht, will wissen, warum
          ihn jemand weggeklickt hat.
        </div>
      </div>
    </ConfirmDialog>
  )
}

export default function AnomalyList({ onCountCreated }: { onCountCreated?: (id: string) => void }) {
  const [rows, setRows] = useState<StockAnomaly[]>([])
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set())
  const [stilllegen, setStilllegen] = useState<StockAnomaly | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const laden = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listAnomalies()
      setRows(res.rows)
      setGewaehlt(new Set())
      setError('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void laden() }, [laden])

  async function zaehlungAnlegen() {
    setBusy(true)
    try {
      const res = await createStockCount({
        kind: 'stich',
        title: `Nachzählung ${new Date().toLocaleDateString('de-CH')}`,
        anomaly_ids: Array.from(gewaehlt),
      })
      await laden()
      onCountCreated?.(res.count.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Zählung konnte nicht angelegt werden')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Auffälligkeiten</h3>
        {gewaehlt.size > 0 && (
          <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={zaehlungAnlegen} disabled={busy}>
            {busy ? 'Wird angelegt…' : `${gewaehlt.size} Artikel nachzählen`}
          </button>
        )}
      </div>

      {error && <div className="admin-form-error">{error}</div>}

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Wird geladen…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
          Nichts Auffälliges. Werkora prüft jede Nacht auf Bestände im Minus,
          ungewöhnlichen Verbrauch und Ladenhüter.
        </div>
      ) : (
        <table className="admin-table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <th>Artikel</th>
              <th>Art</th>
              <th>Empfehlung</th>
              <th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id}>
                <td>
                  {/* Der Systemfehler Drift ist nicht durch Zählen zu beheben —
                      er braucht einen Fix, keine Nachzählung. */}
                  {a.kind !== 'drift' && (
                    <input
                      type="checkbox"
                      aria-label={`${a.name} nachzählen`}
                      checked={gewaehlt.has(a.id)}
                      onChange={e => setGewaehlt(g => {
                        const n = new Set(g)
                        if (e.target.checked) n.add(a.id)
                        else n.delete(a.id)
                        return n
                      })}
                    />
                  )}
                </td>
                <td>
                  <strong>{a.name}</strong>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{a.art_nr}</div>
                </td>
                <td style={{ color: SCHWERE_FARBE[a.severity], fontWeight: a.severity === 'hoch' ? 700 : undefined }}>
                  {ART_LABEL[a.kind] ?? a.kind}
                </td>
                <td style={{ fontSize: 13 }}>{a.text}</td>
                <td>
                  <button
                    className="admin-btn admin-btn-secondary admin-btn-sm"
                    onClick={() => setStilllegen(a)}
                  >
                    Stilllegen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {stilllegen && (
        <IgnorierenDialog
          befund={stilllegen}
          onClose={() => setStilllegen(null)}
          onDone={() => { setStilllegen(null); void laden() }}
        />
      )}
    </div>
  )
}

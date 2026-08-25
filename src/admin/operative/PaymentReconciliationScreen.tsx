import { useRef, useState } from 'react'
import {
  reconcileCamt, ReconcileResponse, ReconcileResult, ReconcileStatus,
} from '../../api/admin'
import { AdminCardList } from '../components/AdminCardList'
import { useIsMobile } from '../useIsMobile'

const STATUS_META: Record<ReconcileStatus, { label: string; color: string; bg: string }> = {
  matched:         { label: 'Bezahlt',        color: '#0a7d33', bg: '#e8f6ed' },
  amount_mismatch: { label: 'Betrag weicht ab', color: '#9a5b00', bg: '#fdf2e2' },
  already_paid:    { label: 'Schon bezahlt',  color: '#5a6473', bg: '#eef1f5' },
  unmatched:       { label: 'Keine Rechnung', color: '#b3261e', bg: '#fcebea' },
}

function chf(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `CHF ${n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function StatusBadge({ status }: { status: ReconcileStatus }) {
  const m = STATUS_META[status]
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 10,
      fontSize: 12, fontWeight: 600, color: m.color, background: m.bg,
    }}>{m.label}</span>
  )
}

/** Die vier Spalten, die am Handy nicht auf die Karte passen (§3-Entscheid:
 *  Referenz, Rechnung, Eingegangen, Differenz und Status bleiben sichtbar,
 *  der Rest wandert hinter das Aufklappen). */
function ResultDetail({ r }: { r: ReconcileResult }) {
  const zeilen: [string, string][] = [
    ['Projekt', r.project_name || '—'],
    ['Erwartet', chf(r.expected_amount)],
    ['Valuta', r.value_date || '—'],
    ['Auftraggeber', r.debtor_name || '—'],
  ]
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 13 }}>
      {zeilen.map(([label, wert]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <span style={{ color: 'var(--muted)' }}>{label}</span>
          <span style={{ textAlign: 'right' }}>{wert}</span>
        </div>
      ))}
    </div>
  )
}

export default function PaymentReconciliationScreen() {
  const [file, setFile] = useState<File | null>(null)
  const [dryRun, setDryRun] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [response, setResponse] = useState<ReconcileResponse | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()
  // Ergebniszeilen haben keine ID — der Index ist hier die einzige Identitaet,
  // und die Liste wird nach dem Laden nicht umsortiert.
  const [expanded, setExpanded] = useState<number | null>(null)

  function resetAll() {
    setFile(null)
    setResponse(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function run() {
    if (!file) { setError('Bitte zuerst eine CAMT-Datei (.xml) wählen.'); return }
    setRunning(true)
    setError('')
    setResponse(null)
    try {
      const res = await reconcileCamt(file, dryRun)
      setResponse(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Abgleich fehlgeschlagen')
    } finally {
      setRunning(false)
    }
  }

  const s = response?.summary

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Zahlungsabgleich</div>
          <div className="admin-page-subtitle">CAMT-Bankauszug (camt.053 / camt.054) einlesen und mit Rechnungen abgleichen</div>
        </div>
        {response && (
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={resetAll}>Neu beginnen</button>
        )}
      </div>

      {error && <div className="admin-form-error" style={{ margin: '0 0 14px' }}>{error}</div>}

      {/* Schritt 1: Datei + Optionen */}
      <div className="admin-table-wrap" style={{ padding: 20, marginBottom: 16 }}>
        <div className="admin-section-title">1 · Bankauszug wählen</div>
        <div className="admin-form-group" style={{ maxWidth: 480, marginTop: 12 }}>
          <label className="admin-form-label">CAMT-Datei (.xml) *</label>
          <input
            ref={fileRef}
            type="file"
            accept=".xml,.camt,text/xml,application/xml"
            className="admin-form-input"
            onChange={e => { setFile(e.target.files?.[0] ?? null); setResponse(null); setError('') }}
          />
          {file && <div className="admin-form-hint">Gewählt: <strong>{file.name}</strong></div>}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
          <span>
            <strong>Nur Vorschau</strong> — Treffer werden angezeigt, aber <em>nicht</em> als bezahlt gebucht.
          </span>
        </label>

        <div style={{ marginTop: 16 }}>
          <button className="admin-btn admin-btn-primary" onClick={run} disabled={!file || running}>
            {running ? 'Abgleich läuft…' : dryRun ? 'Vorschau erstellen' : 'Abgleichen & buchen'}
          </button>
        </div>
      </div>

      {/* Schritt 2: Ergebnis */}
      {s && (
        <div className="admin-table-wrap" style={{ padding: 20 }}>
          <div className="admin-section-title">
            2 · Ergebnis{s.dry_run ? ' (Vorschau — nichts gebucht)' : ''}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '14px 0 18px' }}>
            <SummaryCard label="Eingänge gesamt" value={s.total} />
            <SummaryCard label="Bezahlt" value={s.matched} color="#0a7d33" />
            <SummaryCard label="Betrag weicht ab" value={s.amount_mismatch} color="#9a5b00" />
            <SummaryCard label="Schon bezahlt" value={s.already_paid} color="#5a6473" />
            <SummaryCard label="Keine Rechnung" value={s.unmatched} color="#b3261e" />
            {!s.dry_run && <SummaryCard label="Verbucht" value={s.applied} color="#0a7d33" />}
          </div>

          {isMobile ? (
            <AdminCardList
              // Index mitgefuehrt statt per indexOf nachgeschlagen: das waere
              // ein Suchlauf pro Karte und Rendern (O(n²)). Korrekt waere es
              // auch — indexOf vergleicht ueber Referenzidentitaet, feldgleiche
              // Eingaenge sind verschiedene Objekte —, nur unnoetig teuer.
              items={response.results.map((r, i) => ({ r, i }))}
              keyFor={({ i }) => String(i)}
              empty="Keine Eingänge im Auszug."
              onItemClick={({ i }) => setExpanded(expanded === i ? null : i)}
              renderCard={({ r, i }) => (
                <>
                  <div className="admin-card-head">
                    <span className="admin-card-title" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {r.reference || '—'}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="admin-card-meta">Rechnung {r.invoice_number || '—'}</div>
                  <div className="admin-card-meta">
                    Eingegangen <strong>{chf(r.paid_amount)}</strong>
                    {r.amount_diff ? (
                      <> · Differenz <strong style={{ color: '#b3261e' }}>{chf(r.amount_diff)}</strong></>
                    ) : null}
                  </div>
                  {expanded === i && <ResultDetail r={r} />}
                </>
              )}
            />
          ) : (
          <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Referenz</th>
                <th>Rechnung</th>
                <th>Projekt</th>
                <th style={{ textAlign: 'right' }}>Eingegangen</th>
                <th style={{ textAlign: 'right' }}>Erwartet</th>
                <th style={{ textAlign: 'right' }}>Differenz</th>
                <th>Valuta</th>
                <th>Auftraggeber</th>
              </tr>
            </thead>
            <tbody>
              {response.results.map((r: ReconcileResult, i: number) => (
                <tr key={i}>
                  <td><StatusBadge status={r.status} /></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.reference || '—'}</td>
                  <td>{r.invoice_number || '—'}</td>
                  <td>{r.project_name || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{chf(r.paid_amount)}</td>
                  <td style={{ textAlign: 'right' }}>{chf(r.expected_amount)}</td>
                  <td style={{ textAlign: 'right', color: r.amount_diff ? '#b3261e' : undefined }}>
                    {r.amount_diff ? chf(r.amount_diff) : '—'}
                  </td>
                  <td>{r.value_date || '—'}</td>
                  <td>{r.debtor_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          )}

          {s.dry_run && s.matched > 0 && (
            <div className="admin-form-hint" style={{ marginTop: 12 }}>
              Vorschau: {s.matched} Treffer würden als bezahlt gebucht. Entferne „Nur Vorschau" und starte erneut, um zu buchen.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      minWidth: 120, padding: '10px 14px', borderRadius: 8,
      border: '1px solid var(--admin-border, #e2e6ec)', background: 'var(--admin-card, #fff)',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'inherit' }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
    </div>
  )
}

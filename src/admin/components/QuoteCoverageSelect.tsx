// Offerten-Auswahl im Rechnung-Erstellen-Dialog (Projektdetail UND Rechnungen-Screen):
// welche Offerten deckt die Rechnung ab? Vorbelegt mit dem Ergebnis der Automatik
// (covered), zusätzlich wählbar sind weitere angenommene, unverrechnete Offerten des
// Projekts (additional) — der Fall zweier eigenständiger Offerten-Gruppen, den die
// Automatik nie gemeinsam abdeckt. Die Entscheidungslogik (wann wird was gesendet)
// liegt in utils/quoteSelection.ts, hier ist nur die Darstellung.

import type { CoverageQuote, InvoiceQuoteCoverage } from '../../api/admin/invoices'
import { fmtCHF } from '../utils/format'

interface QuoteCoverageSelectProps {
  coverage: InvoiceQuoteCoverage
  checked: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
}

export function QuoteCoverageSelect({ coverage, checked, onChange, disabled }: QuoteCoverageSelectProps) {
  const checkedSet = new Set(checked)

  function toggle(id: number) {
    onChange(checkedSet.has(id) ? checked.filter(c => c !== id) : [...checked, id])
  }

  function row(q: CoverageQuote) {
    return (
      <label
        key={q.id}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px',
          fontSize: 13, cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={checkedSet.has(q.id)}
          disabled={disabled}
          onChange={() => toggle(q.id)}
        />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{q.quote_number ?? q.id}</span>
        {!q.accepted && (
          <span className="admin-badge admin-badge-draft">nicht angenommen</span>
        )}
        <span style={{ flex: 1, textAlign: 'right', fontWeight: 600 }}>{fmtCHF(q.total)}</span>
      </label>
    )
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="admin-form-label">Offerten auf dieser Rechnung</div>
      {coverage.covered.map(row)}
      {coverage.additional.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--muted)', margin: '6px 0 2px' }}>
            Weitere angenommene, noch nicht verrechnete Offerten dieses Projekts:
          </div>
          {coverage.additional.map(row)}
        </>
      )}
      {checked.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--danger, #c00)', marginTop: 4 }}>
          Mindestens eine Offerte anhaken.
        </div>
      )}
    </div>
  )
}

// Anzahlung im Erstellen-Dialog (WW-47, Spec docs/specs/anzahlung-und-rapportauswahl.md
// §3): der Prozentsatz einer neuen Anzahlungsrechnung, und auf jeder anderen
// Rechnung die Wahl, welche offenen Anzahlungen sie abzieht.

import type { OpenAnzahlung } from '../../api/admin/invoices'
import { fmtCHF, fmtDate } from '../utils/format'

export function AnzahlungPctField({ value, onChange, invalid, disabled, idPrefix }: {
  value: string
  onChange: (next: string) => void
  invalid: boolean
  disabled?: boolean
  idPrefix: string
}) {
  const id = `${idPrefix}-anzahlung-pct`
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="admin-form-label" htmlFor={id}>Anzahlung in %</label>
      <input
        id={id}
        className="admin-form-input"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{ maxWidth: 120 }}
      />
      {invalid ? (
        <div className="admin-form-error" role="alert">Bitte einen Wert zwischen 0 und 100 eingeben.</div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          Vom Netto der Offerte (nach Rabatten), zzgl. MWST.
        </div>
      )}
    </div>
  )
}

export function AnzahlungAbzugField({ anzahlungen, checked, onChange, disabled }: {
  anzahlungen: OpenAnzahlung[]
  checked: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
}) {
  const checkedSet = new Set(checked)
  function toggle(id: number) {
    onChange(checkedSet.has(id) ? checked.filter(c => c !== id) : [...checked, id])
  }
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
      <legend className="admin-form-label">Anzahlung abziehen</legend>
      {anzahlungen.map(a => (
        <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 13, cursor: disabled ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={checkedSet.has(a.id)} disabled={disabled} onChange={() => toggle(a.id)} />
          <span>
            {a.invoice_number} vom {fmtDate(a.created_at)}
            {a.anzahlung_pct ? ` (${a.anzahlung_pct.toLocaleString('de-CH')} %)` : ''}
            {' — '}{fmtCHF(a.total_amount)}
          </span>
        </label>
      ))}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
        Die Rechnung zeigt das volle Total und zieht die Anzahlung inkl. MWST ab; der
        Einzahlungsschein lautet auf den Restbetrag.
      </div>
    </fieldset>
  )
}

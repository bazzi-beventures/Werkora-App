// Auswahl «Neue Version» / «Weitere Rechnung» im Rechnung-Erstellen-Dialog
// (WW-39/WW-47). Geteilt von Projektdetail und Rechnungen-Screen; die Regeln
// liegen in utils/invoiceMode.ts, hier nur die Darstellung.

import type { InvoiceMode } from '../utils/invoiceMode'

interface Props {
  value: InvoiceMode
  onChange: (next: InvoiceMode) => void
  disabled?: boolean
  idPrefix: string
}

const OPTIONS: { mode: InvoiceMode; label: string; hint: string }[] = [
  {
    mode: 'replace',
    label: 'Neue Version der letzten Rechnung',
    hint: 'Ersetzt die jüngste Rechnung; deren offene Fassung wird archiviert.',
  },
  {
    mode: 'additional',
    label: 'Weitere Rechnung',
    hint: 'Bestehende Rechnungen bleiben gültig. Was schon auf einer Rechnung steht, '
      + 'kommt nicht noch einmal drauf.',
  },
]

export function InvoiceModeField({ value, onChange, disabled, idPrefix }: Props) {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
      <legend className="admin-form-label">Art der Rechnung</legend>
      {OPTIONS.map(opt => (
        <label
          key={opt.mode}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, marginTop: 6, cursor: disabled ? 'default' : 'pointer' }}
        >
          <input
            type="radio"
            name={`${idPrefix}-invoice-mode`}
            checked={value === opt.mode}
            disabled={disabled}
            onChange={() => onChange(opt.mode)}
            style={{ marginTop: 2 }}
          />
          <span>
            <span style={{ fontWeight: 600 }}>{opt.label}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{opt.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

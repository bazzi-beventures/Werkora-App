// Art der Rechnung im Erstellen-Dialog: neue Version, weitere Rechnung oder
// Anzahlung (WW-39/WW-47). Geteilt von Projektdetail und Rechnungen-Screen; die
// Regeln liegen in utils/invoiceMode.ts, hier nur die Darstellung.

import { invoiceModeOptions, type InvoiceMode } from '../utils/invoiceMode'

interface Props {
  value: InvoiceMode
  onChange: (next: InvoiceMode) => void
  // Hat das Projekt schon eine gültige Rechnung? Sonst gibt es nichts zu ersetzen.
  hasActive: boolean
  disabled?: boolean
  idPrefix: string
}

function texts(mode: InvoiceMode, hasActive: boolean): { label: string; hint: string } {
  switch (mode) {
    case 'replace':
      return hasActive
        ? { label: 'Neue Version der letzten Rechnung',
            hint: 'Ersetzt die jüngste Rechnung; deren offene Fassung wird archiviert.' }
        : { label: 'Rechnung', hint: 'Verrechnet Rapporte bzw. Offerte wie gewohnt.' }
    case 'additional':
      return { label: 'Weitere Rechnung',
        hint: 'Bestehende Rechnungen bleiben gültig. Was schon auf einer Rechnung steht, '
          + 'kommt nicht noch einmal drauf.' }
    case 'anzahlung':
      return { label: 'Anzahlung',
        hint: 'Ein Prozentsatz der Offerte (netto, zzgl. MWST). Die Schlussrechnung '
          + 'verrechnet später alles und zieht die Anzahlung ab.' }
  }
}

export function InvoiceModeField({ value, onChange, hasActive, disabled, idPrefix }: Props) {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
      <legend className="admin-form-label">Art der Rechnung</legend>
      {invoiceModeOptions(hasActive).map(mode => {
        const t = texts(mode, hasActive)
        return (
          <label
            key={mode}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, marginTop: 6, cursor: disabled ? 'default' : 'pointer' }}
          >
            <input
              type="radio"
              name={`${idPrefix}-invoice-mode`}
              checked={value === mode}
              disabled={disabled}
              onChange={() => onChange(mode)}
              style={{ marginTop: 2 }}
            />
            <span>
              <span style={{ fontWeight: 600 }}>{t.label}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{t.hint}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

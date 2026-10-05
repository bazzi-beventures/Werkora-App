// «Allg. Abzüge» im Rechnung-Erstellen-Dialog (Projektdetail UND Rechnungen-Screen),
// Feature allgemeine_abzuege. Ein Häkchen; ist es gesetzt, erscheinen der
// Prozentsatz und die Basis (Arbeitszeit, Material inkl. weitere Produkte,
// Fahrtkosten). Die Logik (Vorbelegung, Validierung, Payload) liegt in
// utils/generalDeduction.ts, hier ist nur die Darstellung.

import {
  GENERAL_DEDUCTION_SECTIONS,
  generalDeductionError,
  type GeneralDeductionState,
} from '../utils/generalDeduction'

interface GeneralDeductionFieldsProps {
  /** Bezeichnung aus der Mandanten-Konfiguration («Allg. Abzüge»). */
  label: string
  value: GeneralDeductionState
  onChange: (next: GeneralDeductionState) => void
  disabled?: boolean
  idPrefix: string
}

export function GeneralDeductionFields({ label, value, onChange, disabled, idPrefix }: GeneralDeductionFieldsProps) {
  const error = generalDeductionError(value)
  const chosen = new Set(value.sections)

  function toggleSection(key: GeneralDeductionState['sections'][number]) {
    onChange({
      ...value,
      sections: chosen.has(key) ? value.sections.filter(s => s !== key) : [...value.sections, key],
    })
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: disabled ? 'default' : 'pointer' }}>
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={e => onChange({ ...value, enabled: e.target.checked })}
        />
        <span style={{ fontWeight: 600 }}>{label}</span>
      </label>
      {value.enabled && (
        <div style={{ margin: '8px 0 0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <label className="admin-form-label" htmlFor={`${idPrefix}-gd-pct`} style={{ margin: 0 }}>
              Abzug in %
            </label>
            <input
              id={`${idPrefix}-gd-pct`}
              className="admin-form-input"
              inputMode="decimal"
              style={{ width: 90 }}
              value={value.pct}
              placeholder="z.B. 1.2"
              disabled={disabled}
              onChange={e => onChange({ ...value, pct: e.target.value })}
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>Gilt auf:</div>
          {GENERAL_DEDUCTION_SECTIONS.map(s => (
            <label
              key={s.key}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 2px', fontSize: 13, cursor: disabled ? 'default' : 'pointer' }}
            >
              <input
                type="checkbox"
                checked={chosen.has(s.key)}
                disabled={disabled}
                onChange={() => toggleSection(s.key)}
              />
              {s.label}
            </label>
          ))}
          {error && (
            <div style={{ fontSize: 12, color: 'var(--danger, #c00)', marginTop: 4 }}>{error}</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Nach den Rabatten, vor der MwSt. Montage, Sonderpositionen und Zusatzaufwand
            bleiben ausserhalb.
          </div>
        </div>
      )}
    </div>
  )
}

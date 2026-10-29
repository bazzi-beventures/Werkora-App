// Fahrzeitkosten im Erstellen-Dialog an- oder abwählen (Spec
// docs/specs/anzahlung-und-rapportauswahl.md §4). Jede Rechnung trägt sie sonst
// einmal — auch die zweite und dritte Teilrechnung.

interface Props {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}

export function TravelCostField({ checked, onChange, disabled }: Props) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: disabled ? 'default' : 'pointer' }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
        />
        <span style={{ fontWeight: 600 }}>Fahrzeitkosten verrechnen</span>
      </label>
      <div style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0 24px' }}>
        {checked
          ? 'Die Fahrzeitkosten des Projekts bzw. der Offerte kommen auf die Rechnung.'
          : 'Die Rechnung erscheint ohne Fahrzeitkosten — z. B. weil sie schon auf einer anderen Rechnung stehen.'}
      </div>
    </div>
  )
}

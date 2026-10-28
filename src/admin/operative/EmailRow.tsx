// Eine Adress-Zeile unter dem Standard-Empfänger: Eingabefeld + Entfernen-Knopf.
// Geteilt von Offerten-Versand (SendQuoteDialog) und Auftragsbestätigung
// (SendQuoteMailDialog).
// `prefix` markiert CC-Zeilen sichtbar, damit man sie in der Liste nicht mit einem
// weiteren Haupt-Empfänger verwechselt.
export function EmailRow({ value, label, prefix, disabled, onChange, onRemove }: {
  value: string
  label: string
  prefix?: string
  disabled: boolean
  onChange: (v: string) => void
  onRemove: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      {prefix && (
        <span style={{ fontSize: 12, color: 'var(--muted)', width: 24, flexShrink: 0 }}>{prefix}</span>
      )}
      <input
        className="admin-form-input"
        style={{ flex: 1, minWidth: 0 }}
        type="email"
        value={value}
        aria-label={label}
        placeholder="weitere@example.com"
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      />
      <button
        type="button"
        className="admin-btn admin-btn-danger admin-btn-sm"
        title="Entfernen"
        aria-label={`${label} entfernen`}
        disabled={disabled}
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  )
}

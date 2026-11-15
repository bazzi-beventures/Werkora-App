import { DAUER_STUFEN, dauerLabel } from '../../api/serviceBegleitung'

/** Auswahl einer Dauer; «—» = keine Angabe. Auch in Einstellungen → Termindauer. */
export function DauerAuswahl({ label, wert, disabled, onChange }: {
  label: string; wert: number | null; disabled?: boolean; onChange: (v: number | null) => void
}) {
  return (
    <label style={{ flex: '0 1 110px' }}>
      <span className="admin-form-label">{label}</span>
      <select className="admin-form-input" value={wert ?? ''} disabled={disabled} aria-label={label}
              onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">—</option>
        {wert != null && !(DAUER_STUFEN as readonly number[]).includes(wert)
          && <option value={wert}>{dauerLabel(wert)}</option>}
        {DAUER_STUFEN.map(m => <option key={m} value={m}>{dauerLabel(m)}</option>)}
      </select>
    </label>
  )
}

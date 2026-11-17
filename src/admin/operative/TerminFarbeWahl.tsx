import type { TerminFarbe } from '../../api/admin/tenant'
import { useTerminFarben } from './terminFarben'

// Auswahl der Terminfarbe im Termin-Formular (Projektmaske und Planungs-Panel),
// docs/specs/termin-farbkategorien.md. Ohne Feature oder ohne gepflegte
// Kategorien erscheint nichts. Ein Schlüssel, den der Betrieb inzwischen
// gelöscht hat, bleibt als «(entfernt)» wählbar, bis jemand umstellt — sonst
// zeigte das Feld still «Keine» und das Speichern nähme die Farbe weg.
interface Props {
  value: string | undefined
  onChange: (key: string) => void
  disabled?: boolean
}

/** Lädt die Terminfarben selbst (Projektmaske). */
export function TerminFarbeWahlGeladen(props: Props) {
  return <TerminFarbeWahl {...props} kategorien={useTerminFarben()} />
}

/** Mit mitgegebener Liste (Einsatzplanung: aus der dort geladenen Config). */
export function TerminFarbeWahl({ value, onChange, disabled, kategorien }: Props & {
  kategorien: TerminFarbe[]
}) {
  if (kategorien.length === 0) return null
  const aktuell = kategorien.find(k => k.key === value)
  const verwaist = !!value && !aktuell
  return (
    <div className="admin-form-group" style={{ margin: 0 }}>
      <label className="admin-form-label">Terminfarbe</label>
      <div className="termin-farbe-wahl">
        <span
          className="termin-farbe-punkt"
          style={{ background: aktuell?.color ?? 'transparent' }}
          aria-hidden="true"
        />
        <select
          className="admin-form-select"
          aria-label="Terminfarbe"
          value={value ?? ''}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">Keine (Farbe der Einsatz-Art)</option>
          {kategorien.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          {verwaist && <option value={value}>(entfernt)</option>}
        </select>
      </div>
    </div>
  )
}

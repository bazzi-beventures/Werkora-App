import type { AppointmentKind } from '../../api/admin'
import type { TerminFarbe } from '../../api/admin/tenant'
import { useTerminFarben } from './terminFarben'

// «Sonstiges» genauer: welche Terminfarbe des Betriebs (Einstellungen →
// Terminfarben) der Termin ist — Schulung, Büro, Reservation … Spec
// docs/specs/termin-farbkategorien.md §8. Alle anderen Termin-Typen (Montage,
// Service …) sind geplante Einsätze und tragen keine eigene Farbe: der Plan
// zeichnet sie in der Standardfarbe der Kundeneinsätze. Die Wahl setzt Farbe und
// Bezeichnung in einem Zug; «Andere» lässt die freie Bezeichnung wie bisher.

/** Die Kategorien, die «Sonstiges» sein kann — ohne den Standard-Eintrag, der
 *  ist kein Sonstiges, sondern der geplante Einsatz selbst. */
export function sonstigesKategorien(kategorien: TerminFarbe[]): TerminFarbe[] {
  return kategorien.filter(k => !k.standard)
}

/** Termin-Typ wechseln: wer «Sonstiges» verlässt, plant einen Einsatz — die
 *  Farbe fällt weg ('' = entfernen), der Plan nimmt die Standardfarbe. */
export function typWechsel(kind: AppointmentKind, colorCategory: string | undefined): string | undefined {
  return kind === 'sonstiges' ? colorCategory : (colorCategory ? '' : colorCategory)
}

interface Props {
  kategorien: TerminFarbe[]
  value: string | undefined
  /** key '' = «Andere» (freie Bezeichnung) */
  onChange: (key: string, label: string) => void
  disabled?: boolean
}

export function SonstigesWahl({ kategorien, value, onChange, disabled }: Props) {
  const liste = sonstigesKategorien(kategorien)
  if (liste.length === 0) return null
  const verwaist = !!value && !liste.some(k => k.key === value)
  return (
    <div className="admin-form-group" style={{ margin: 0 }}>
      <label className="admin-form-label">Was genau?</label>
      <select
        className="admin-form-select"
        aria-label="Was genau?"
        value={value ?? ''}
        disabled={disabled}
        onChange={e => {
          const k = liste.find(x => x.key === e.target.value)
          onChange(k?.key ?? '', k?.label ?? '')
        }}
      >
        {liste.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
        {verwaist && <option value={value}>(entfernt)</option>}
        <option value="">Andere (eigene Bezeichnung)</option>
      </select>
    </div>
  )
}

/** Lädt die Terminfarben selbst (Projektmaske) — erst, wenn ein Termin offen ist. */
export function SonstigesWahlGeladen(props: Omit<Props, 'kategorien'>) {
  return <SonstigesWahl {...props} kategorien={useTerminFarben()} />
}

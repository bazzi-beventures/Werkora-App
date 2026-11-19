// Auswahl «Ganzer Tag / Vormittag / Nachmittag» im Absenz-Antrag (WW-93) —
// eine Komponente für die Mitarbeiter-App und «Meine Zeit» im Admin. Nur bei
// eintägiger Absenz sichtbar; die Zeile drumherum stellt der Aufrufer.
import { HALBER_TAG_LABELS, type HalberTag } from './halberTag'

interface Props {
  value: HalberTag | undefined
  onChange: (v: HalberTag | undefined) => void
  className: string
  id?: string
}

export function HalberTagWahl({ value, onChange, className, id }: Props) {
  return (
    <select
      id={id}
      className={className}
      value={value ?? ''}
      onChange={e => onChange(e.target.value === 'am' || e.target.value === 'pm' ? e.target.value : undefined)}
    >
      <option value="">Ganzer Tag</option>
      {(Object.keys(HALBER_TAG_LABELS) as HalberTag[]).map(k => (
        <option key={k} value={k}>{HALBER_TAG_LABELS[k]}</option>
      ))}
    </select>
  )
}

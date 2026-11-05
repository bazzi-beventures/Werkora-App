// Name in der linken Spalte von Plantafel und Tagesplan (WW-68). Mit Handler ein
// Knopf, der in die Mitarbeiter-Ansicht dieses Monteurs springt — bisher ging das
// nur über den Reiter «Mitarbeiter» oben und die Auswahl dort. Ohne Handler (die
// Ansicht ist beim Mandanten aus) und in der Sammelzeile «Ohne Monteur» bleibt es
// beim Text: ein Knopf, der nirgendwohin führt, wäre schlimmer als keiner.

interface Props {
  rowId: string | null
  label: string
  onOpenStaff?: (staffId: string) => void
  className?: string
}

export default function StaffNameCell({ rowId, label, onOpenStaff, className }: Props) {
  if (!rowId || !onOpenStaff) return <span className={className}>{label}</span>
  return (
    <button
      type="button"
      className={`project-cal-name-link${className ? ` ${className}` : ''}`}
      onClick={() => onOpenStaff(rowId)}
      title={`Mitarbeiter-Ansicht von ${label} öffnen`}
    >
      {label}
    </button>
  )
}

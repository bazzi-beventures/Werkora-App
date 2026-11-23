import type { TerminFarbe } from '../../api/admin/tenant'
import { useTerminFarben } from './terminFarben'
import { TerminFarbeWahl } from './TerminFarbeWahl'

// Markierung an jedem Termin-Typ eines Kundenprojekts (docs/specs/
// termin-farbkategorien.md §9, WW-100/WW-101): ein Eintrag der Terminfarben kann
// `markierung` tragen, etwa «Reservation (Kunde hat noch nicht bestätigt)». Das
// Häkchen setzt seine Farbe, ohne dass sich der Termin-Typ (Montage, Ausmass …)
// ändert; ohne Häkchen gilt wieder die Standardfarbe der Kundeneinsätze (§8).
// Trägt der Termin noch eine ältere andere Farbe, bleibt dazu das Feld
// «Terminfarbe» sichtbar, bis jemand sie entfernt.

/** Der Eintrag, der an jedem Termin-Typ wählbar ist — höchstens einer. */
export function markierungDer(kategorien: TerminFarbe[]): TerminFarbe | undefined {
  return kategorien.find(k => k.markierung)
}

interface Props {
  value: string | undefined
  /** key der Markierung beim Setzen, '' beim Entfernen */
  onChange: (key: string) => void
  disabled?: boolean
}

export function MarkierungWahl({ value, onChange, disabled, kategorien }: Props & {
  kategorien: TerminFarbe[]
}) {
  const m = markierungDer(kategorien)
  const altfarbe = !!value && value !== m?.key
  return (
    <>
      {m && (
        <label className="termin-markierung">
          <input
            type="checkbox"
            checked={value === m.key}
            disabled={disabled}
            onChange={e => onChange(e.target.checked ? m.key : '')}
          />
          <span className="termin-farbe-punkt" style={{ background: m.color }} aria-hidden="true" />
          {m.label}
        </label>
      )}
      {altfarbe && (
        <TerminFarbeWahl value={value} kategorien={kategorien} onChange={onChange} disabled={disabled} />
      )}
    </>
  )
}

/** Lädt die Terminfarben selbst (Projektmaske) — erst, wenn ein Termin offen ist. */
export function MarkierungWahlGeladen(props: Props) {
  return <MarkierungWahl {...props} kategorien={useTerminFarben()} />
}

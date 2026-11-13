import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react'
import { DATUM_MIN, datumMax, istPlausiblesDatum } from '../utils/format'

// Natives Datums-/Zeitfeld, das sich während der Eingabe nicht von React
// nachführen lässt.
//
// Warum nicht einfach `<input type="date" value={…} onChange={…}>`: Ein
// kontrolliertes Feld bekommt von React nach jedem Tastendruck das
// `value`-ATTRIBUT neu geschrieben (Attribut-Sync für Formular-Reset). Bei einem
// leeren Feld fällt das nicht auf — der Browser meldet erst ein `change`, wenn
// Tag, Monat und Jahr vollständig sind. Steht aber schon ein Datum oder eine
// Uhrzeit drin, ist jede einzelne Ziffer ein gültiger neuer Wert, React schreibt
// das Attribut, und Firefox/Safari bauen daraufhin ihre Segment-Eingabe neu auf:
// die getippte Ziffer ist weg, der Fokus springt ins erste Segment. Übrig bleibt
// der Kalender-Picker mit der Maus — genau das Fehlerbild «Startdatum gesetzt →
// nur noch per Maus änderbar».
//
// Deshalb ist das Feld hier unkontrolliert: React fasst `value` im DOM nie an.
// Der Wert von aussen wird per Ref übernommen, und zwar nur, solange das Feld
// NICHT fokussiert ist (spätestens beim Verlassen). So überschreibt auch ein
// Neuladen im Hintergrund nie, was gerade getippt wird.
//
// Ein unplausibles Datum (vor 2000 oder mehr als zehn Jahre voraus) wird nicht
// weitergereicht; `min`/`max` stehen per Default auf diesen Grenzen. Das Jahr-Segment nimmt auch drei Ziffern an:
// «206» statt «2026» ergab den gültigen Wert 0206-09-08, und der Termin
// verschwand aus jedem Plan (docs/specs/kachel-projekte-ueberfaellig.md §2.1).
// Der Browser markiert das Feld dann als ungültig; beim Verlassen steht wieder
// der letzte gültige Wert drin. Zwischenstände beim Tippen («0002», «0020»)
// fallen damit ebenfalls weg — sie waren nie gemeint.

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange'
> & {
  type: 'date' | 'time'
  /** 'YYYY-MM-DD' bzw. 'HH:MM'; '' = leer. */
  value: string
  onValueChange: (value: string) => void
}

export function DateTimeInput({ type, value, onValueChange, onBlur, min, max, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const latest = useRef(value)
  const untergrenze = min != null ? String(min) : type === 'date' ? DATUM_MIN : undefined
  const obergrenze = max != null ? String(max) : type === 'date' ? datumMax() : undefined

  useLayoutEffect(() => {
    latest.current = value
    const el = ref.current
    if (!el || el.value === value) return
    if (el.ownerDocument.activeElement === el) return
    el.value = value
  }, [value])

  return (
    <input
      {...rest}
      ref={ref}
      type={type}
      min={untergrenze}
      max={obergrenze}
      onChange={e => {
        const next = e.target.value
        // Gefiltert wird nur gegen die PLAUSIBILITÄTS-Grenze, nicht gegen ein
        // eigenes min/max des Aufrufers: «Serie bis» trägt min = Startdatum und
        // prüft selbst — mit einer Meldung, die der Planer versteht. Verschluckt
        // würde hier nur, was als Jahr nie gemeint sein kann.
        if (type === 'date' && !istPlausiblesDatum(next)) return
        onValueChange(next)
      }}
      onBlur={e => {
        // Was während des Fokus von aussen kam (oder vom Browser verworfen
        // wurde), jetzt nachziehen — danach zeigt das Feld wieder den Zustand.
        if (e.currentTarget.value !== latest.current) e.currentTarget.value = latest.current
        onBlur?.(e)
      }}
    />
  )
}

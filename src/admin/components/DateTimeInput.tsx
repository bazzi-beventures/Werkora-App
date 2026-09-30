import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react'

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

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange'
> & {
  type: 'date' | 'time'
  /** 'YYYY-MM-DD' bzw. 'HH:MM'; '' = leer. */
  value: string
  onValueChange: (value: string) => void
}

export function DateTimeInput({ type, value, onValueChange, onBlur, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const latest = useRef(value)

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
      onChange={e => onValueChange(e.target.value)}
      onBlur={e => {
        // Was während des Fokus von aussen kam (oder vom Browser verworfen
        // wurde), jetzt nachziehen — danach zeigt das Feld wieder den Zustand.
        if (e.currentTarget.value !== latest.current) e.currentTarget.value = latest.current
        onBlur?.(e)
      }}
    />
  )
}

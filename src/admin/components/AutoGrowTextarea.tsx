import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'

// Textarea, die mit dem Inhalt mitwächst — von `minRows` bis `maxRows`, danach
// scrollt sie. Gedacht für kurze Freitexte in Dialogen (Rechnungs-Bemerkung,
// Arbeitsbeschrieb): zwei Zeilen reichen im Normalfall, aber wer einen längeren
// Text einfügt, soll ihn sehen statt durch ein Guckloch zu scrollen.
//
// Ansonsten eine ganz normale `<textarea>` — alle übrigen Props (className, value,
// onChange, maxLength, disabled, aria-*) werden durchgereicht.

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  // Startgrösse und Untergrenze — die Maske springt beim Leeren nicht kleiner.
  minRows?: number
  // Obergrenze; darüber bleibt die Höhe stehen und der Inhalt scrollt.
  maxRows?: number
}

export function AutoGrowTextarea({ minRows = 2, maxRows = 10, style, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // useLayoutEffect statt useEffect: die Höhe wird vor dem Paint gesetzt, sonst
  // blitzt beim Öffnen eines vorbelegten Feldes kurz die Startgrösse auf.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const cs = window.getComputedStyle(el)
    // `line-height: normal` ist nicht in px auflösbar — dann aus der Schriftgrösse
    // schätzen, damit die Höhe nicht auf NaN läuft.
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 20
    // Alle Felder laufen mit `box-sizing: border-box` (index.css), die gesetzte Höhe
    // enthält also Innenabstand und Rahmen — beides muss auf die Zeilenhöhe drauf.
    const frame =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) +
      (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)

    // Erst zurücksetzen: scrollHeight kennt sonst nur die aktuelle Höhe als
    // Untergrenze und das Feld würde beim Löschen von Text nie wieder schrumpfen.
    el.style.height = 'auto'
    const min = lineHeight * minRows + frame
    const max = lineHeight * maxRows + frame
    el.style.height = `${Math.min(Math.max(el.scrollHeight, min), max)}px`
    // Scrollbalken erst ab der Obergrenze — darunter gäbe es nichts zu scrollen.
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  })

  return (
    <textarea
      ref={ref}
      // Ohne die eigene Höhe hätte der Nutzer zwei konkurrierende Grössen: die
      // gezogene und die berechnete. Waagrecht bleibt es ohnehin bei 100 % Breite.
      style={{ resize: 'none', fontFamily: 'inherit', ...style }}
      {...rest}
    />
  )
}

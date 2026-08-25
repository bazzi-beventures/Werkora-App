import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, Dispatch, DragEvent, SetStateAction } from 'react'

// ── Automatisch mitwachsendes Textfeld ─────────────────────────────
// Ersatz für ein einzeiliges <input> in den Positionszeilen: statt lange
// Bezeichnungen abzuschneiden, wächst das Feld mit dem Inhalt in die Höhe,
// sodass der ganze Text sichtbar bleibt. Verhält sich sonst wie ein
// <input class="admin-form-input"> (gleiche Optik, gleiche Flex-Breite).

interface AutoGrowTextareaProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  style?: CSSProperties
  title?: string
}

export function AutoGrowTextarea({ value, onChange, placeholder, className, style, title }: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Höhe an den Inhalt anpassen: erst auf 'auto' zurücksetzen (sonst schrumpft es
  // beim Löschen nie), dann auf die Inhaltshöhe ziehen. Der Border-Anteil kommt
  // dazu, weil box-sizing:border-box gilt und scrollHeight den Rahmen nicht enthält.
  // useLayoutEffect: noch vor dem Paint, damit es beim ersten Rendern nicht flackert.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      className={className ?? 'admin-form-input'}
      value={value}
      placeholder={placeholder}
      title={title}
      onChange={e => onChange(e.target.value)}
      // Keine manuelle Grösse und keine innere Scrollleiste — die Höhe steuert
      // allein der Inhalt. Lange Wörter/Zeilen brechen um statt zu überlaufen.
      style={{ resize: 'none', overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...style }}
    />
  )
}

// ── Positionen verschieben ─────────────────────────────────────────
// Reine Array-Verschiebung, ausserhalb der Komponente gehalten, damit sie
// unabhängig unit-testbar ist (siehe QuoteRowControls.test.tsx).
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// Verschiebe-Verhalten für eine Positionsliste: nativer HTML5-Drag am Griff
// (Desktop) plus ▲/▼-Buttons (Touch/Tastatur). Pro Liste einmal aufrufen —
// jeder Aufruf hält seinen eigenen Drag-Zustand, damit sich mehrere Listen im
// selben Formular nicht gegenseitig stören.
export function useReorder<T>(setRows: Dispatch<SetStateAction<T[]>>) {
  const [fromIndex, setFromIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function moveRow(from: number, to: number) {
    setRows(rows => moveItem(rows, from, to))
  }

  // Nur der Griff ist draggable — so bleibt Textauswahl in den Feldern möglich.
  function handleProps(i: number) {
    return {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        setFromIndex(i)
        e.dataTransfer.effectAllowed = 'move'
        // Firefox startet den Drag nur, wenn Daten gesetzt sind.
        e.dataTransfer.setData('text/plain', String(i))
      },
      onDragEnd: () => { setFromIndex(null); setOverIndex(null) },
    }
  }

  // Die Zeile selbst ist Drop-Ziel; data-drop-target steuert nur die Hervorhebung.
  function rowProps(i: number) {
    return {
      onDragOver: (e: DragEvent) => {
        if (fromIndex === null) return
        e.preventDefault()
        if (overIndex !== i) setOverIndex(i)
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        if (fromIndex !== null) moveRow(fromIndex, i)
        setFromIndex(null)
        setOverIndex(null)
      },
      'data-drop-target': fromIndex !== null && overIndex === i && fromIndex !== i ? 'true' : undefined,
    }
  }

  return { moveRow, handleProps, rowProps }
}

/** Was `useReorder` liefert — als eigener Typ, damit Sektionen es als Prop
 *  durchreichen können (QuoteFieldsets). */
export type Reorder = ReturnType<typeof useReorder<never>>

interface RowReorderProps {
  index: number
  count: number
  moveRow: (from: number, to: number) => void
  handleProps: (i: number) => {
    draggable: boolean
    onDragStart: (e: DragEvent) => void
    onDragEnd: () => void
  }
}

// Griff + ▲/▼ am Zeilenanfang. Auf Touch-Geräten wird der Griff per CSS
// ausgeblendet (nativer Drag greift dort nicht) — dort verschiebt man mit den
// Pfeilen. Als erstes Kind der .quote-row platzieren.
export function RowReorder({ index, count, moveRow, handleProps }: RowReorderProps) {
  return (
    <span className="quote-row-reorder">
      <span
        {...handleProps(index)}
        className="quote-drag-handle"
        role="button"
        aria-label="Zeile zum Verschieben ziehen"
        title="Ziehen zum Verschieben"
      >⠿</span>
      <button
        type="button"
        className="admin-btn admin-btn-secondary admin-btn-sm quote-move-btn"
        onClick={() => moveRow(index, index - 1)}
        disabled={index === 0}
        aria-label="Position nach oben"
        title="Nach oben"
      >▲</button>
      <button
        type="button"
        className="admin-btn admin-btn-secondary admin-btn-sm quote-move-btn"
        onClick={() => moveRow(index, index + 1)}
        disabled={index === count - 1}
        aria-label="Position nach unten"
        title="Nach unten"
      >▼</button>
    </span>
  )
}

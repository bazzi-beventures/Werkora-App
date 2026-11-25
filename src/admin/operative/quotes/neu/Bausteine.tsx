// Bausteine der Maske «Offerte neu» (docs/specs/offerte-neu.md §4): beschriftetes
// Feld, gerechneter Wert, Zeilen-Menü und Blockkopf. Jedes Feld trägt seine
// Beschriftung über dem Feld statt nur als Platzhalter — ein gefülltes Feld («1»,
// «Stk») sagt sonst nicht mehr, was es ist. Das war der Kern der Rückmeldung.

import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { fmtCHF } from '../../../utils/format'

/** Beschriftetes Eingabefeld. `zahl` öffnet am Handy die Zahlentastatur. */
export function Feld({ label, value, onChange, zahl = false, placeholder, disabled, title, berechnet = false }: {
  label: string
  value: string
  onChange: (v: string) => void
  zahl?: boolean
  placeholder?: string
  disabled?: boolean
  title?: string
  /** Wert kommt aus einer Rechnung (EK × Aufschlag), bleibt aber überschreibbar. */
  berechnet?: boolean
}) {
  const id = useId()
  return (
    <div className="on-feld">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`admin-form-input${berechnet ? ' on-input-berechnet' : ''}`}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        title={title}
        inputMode={zahl ? 'decimal' : undefined}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

/** Betrag ohne «CHF» — in den schmalen Rechenfeldern am Handy zählt jede Stelle;
 *  die Währung steht im Blockkopf. */
function fmtBetrag(n: number): string {
  return n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Gerechneter Wert, nicht editierbar — gestrichelt, damit er sich vom Feld abhebt. */
export function Rechenwert({ label, betrag, text }: { label: string; betrag?: number | null; text?: string }) {
  return (
    <div className="on-feld">
      <span className="on-feld-label">{label}</span>
      <span className="on-rechenwert">{text ?? (betrag == null ? '—' : fmtBetrag(betrag))}</span>
    </div>
  )
}

export interface MenuAktion {
  label: string
  onClick: () => void
  disabled?: boolean
  gefahr?: boolean
  /** Häkchen-Aktion (Option, verstecken): zeigt ✓, wenn an. */
  an?: boolean
}

/** «⋯» am Zeilenende: Verschieben, Option, Entfernen. Hält die Zeile frei von
 *  Knöpfen, die am Handy je eine eigene Zeile brauchten. */
export function ZeilenMenu({ aktionen, label = 'Aktionen zur Position' }: { aktionen: MenuAktion[]; label?: string }) {
  const [offen, setOffen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!offen) return
    function weg(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOffen(false)
    }
    function esc(e: KeyboardEvent) {
      // Esc schliesst nur das Menü, nicht die ganze Offerte.
      if (e.key === 'Escape') { e.stopPropagation(); setOffen(false) }
    }
    document.addEventListener('mousedown', weg)
    document.addEventListener('touchstart', weg)
    window.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('mousedown', weg)
      document.removeEventListener('touchstart', weg)
      window.removeEventListener('keydown', esc, true)
    }
  }, [offen])
  if (aktionen.length === 0) return null
  return (
    <div className="on-menu" ref={ref}>
      <button type="button" className="on-menu-knopf" aria-label={label} aria-haspopup="menu"
        aria-expanded={offen} onClick={() => setOffen(o => !o)}>⋯</button>
      {offen && (
        <div className="on-menu-liste" role="menu">
          {aktionen.map(a => (
            <button key={a.label} type="button" role="menuitem" disabled={a.disabled}
              className={a.gefahr ? 'on-menu-gefahr' : undefined}
              onClick={() => { a.onClick(); setOffen(false) }}>
              {a.an !== undefined && <span className="on-menu-haken" aria-hidden>{a.an ? '✓' : ''}</span>}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Kopf eines Blocks: Titel links, Summe rechts, darunter optional ein Hinweis. */
export function BlockKopf({ titel, summe, hinweis }: { titel: string; summe: number | null; hinweis?: ReactNode }) {
  return (
    <div className="on-block-kopf">
      <h4>{titel}</h4>
      {summe != null && <span className="on-zahl">{fmtCHF(summe)}</span>}
      {hinweis && <p className="on-block-hinweis">{hinweis}</p>}
    </div>
  )
}

/** Marke an einer Position: woher sie kommt (Katalog, Lieferant) oder was sie ist. */
export function Marke({ children, ton = 'neutral' }: { children: ReactNode; ton?: 'neutral' | 'akzent' | 'warn' }) {
  return <span className={`on-marke on-marke-${ton}`}>{children}</span>
}

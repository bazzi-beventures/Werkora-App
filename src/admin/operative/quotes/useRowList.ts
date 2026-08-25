// Zeilenlisten der Offert-Formulare (Charge H2).
//
// Sechs Listen (Lohn, Material, freie Positionen, Sonderaufwände, Montage,
// Sonderpositionen) hatten je Maske ihr eigenes update/add/remove als Closure über
// `set*Rows(prev => …)` — dreissig fast gleiche Zeilen pro Formular. Das ist hier
// einmal generisch.
//
// `normalize` ist der Haken für Regeln, die beim Ändern greifen: bei den
// Produktzeilen treibt EK × Aufschlag den Verkaufspreis (siehe quoteRows.ts).

import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

export interface RowList<T> {
  rows: T[]
  /** Für Fälle, die keine der Operationen abdeckt (Reorder, Bulk-Ersetzen). */
  set: Dispatch<SetStateAction<T[]>>
  update: (i: number, patch: Partial<T>) => void
  add: (row: T) => void
  append: (rows: T[]) => void
  remove: (i: number) => void
  reset: (rows: T[]) => void
}

export function useRowList<T>(
  initial: T[] | (() => T[]),
  normalize?: (next: T, patch: Partial<T>) => T,
): RowList<T> {
  const [rows, set] = useState<T[]>(initial)
  return {
    rows,
    set,
    update: (i, patch) => set(prev => prev.map((r, j) => {
      if (j !== i) return r
      const next = { ...r, ...patch }
      return normalize ? normalize(next, patch) : next
    })),
    add: row => set(prev => [...prev, row]),
    append: more => set(prev => [...prev, ...more]),
    remove: i => set(prev => prev.filter((_, j) => j !== i)),
    reset: next => set(next),
  }
}

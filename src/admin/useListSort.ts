// Sortierung einer seitenweisen Admin-Liste (Offerten, Rechnungen): welcher
// Spaltenkopf, welche Richtung.
//
// Wie bei den Filtern gehört der Sprung auf Seite 1 in denselben Handler wie
// der Klick (`toggle(k); list.setPage(1)`): Seite 7 einer anderen Reihenfolge ist
// eine beliebige Seite, und so geht nur EINE Abfrage raus (siehe usePagedList).

import { useCallback, useState } from 'react'
import type { SortDir } from '../api/admin/listPage'

export interface ListSort<K extends string> {
  key: K
  dir: SortDir
}

/** Nächster Zustand nach einem Klick auf `key`: dieselbe Spalte dreht die
 *  Richtung, eine andere beginnt aufsteigend (wie die Projektliste). */
export function nextSort<K extends string>(prev: ListSort<K>, key: K): ListSort<K> {
  if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: 'asc' }
}

export function useListSort<K extends string>(initial: ListSort<K>) {
  const [sort, setSort] = useState<ListSort<K>>(initial)
  const toggle = useCallback((key: K) => setSort(prev => nextSort(prev, key)), [])
  return [sort, toggle] as const
}

// Spaltenkopf, der per Klick sortiert — Offerten, Rechnungen und (nur der Pfeil)
// die Projektliste. Sortiert wird auf dem Server: eine Seite hat 50 Zeilen, im
// Browser sortiert stünde die teuerste Offerte womöglich auf Seite 9.
//
// Ein Knopf im <th> statt eines Klicks auf die Zelle selbst: der Knopf ist mit
// der Tastatur erreichbar, und `aria-sort` sagt dem Screenreader, wonach die
// Tabelle gerade sortiert ist.

import type { CSSProperties } from 'react'
import type { SortDir } from '../../api/admin/listPage'
import type { ListSort } from '../useListSort'

export function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span aria-hidden="true" style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 11 }}>
      {active && dir === 'desc' ? '↓' : '↑'}
    </span>
  )
}

// Sieht aus wie der übrige Kopf (Grossbuchstaben, Sperrung, Farbe kommen vom <th>).
const BUTTON_STYLE: CSSProperties = {
  background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer',
  font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
  whiteSpace: 'nowrap',
}

export function SortableTh<K extends string>({ label, sortKey, sort, onSort, title }: {
  label: string
  sortKey: K
  sort: ListSort<K>
  onSort: (key: K) => void
  title?: string
}) {
  const active = sort.key === sortKey
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" style={BUTTON_STYLE} title={title} onClick={() => onSort(sortKey)}>
        {label}
        <SortIcon active={active} dir={sort.dir} />
      </button>
    </th>
  )
}

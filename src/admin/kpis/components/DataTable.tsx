import { useState, useMemo } from 'react'
import type { ColumnDef, SortState } from '../types'
import { useScrollEdge } from '../../hooks/useScrollEdge'

interface Props<T> {
  data: T[]
  columns: ColumnDef<T>[]
  pageSize?: number
  defaultSort?: SortState
  onRowClick?: (row: T) => void
}

export default function DataTable<T extends object>({
  data,
  columns,
  pageSize = 25,
  defaultSort,
  onRowClick,
}: Props<T>) {
  const [sort, setSort] = useState<SortState>(defaultSort ?? { key: columns[0]?.key ?? '', dir: 'desc' })
  const [page, setPage] = useState(0)
  const scrollRef = useScrollEdge<HTMLDivElement>()

  const sorted = useMemo(() => {
    const k = sort.key as keyof T & string
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[k] ?? ''
      const bv = (b as Record<string, unknown>)[k] ?? ''
      if (typeof av === 'number' && typeof bv === 'number') return sort.dir === 'asc' ? av - bv : bv - av
      return sort.dir === 'asc'
        ? String(av).localeCompare(String(bv), 'de')
        : String(bv).localeCompare(String(av), 'de')
    })
  }, [data, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  function toggleSort(key: string) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    )
    setPage(0)
  }

  function cell(col: ColumnDef<T>, row: T): string {
    const v = (row as Record<string, unknown>)[col.key]
    if (col.format) return col.format(v, row)
    if (v == null) return '—'
    if (typeof v === 'number') return v.toLocaleString('de-CH')
    return String(v)
  }

  return (
    <div className="kpi-bi-table-wrap">
      {/* Eigener Scroll-Container: die Tabelle darf breiter als der Viewport sein
          (Mobile), die Pagination-Leiste darunter soll aber stehen bleiben und
          nicht mitscrollen. */}
      <div className="kpi-bi-table-scroll" ref={scrollRef}>
        <table className="admin-table kpi-bi-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ textAlign: col.align ?? 'left', cursor: 'pointer' }}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  {sort.key === col.key && (
                    <span className="kpi-bi-sort">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Keine Daten</td></tr>
            )}
            {paged.map((row, ri) => (
              <tr
                key={ri}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                    {col.render
                      ? col.render((row as Record<string, unknown>)[col.key], row)
                      : cell(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > pageSize && (
        <div className="kpi-bi-pagination">
          <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹</button>
          <span>
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} / {sorted.length}
          </span>
          <button disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>›</button>
        </div>
      )}
    </div>
  )
}

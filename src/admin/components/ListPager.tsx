// Blätterleiste unter einer seitenweisen Admin-Liste (Offerten, Rechnungen).
// Dieselbe Form wie im Kundenstamm: «51–100 von 1071», Zurück/Weiter, Seite x / y.

import { pageCount } from '../../api/admin/listPage'

export function ListPager({ page, pageSize, total, loading, onPage }: {
  page: number
  pageSize: number
  total: number
  /** Während eine Seite lädt, sind die Knöpfe gesperrt — sonst überholt der
   *  zweite Klick den ersten. */
  loading: boolean
  onPage: (page: number) => void
}) {
  if (total <= 0) return null
  const totalPages = pageCount(total, pageSize)
  const rangeStart = (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderTop: '1px solid var(--border)', gap: 12, flexWrap: 'wrap',
      }}
    >
      <div style={{ color: 'var(--muted)', fontSize: 13 }}>
        {rangeStart}–{rangeEnd} von {total}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="admin-btn admin-btn-sm admin-btn-secondary"
            disabled={page <= 1 || loading}
            onClick={() => onPage(Math.max(1, page - 1))}
          >
            ← Zurück
          </button>
          <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 90, textAlign: 'center' }}>
            Seite {page} / {totalPages}
          </span>
          <button
            type="button"
            className="admin-btn admin-btn-sm admin-btn-secondary"
            disabled={page >= totalPages || loading}
            onClick={() => onPage(Math.min(totalPages, page + 1))}
          >
            Weiter →
          </button>
        </div>
      )}
    </div>
  )
}

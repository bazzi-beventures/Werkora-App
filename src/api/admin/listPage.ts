// Seitenweise Admin-Listen (Offerten, Rechnungen): gemeinsame Abfrage und Antwort.
//
// Bis 2026-11 luden beide Listen den ganzen Bestand und filterten im Browser —
// bei über tausend Offerten mit je fünf, sechs Knöpfen pro Zeile spürbar
// langsam, und jeder Tastendruck in der Suche rechnete die ganze Tabelle neu.
// Jetzt filtert der Server (`/pwa/admin/quotes/list`, `/pwa/admin/invoices/list`)
// und schickt eine Seite.

/** Eine Seite einer Admin-Liste. `total` zählt alle Treffer, nicht nur die Seite. */
export interface ListPage<T> {
  rows: T[]
  total: number
  page: number
  page_size: number
}

export interface ListPageQuery {
  page: number
  pageSize: number
  /** Gewählte Status. Leer heisst «keiner» — die Liste ist dann leer, nicht voll. */
  statuses: Iterable<string>
  search?: string
  /** Heutiger Projektleiter des Projekts; null/leer = alle. */
  projektleiterId?: string | null
}

/** Query-String für `…/list`. `status` steht immer drin, auch leer: ein
 *  fehlender Parameter hiesse beim Server «alle Status». */
export function listPageParams(q: ListPageQuery): string {
  const params = new URLSearchParams({
    page: String(q.page),
    page_size: String(q.pageSize),
    status: [...q.statuses].join(','),
  })
  const search = q.search?.trim()
  if (search) params.set('search', search)
  if (q.projektleiterId) params.set('projektleiter_id', q.projektleiterId)
  return params.toString()
}

/** Seitenzahl für `total` Treffer — mindestens 1, damit «Seite 1 / 1» auch bei
 *  einer leeren Liste stimmt. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

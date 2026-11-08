// Zustand einer seitenweisen Admin-Liste (Offerten, Rechnungen): aktuelle Seite,
// entprellte Suche, geladene Seite, Lade- und Fehlerzustand.
//
// Die Filter (Status, Projektleiter) bleiben beim Screen: er baut daraus
// `fetchPage` (useCallback über die Filter) und setzt beim Ändern eines Filters
// selbst `setPage(1)` — im selben Handler, damit React beides zusammenfasst und
// nur EINE Abfrage rausgeht, nicht erst die alte Seite mit dem neuen Filter.

import { useCallback, useEffect, useRef, useState } from 'react'
import { pageCount, type ListPage } from '../api/admin/listPage'

export const LIST_PAGE_SIZE = 50

// Wie im Kundenstamm: nicht jeder Tastendruck ein Roundtrip.
const SEARCH_DEBOUNCE_MS = 300

export function usePagedList<P extends ListPage<unknown>>(
  fetchPage: (page: number, search: string) => Promise<P>,
) {
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState<P | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // Nur die jüngste Anfrage schreibt: wer schnell blättert oder tippt, darf nicht
  // die Antwort einer überholten Seite zu sehen bekommen.
  const seq = useRef(0)

  useEffect(() => {
    const next = searchInput.trim()
    if (next === search) return
    const t = setTimeout(() => {
      setSearch(next)
      // Andere Suche → zurück auf Seite 1: Seite 7 einer anderen Treffermenge
      // ist eine beliebige Seite.
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput, search])

  const reload = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    try {
      const res = await fetchPage(page, search)
      if (mine !== seq.current) return
      setData(res)
      setFailed(false)
    } catch {
      if (mine === seq.current) setFailed(true)
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [fetchPage, page, search])

  useEffect(() => { void reload() }, [reload])

  // Seite gegen die Antwort klemmen: nach dem Archivieren der letzten Zeile der
  // letzten Seite steht man sonst auf einer Seite, die es nicht mehr gibt.
  const totalPages = data ? pageCount(data.total, data.page_size || LIST_PAGE_SIZE) : 1
  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages)
  }, [loading, page, totalPages])

  return { page, setPage, searchInput, setSearchInput, search, data, loading, failed, reload }
}

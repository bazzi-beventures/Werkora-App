import { useEffect, useState, useCallback } from 'react'
import { fetchKpiView } from '../../api/kpiViews'

interface UseKpiDataResult<T> {
  data: T[] | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useKpiData<T>(
  viewName: string,
  filters?: Record<string, string>,
): UseKpiDataResult<T> {
  const [data, setData] = useState<T[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filterKey = filters ? JSON.stringify(filters) : ''

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchKpiView<T>(viewName, filters)
      .then((rows) => { if (!cancelled) { setData(rows); setLoading(false) } })
      .catch(() => { if (!cancelled) { setError('Daten konnten nicht geladen werden.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [viewName, filterKey])

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

  return { data, loading, error, refresh: load }
}

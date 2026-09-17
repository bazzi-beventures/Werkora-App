import { useEffect, useState, useCallback } from 'react'
import { fetchKpiView } from '../../api/kpiViews'
import { getKpiView } from '../../adminSite/tenantScopedApi'

interface UseKpiDataResult<T> {
  data: T[] | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Kennzahlen einer View laden.
 *
 * `tenantId` ist der Mandant der Betreiber-Seite (docs/specs/admin-werkora-ch.md
 * §6.4): gesetzt, ruft der Hook `/pwa/superadmin/tenants/{id}/kpi-views/…` auf,
 * sonst die Mandanten-Route wie bisher. Die LLM-Kosten- und Nutzungs-Views
 * gehören dem Betreiber und sind auf der Plattform-Route auf `PLATFORM_VIEWS`
 * begrenzt — ein Mandant kommt darüber nicht an fremde Projektzahlen.
 */
export function useKpiData<T>(
  viewName: string,
  filters?: Record<string, string>,
  tenantId?: string | null,
): UseKpiDataResult<T> {
  const [data, setData] = useState<T[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filterKey = filters ? JSON.stringify(filters) : ''

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const laden = tenantId
      ? getKpiView<T>(tenantId, viewName, filters ?? {}).then((r) => r.rows)
      : fetchKpiView<T>(viewName, filters)
    laden
      .then((rows) => { if (!cancelled) { setData(rows); setLoading(false) } })
      .catch(() => { if (!cancelled) { setError('Daten konnten nicht geladen werden.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [viewName, filterKey, tenantId])

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

  return { data, loading, error, refresh: load }
}

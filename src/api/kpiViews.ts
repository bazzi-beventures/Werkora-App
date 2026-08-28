import { apiFetch } from './client'

interface KpiViewResponse<T> {
  view: string
  rows: T[]
  count: number
}

export async function fetchKpiView<T>(
  viewName: string,
  filters?: Record<string, string>,
): Promise<T[]> {
  const params = new URLSearchParams(filters)
  const qs = params.toString()
  const url = `/pwa/kpi-views/${viewName}${qs ? '?' + qs : ''}`
  const res = (await apiFetch(url)) as KpiViewResponse<T>
  return res.rows
}

interface PipelineResponse<T> {
  rows: T[]
  count: number
}

export async function fetchProjektPipeline<T>(): Promise<T[]> {
  const res = (await apiFetch('/pwa/kpi-projekt-pipeline')) as PipelineResponse<T>
  return res.rows
}

/** Geplante Lieferantenmarge auf Projektware — eigener Endpoint statt View, weil
 *  die Zähleinheit die Offerten-Entscheidung ist (services/quote_variants.py). */
export async function fetchLieferantenProjektware<T>(): Promise<T> {
  return (await apiFetch('/pwa/kpi-lieferanten-projektware')) as T
}

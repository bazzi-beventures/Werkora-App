import { apiFetch } from './client'

export type KpiStatus = 'normal' | 'good' | 'warning' | 'critical'

export interface KpiItem {
  label: string
  value: string
  unit: string
  status: KpiStatus
}

export interface KpiResponse {
  category: string
  kpis: KpiItem[]
}

export type KpiCategory =
  | 'mandanten'
  | 'pricing'
  | 'projekte'
  | 'arbeitszeit'
  | 'finanzen'
  | 'material'

export async function fetchKpis(category: KpiCategory): Promise<KpiResponse> {
  return apiFetch<KpiResponse>(`/pwa/kpis/${category}`)
}

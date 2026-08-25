// Aftersales-Nachfass: Aufgaben, Versand, Kundenantworten (Modul `aftersales`).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export type AftersalesKind = 'feedback' | 'repair_check'
export type AftersalesStatus =
  | 'scheduled' | 'review' | 'sent' | 'answered' | 'cancelled' | 'failed'

export interface AftersalesPositionItem {
  description: string
  quantity?: number | string
  unit?: string
  unit_price?: number | string
  total_price?: number | string
  category?: string
}

export interface AftersalesSnapshot {
  invoice_number?: string
  total_amount?: number | string | null
  execution_period?: { from?: string; to?: string } | null
  monteur?: string
  projektleiter?: string
  items?: AftersalesPositionItem[]
}

export interface AftersalesTask {
  id: number
  invoice_id: number | null
  project_name: string | null
  customer_name: string | null
  customer_email: string | null
  object_address: string | null
  kind: AftersalesKind
  status: AftersalesStatus
  review_start: string
  send_date: string
  season_year: number | null
  positions_snapshot: AftersalesSnapshot | null
  mail_subject: string | null
  mail_body: string | null
  mail_body_generated_at: string | null
  sent_at: string | null
  response_text: string | null
  responded_at: string | null
  created_at: string
}

export async function listAftersales(status?: AftersalesStatus): Promise<AftersalesTask[]> {
  const qs = status ? `?status=${status}` : ''
  const res = await apiFetch(`/pwa/admin/aftersales${qs}`) as { tasks: AftersalesTask[] }
  return res.tasks
}

export async function getAftersales(id: number): Promise<AftersalesTask> {
  return apiFetch<AftersalesTask>(`/pwa/admin/aftersales/${id}`)
}

export async function updateAftersales(
  id: number,
  fields: { send_date?: string; mail_subject?: string; mail_body?: string },
): Promise<void> {
  await apiFetch(`/pwa/admin/aftersales/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })
}

export async function regenerateAftersalesBody(
  id: number,
): Promise<{ subject: string; body: string }> {
  return apiFetch<{ subject: string; body: string }>(`/pwa/admin/aftersales/${id}/regenerate`, { method: 'POST' })
}

export async function sendAftersalesNow(id: number): Promise<void> {
  await apiFetch(`/pwa/admin/aftersales/${id}/send`, { method: 'POST' })
}

export async function cancelAftersales(id: number): Promise<void> {
  await apiFetch(`/pwa/admin/aftersales/${id}/cancel`, { method: 'POST' })
}

export async function reactivateAftersales(id: number): Promise<{ new_status: AftersalesStatus }> {
  return apiFetch<{ new_status: AftersalesStatus }>(`/pwa/admin/aftersales/${id}/reactivate`, { method: 'POST' })
}

// Zeitkorrektur-Anträge der Mitarbeitenden: Liste und Entscheid.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export interface Correction {
  id: string
  staff_name: string
  session_date: string
  requested_clock_in: string | null
  requested_clock_out: string | null
  requested_break_minutes: number | null
  current_clock_in: string | null
  current_clock_out: string | null
  current_break_minutes: number | null
  // Wieviel der Ist-Pause aus der Regel `automatische_pause` stammt. Der Admin
  // entscheidet sonst blind darüber, ob er seiner eigenen Regel oder dem
  // Mitarbeitenden glaubt.
  current_auto_break_minutes?: number | null
  reason: string | null
  status: string
}

export async function getAdminCorrections(status?: string): Promise<Correction[]> {
  const q = status ? `?status=${status}` : ''
  return apiFetch<Correction[]>(`/pwa/admin/corrections${q}`)
}

export async function approveCorrection(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/corrections/${id}/approve`, { method: 'POST' })
}

export async function rejectCorrection(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/corrections/${id}/reject`, { method: 'POST' })
}

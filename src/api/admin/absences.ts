// Absenzen (Ferien/Krankheit): Liste, Entscheid, Ferienanspruch.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export interface Absence {
  id: string
  staff_name: string
  absence_type: string
  start_date: string
  end_date: string
  status: string
  note: string | null
}

export async function getAdminAbsences(status?: string): Promise<Absence[]> {
  const q = status ? `?status=${status}` : ''
  return apiFetch<Absence[]>(`/pwa/admin/absences${q}`)
}

export async function approveAbsence(id: string, note?: string): Promise<void> {
  await apiFetch(`/pwa/admin/absences/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

export async function rejectAbsence(id: string, note?: string): Promise<void> {
  await apiFetch(`/pwa/admin/absences/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

export interface AbsenceAnalytics {
  year: number
  totals: { vacation: number; sick: number; military: number; other: number }
  by_month: { month: string; vacation: number; sick: number; military: number; other: number }[]
  by_staff: { name: string; vacation: number; sick: number; military: number; other: number; total: number }[]
}

export async function getAbsenceAnalytics(year?: number): Promise<AbsenceAnalytics> {
  const q = year ? `?year=${year}` : ''
  return apiFetch<AbsenceAnalytics>(`/pwa/admin/absences/analytics${q}`)
}

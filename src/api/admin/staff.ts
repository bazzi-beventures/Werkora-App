// Mitarbeitende: Stammdaten, Rollen, Massen-Einstempeln und Passwort-Setzen.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'
import { clearApiCache } from '../swCache'

export interface StaffMember {
  id: string
  name: string
  kuerzel: string | null
  funktion: string | null
  hourly_rate: number | null
  monthly_salary: number | null
  rapportpflicht: boolean
  projektleiter: boolean
  authorized_user_id: string | null
  email: string | null
  role: string | null
  username: string | null
  is_active: boolean
  vacation_days_per_year: number | null
  date_of_birth: string | null
  pensum: number | null
}

export interface StaffRole {
  name: string
  // Freier Zusatz zur Funktion ("Vorarbeiter") — steht in der Funktionsauswahl
  // der Offerte hinter dem Namen.
  job_title?: string | null
  hourly_rate: number
  // Eigener Satz für Werkstattstunden. null = kein eigener Tarif, es gilt hourly_rate.
  hourly_rate_werkstatt?: number | null
  sort_order?: number | null
}

export async function getAdminStaff(): Promise<StaffMember[]> {
  return apiFetch<StaffMember[]>('/pwa/admin/staff')
}

export async function getStaffRoles(): Promise<StaffRole[]> {
  return apiFetch<StaffRole[]>('/pwa/admin/staff-roles')
}

// hourly_rate_werkstatt: null löscht einen bestehenden Werkstatt-Tarif (dann gilt
// wieder der Baustellensatz) — das Feld wird beim Upsert immer geschrieben.
export async function upsertStaffRole(
  name: string, hourly_rate: number, hourly_rate_werkstatt: number | null = null,
): Promise<{ status: string; message: string }> {
  return apiFetch<{ status: string; message: string }>('/pwa/admin/staff-roles', {
    method: 'PUT',
    body: JSON.stringify({ name, hourly_rate, hourly_rate_werkstatt }),
  })
}

export async function deleteStaffRole(name: string): Promise<{ status: string; message: string }> {
  return apiFetch<{ status: string; message: string }>(`/pwa/admin/staff-roles/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}

// Neue Reihenfolge (Rang) der Funktionen speichern — names in Wunschreihenfolge.
export async function reorderStaffRoles(names: string[]): Promise<{ status: string; message: string }> {
  return apiFetch<{ status: string; message: string }>('/pwa/admin/staff-roles/order', {
    method: 'PUT',
    body: JSON.stringify({ names }),
  })
}

export async function upsertStaff(data: Partial<StaffMember> & { id?: string }): Promise<StaffMember> {
  const method = data.id ? 'PATCH' : 'POST'
  const url = data.id ? `/pwa/admin/staff/${data.id}` : '/pwa/admin/staff'
  return apiFetch<StaffMember>(url, { method, body: JSON.stringify(data) })
}

export async function deleteStaff(staffId: string): Promise<void> {
  await apiFetch(`/pwa/admin/staff/${staffId}`, { method: 'DELETE' })
}

// ─── Massen-Einstempeln ────────────────────────────────────

export type BulkClockInStatus = 'clocked_in' | 'already' | 'error'

export interface BulkClockInResult {
  results: { staff_id: string; staff_name: string; status: BulkClockInStatus }[]
  clocked_in: number
  already: number
  errors: number
  push_sent: number
}

export async function getClockStatus(date?: string): Promise<{ clocked_in_staff_ids: string[] }> {
  const q = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiFetch<{ clocked_in_staff_ids: string[] }>(`/pwa/admin/staff/clock-status${q}`)
}

export async function bulkClockIn(
  staffIds: string[],
  time: string,
  opts: { date?: string; art_der_arbeit?: string } = {},
): Promise<BulkClockInResult> {
  return apiFetch<BulkClockInResult>('/pwa/admin/staff/bulk-clock-in', {
    method: 'POST',
    body: JSON.stringify({ staff_ids: staffIds, time, ...opts }),
  })
}

// ─── Password Auth ─────────────────────────────────────────

export async function loginWithPassword(username: string, password: string): Promise<{ tenant_slug: string }> {
  // Neue Session beginnt: evtl. gecachte /pwa/-Antworten eines früheren
  // Nutzers auf diesem Gerät loswerden (geteiltes Gerät ohne sauberen Logout).
  await clearApiCache()
  return await apiFetch('/pwa/auth/login-password', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }) as { tenant_slug: string }
}

export async function requestPasswordReset(email: string): Promise<void> {
  await apiFetch('/pwa/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function setAdminPassword(currentPassword: string | null, newPassword: string): Promise<void> {
  await apiFetch('/pwa/admin/set-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

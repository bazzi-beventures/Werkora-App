// Benutzerkonten (Login-Identitäten, nicht Personaldaten — die stehen in staff.ts).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export interface AuthUser {
  id: string
  email: string | null
  display_name: string | null
  role: string
  is_active: boolean
  created_at: string
  consent_version: string | null
  username: string | null
}

export interface AuthUserInput {
  email: string | null
  display_name: string | null
  role: string
  // Nur beim Ändern: deaktivierte Konten können sich nicht mehr anmelden.
  is_active?: boolean
}

export async function listUsers(): Promise<AuthUser[]> {
  return apiFetch<AuthUser[]>('/pwa/admin/users')
}

/** Ohne `id` anlegen, mit `id` ändern. */
export async function saveUser(input: AuthUserInput, id?: string): Promise<void> {
  await apiFetch(id ? `/pwa/admin/users/${id}` : '/pwa/admin/users', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(input),
  })
}

/** Setzt das Passwort von aussen (Admin-Reset). Policy-Verstösse kommen als Klartext-Fehler zurück. */
export async function setUserPassword(id: string, newPassword: string): Promise<void> {
  await apiFetch(`/pwa/admin/users/${id}/set-password`, {
    method: 'POST',
    body: JSON.stringify({ new_password: newPassword }),
  })
}

/** DSGVO-Anonymisierung: irreversibel, nur für Management. */
export async function anonymizeUser(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/users/${id}/anonymize`, { method: 'POST' })
}

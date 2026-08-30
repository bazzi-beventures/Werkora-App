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
  // Hat diese Person die **aktuelle** Fassung bestätigt? Rechnet das Backend aus
  // (agents/routers/admin_users.py gegen CURRENT_CONSENT_VERSION) — die
  // Versionsnummer steht deshalb nirgends im Frontend.
  consent_current: boolean
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

// ─── Anlegen in einem Zug ──────────────────────────────────
// Konto, Personaldaten und Zugang gehen als EIN Request raus. Zwei getrennte
// Aufrufe wären hier schlechter als sie aussehen: Bricht der zweite ab, steht
// ein Konto ohne Funktion in der Liste — der Mitarbeiter kann stempeln, taucht
// aber in keiner Verrechnung auf, und niemand sieht, dass etwas fehlt.
// Backend: services/user_onboarding.py.

/** Personaldaten (staff), die beim Anlegen mitkommen. Alle optional. */
export interface StaffProfileInput {
  kuerzel?: string | null
  funktion?: string | null
  hourly_rate?: number | null
  monthly_salary?: number | null
  rapportpflicht?: boolean | null
  projektleiter?: boolean | null
  vacation_days_per_year?: number | null
  date_of_birth?: string | null
  pensum?: number | null
}

export interface CreateUserInput {
  display_name: string | null
  email: string | null
  role: string
  staff?: StaffProfileInput | null
  initial_password?: string | null
  generate_pin?: boolean
}

/** Was am Konto NICHT geklappt hat — das Konto selbst steht dann trotzdem. */
export interface OnboardingWarning {
  code: 'staff_profile_failed' | 'password_failed' | 'pin_failed' | string
  message: string
}

export interface CreateUserResult {
  status: string
  message: string
  authorized_user_id: string | null
  username: string | null
  staff_id: string | null
  pin: string | null
  pin_expires_at: string | null
  warnings: OnboardingWarning[]
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  return apiFetch<CreateUserResult>('/pwa/admin/users', {
    method: 'POST',
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

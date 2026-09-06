import { apiFetch } from './client'
import { clearOfflinePackages } from './offlineStore'
import { clearApiCache } from './swCache'

export interface UserInfo {
  authorized_user_id: string
  username: string | null
  display_name: string
  email: string | null
  staff_id: string | null
  staff_name: string
  tenant_id: string
  role: string
  consent_version: string | null
  consent_required: boolean
  enabled_modules: string[]
  feature_flags?: Record<string, Record<string, unknown>>
  /** Sieht dieses Konto Features der Stufe «Beta»? (docs/specs/beta-tester.md) */
  beta_tester?: boolean
  /** Was es WEGEN des Häkchens sieht — für den Beta-Abschnitt in den Einstellungen.
   *  Leer für alle anderen, und leer, solange nichts in der Beta ist. */
  beta_features?: BetaFeature[]
  /** Modulnamen, die dieses Konto wegen des Häkchens sieht (Beta-Module).
   *  Nur Namen — Label und Beschreibung leben im Modul-Tab des Admin. */
  beta_modules?: string[]
}

/** Ein laufendes Beta-Feature, wie `/pwa/me` es ausliefert (Text aus der Registry). */
export interface BetaFeature {
  key: string
  label: string
  description: string
}

export async function lookupUser(tenantSlug: string, displayName: string): Promise<{ authorized_user_id: string; display_name: string }> {
  return apiFetch<{ authorized_user_id: string; display_name: string }>('/pwa/auth/lookup-user', {
    method: 'POST',
    body: JSON.stringify({ tenant_slug: tenantSlug, display_name: displayName }),
  })
}

export async function validatePin(tenantSlug: string, authorizedUserId: string, pin: string): Promise<{ status: string; display_name: string }> {
  return apiFetch<{ status: string; display_name: string }>('/pwa/auth/validate-pin', {
    method: 'POST',
    body: JSON.stringify({ tenant_slug: tenantSlug, authorized_user_id: authorizedUserId, pin }),
  })
}

export async function getMe(): Promise<UserInfo> {
  return apiFetch<UserInfo>('/pwa/me')
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/pwa/auth/logout', { method: 'POST' })
  } finally {
    // Auch wenn der Server-Logout fehlschlägt (offline): gecachte Antworten
    // des abgemeldeten Nutzers dürfen nicht auf dem Gerät zurückbleiben.
    // Dasselbe gilt für das Offline-Lesepaket — es hängt am Gerät, nicht an der
    // Session, und der Werkhof teilt sich ein Tablet.
    clearOfflinePackages()
    await clearApiCache()
  }
}

export async function acceptConsent(): Promise<void> {
  await apiFetch('/pwa/auth/accept-consent', { method: 'POST' })
}

export interface TenantInfo {
  name: string
  brand_color: string
  brand_color_dark: string
  logo_url: string
  logo_url_dark: string
  canton: string
}

export async function getTenantInfo(tenantSlug: string): Promise<TenantInfo> {
  return apiFetch<TenantInfo>(`/pwa/tenant-info?tenant_slug=${encodeURIComponent(tenantSlug)}`)
}

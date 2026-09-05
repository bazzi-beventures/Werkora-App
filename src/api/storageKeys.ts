// Env-spezifische localStorage-Keys, damit Prod und Staging
// (beide auf bazzi-beventures.github.io) keine Tokens/Daten teilen.
// VITE_ENV_SUFFIX wird beim Staging-Build als "_staging" gesetzt.
const s = import.meta.env.VITE_ENV_SUFFIX ?? ''

export const SK = {
  TOKEN: `pwa_token${s}`,
  TENANT_SLUG: `tenantSlug${s}`,
  AUTHORIZED_USER_ID: `authorizedUserId${s}`,
  DISPLAY_NAME: `displayName${s}`,
  // Zwischenspeicher der Einsatzplanung-Anzeige (Ansichten/Farben/Felder) —
  // reiner Cache, siehe api/admin/tenant.ts. Darf jederzeit fehlen.
  SCHEDULING_CONFIG: `schedulingConfig${s}`,
}

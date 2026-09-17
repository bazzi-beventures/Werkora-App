// Env-spezifische localStorage-Keys, damit Prod und Staging
// (beide auf bazzi-beventures.github.io) keine Tokens/Daten teilen.
// VITE_ENV_SUFFIX wird beim Staging-Build als "_staging" gesetzt.
const s = import.meta.env.VITE_ENV_SUFFIX ?? ''

// Derselbe Suffix für Keys, die erst zur Laufzeit entstehen und deshalb nicht
// als Konstante in SK stehen können (z. B. ein Key je Konto). Wer ihn benutzt,
// hängt ihn ans ENDE des Keys — wie die Einträge unten.
export const SK_SUFFIX = s

export const SK = {
  TOKEN: `pwa_token${s}`,
  TENANT_SLUG: `tenantSlug${s}`,
  AUTHORIZED_USER_ID: `authorizedUserId${s}`,
  DISPLAY_NAME: `displayName${s}`,
  // Zwischenspeicher der Einsatzplanung-Anzeige (Ansichten/Farben/Felder) —
  // reiner Cache, siehe api/admin/tenant.ts. Darf jederzeit fehlen.
  SCHEDULING_CONFIG: `schedulingConfig${s}`,
  // Zuletzt gewählter Mandant der Betreiber-Seite (docs/specs/admin-werkora-ch.md §4.2).
  // Nur dort gesetzt: admin.werkora.ch ist eine eigene Origin und teilt seinen
  // localStorage nicht mit der Mandanten-App. Reine Bequemlichkeit — fehlt er,
  // steht der Wähler auf «kein Mandant» und der Mandanten-Bereich ist leer.
  // Der Server kennt ihn nie; massgeblich ist immer der Mandant im PFAD.
  ADMIN_TENANT_ID: `adminTenantId${s}`,
}

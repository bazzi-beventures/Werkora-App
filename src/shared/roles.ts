// Rollen-Prädikate der Oberfläche — Spiegel von agents/routers/_deps.py
// (ADMIN_ROLES, KPI_ROLES, require_management). Verbindlich ist das Backend; hier
// geht es nur darum, keine Einträge zu zeigen, die in einem 403 enden.
//
// `management_light` («Manager light») ist ein Admin, der von den Kennzahlen nur
// «Projekt-Pipeline», «Projekte & Reports» und die Nachkalkulation sieht.

type Role = string | null | undefined

/** Zugang zur Admin-App. */
export function isAdminRole(role: Role): boolean {
  return role === 'admin' || role === 'management_light' || role === 'management' || role === 'superadmin'
}

/** Geschäftsleitung (und Superadmin): Löhne, Stammdaten, volle Kennzahlen. */
export function isManagementRole(role: Role): boolean {
  return role === 'management' || role === 'superadmin'
}

/** Darf das Modul Kennzahlen öffnen (Manager light nur Pipeline/Projekte/Nachkalkulation). */
export function hasKpiAccess(role: Role): boolean {
  return role === 'management_light' || isManagementRole(role)
}

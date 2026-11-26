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

/** Geschäftsleitung (und Superadmin): Stammdaten, volle Kennzahlen. */
export function isManagementRole(role: Role): boolean {
  return role === 'management' || role === 'superadmin'
}

/** Darf Stunden- und Monatslohn sehen und setzen: jede Admin-Rolle (seit WW-85).
 *  Spiegel von LOHN_ROLLEN in agents/routers/_guard_sitzung.py. */
export function mayManageWages(role: Role): boolean {
  return isAdminRole(role)
}

/** Darf das Modul Kennzahlen öffnen (Manager light nur Pipeline/Projekte/Nachkalkulation). */
export function hasKpiAccess(role: Role): boolean {
  return role === 'management_light' || isManagementRole(role)
}

/** Personalordner (WW-106): Manager und Manager light, nicht das Büro (`admin`).
 *  Spiegel von PERSONALORDNER_ROLES in agents/routers/_guard_sitzung.py. */
export function mayOpenPersonalordner(role: Role): boolean {
  return role === 'management_light' || isManagementRole(role)
}

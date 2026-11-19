// Gruppierung und Beschriftung der Mitarbeiter-Pillen im Filter der
// Einsatzplanung (StaffFilterPills.tsx).
import { staffShortLabel, type StaffLite } from './scheduleShared'

// Rollen, die im Filter der Einsatzplanung unter «Admin» stehen. Dazu kommt
// jeder mit Projektleiter-Flag, auch mit Monteur-Login. Ohne Login (role null)
// und mit `user`/`user_light` bleibt man Monteur.
const ADMIN_FILTER_ROLES = new Set(['admin', 'management_light', 'management', 'superadmin'])

export type StaffGroup = 'monteur' | 'admin'

export function staffGroup(s: StaffLite): StaffGroup {
  if (s.projektleiter) return 'admin'
  return s.role && ADMIN_FILTER_ROLES.has(s.role) ? 'admin' : 'monteur'
}

// «Luca Bazzi» → «Luca B.»: Vorname plus Initial des letzten Namensteils.
// Einteilige Namen bleiben, wie sie sind.
export function staffFirstNameLabel(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return parts[0] ?? ''
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}

export function staffPillLabel(s: StaffLite, withNames: boolean): string {
  return withNames ? staffFirstNameLabel(s.name) || staffShortLabel(s) : staffShortLabel(s)
}

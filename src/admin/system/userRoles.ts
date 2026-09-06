// Rollen-Matrix der Benutzerverwaltung — Spiegel von agents/routers/admin_users.py
// (ASSIGNABLE_ROLES / EDITABLE_TARGET_ROLES). Verbindlich ist das Backend; hier geht
// es nur darum, dem Benutzer keine Knöpfe zu zeigen, die in einem 403 enden.
//
// Warum ein Admin überhaupt hierher darf: er legt im Büroalltag Mitarbeiter an und
// setzt Passwörter/PINs zurück. Er darf dabei aber niemanden auf seine eigene Ebene
// heben und kein Admin-/Management-Konto anfassen — sonst wäre 'admin' faktisch
// 'management'.

export type UserRole = 'user_light' | 'user' | 'admin' | 'management' | 'superadmin'

export const ALL_ROLES: UserRole[] = ['user_light', 'user', 'admin', 'management', 'superadmin']

const ASSIGNABLE: Record<string, UserRole[]> = {
  superadmin: ALL_ROLES,
  management: ['user_light', 'user', 'admin'],
  admin: ['user_light', 'user'],
}

const EDITABLE_TARGETS: Record<string, UserRole[]> = {
  superadmin: ALL_ROLES,
  // Management verwaltet sich untereinander, darf die Rolle 'management' aber nicht neu vergeben.
  management: ['user_light', 'user', 'admin', 'management'],
  admin: ['user_light', 'user'],
}

/** Rollen, die ein Benutzer dieser Rolle vergeben darf (leer = gar keine). */
export function assignableRoles(actingRole: string | null | undefined): UserRole[] {
  return ASSIGNABLE[actingRole ?? ''] ?? []
}

/** Darf ein bestehendes Konto mit dieser Rolle bearbeitet werden? */
export function mayEditTarget(actingRole: string | null | undefined, targetRole: string | null | undefined): boolean {
  if (!targetRole) return false
  return (EDITABLE_TARGETS[actingRole ?? ''] ?? []).includes(targetRole as UserRole)
}

/** Anonymisieren (DSGVO, irreversibel) bleibt Management/Superadmin vorbehalten. */
export function mayAnonymize(actingRole: string | null | undefined): boolean {
  return actingRole === 'management' || actingRole === 'superadmin'
}

/**
 * Darf diese Rolle das Beta-Häkchen setzen? (docs/specs/beta-tester.md §3.6)
 *
 * **Nur der Superadmin**, und gepflegt wird es im Tab Testing unter
 * Admin-Tools → Konfiguration — nicht mehr in der Benutzerverwaltung
 * (Betreiberentscheid 2026-09-06). Beta gehört ganz zum Betreiber: Er
 * entscheidet, WAS in die Beta geht, und auch WER testet.
 *
 * Spiegel von `_assert_may_set_beta` in agents/routers/admin_users.py —
 * verbindlich ist das Backend. Die Benutzerverwaltung ZEIGT den Status
 * weiterhin (Spalte «Beta»); wer ihn ändern will, geht in den Testing-Tab.
 */
export function maySetBetaTester(actingRole: string | null | undefined): boolean {
  return actingRole === 'superadmin'
}

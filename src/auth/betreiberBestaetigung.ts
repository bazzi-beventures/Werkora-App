import type { UserInfo } from '../api/auth'

/**
 * Passwort stimmt, zweiter Faktor fehlt — nur bei Betreiber-Konten möglich
 * (docs/specs/betreiber-mfa.md §6.10). Eigene Datei, damit der Schirm
 * daneben nur eine Komponente exportiert (Fast Refresh).
 */
export function brauchtBetreiberBestaetigung(u: UserInfo | null): boolean {
  return !!u && u.role === 'superadmin' && u.mfa?.pflicht === true && !u.mfa.bestaetigt
}

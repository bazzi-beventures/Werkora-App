// Wie die Consent-Spalte der Benutzerverwaltung zu lesen ist.
//
// Bis zum 30.08.2026 stand dort «Ja», sobald irgendeine Fassung bestätigt war.
// Das beantwortete eine andere Frage als die, die man stellt: Nach dem Sprung
// von v5 auf v6 zeigte die Liste für alle Benutzer weiter «Ja», obwohl niemand
// die neue Datenschutzinformation gesehen hatte — wer wissen wollte, wen er noch
// erinnern muss, bekam die falsche Antwort.
//
// Welche Fassung aktuell ist, entscheidet das Backend (`CURRENT_CONSENT_VERSION`
// in db/auth.py) und liefert das Ergebnis als `consent_current` mit. Die Nummer
// steht bewusst **nicht** hier: Zwei Orte für dieselbe Version driften beim
// nächsten Bump auseinander.

import { AuthUser } from '../../api/admin/users'

export type ConsentState = 'aktuell' | 'veraltet' | 'ausstehend'

export interface ConsentBadge {
  state: ConsentState
  label: string
  className: string
  title: string
}

export function consentBadge(user: Pick<AuthUser, 'consent_version' | 'consent_current'>): ConsentBadge {
  if (!user.consent_version) {
    return {
      state: 'ausstehend',
      label: 'Ausstehend',
      className: 'admin-badge-draft',
      title: 'Diese Person hat die Datenschutzinformation noch nie bestätigt.',
    }
  }
  // `consent_current` fehlt nur, wenn eine ältere Backend-Fassung antwortet (kurzes
  // Deploy-Fenster). Dann lieber «veraltet» zeigen als «aktuell»: Ein falsches
  // Entwarnungssignal ist genau der Fehler, den diese Spalte hatte.
  if (user.consent_current === true) {
    return {
      state: 'aktuell',
      label: 'Aktuell',
      className: 'admin-badge-approved',
      title: `Aktuelle Fassung bestätigt (${user.consent_version}).`,
    }
  }
  return {
    state: 'veraltet',
    label: `Veraltet · ${user.consent_version}`,
    className: 'admin-badge-pending',
    title: `Bestätigt wurde Fassung ${user.consent_version}. Seither gibt es eine neue — sie wird beim nächsten Öffnen der App vorgelegt.`,
  }
}

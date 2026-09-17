/**
 * Das Adressformat der Betreiber-Seite — eine Stelle, zwei Leser.
 *
 * Spec: docs/specs/admin-werkora-ch.md §4.2.
 *
 * Zwei Formen, und die erste Silbe entscheidet:
 *
 *     #/fehler                        Plattform — ohne Mandanten
 *     #/support/tk-42                 Plattform mit Detail (Link aus der Mail)
 *     #/t/gehlhaar/konfiguration      Mandant  — der Slug steht IM Pfad
 *     #/t/gehlhaar/nutzung
 *
 * Warum der Mandant in die Adresse gehört und nicht nur in den localStorage:
 * damit ein Link auf einen Mandanten zeigt. «Schau dir mal die Module von
 * Gehlhaar an» ist sonst eine Anleitung statt einer URL — und beim Nachbauen
 * von Hand landet man im falschen Mandanten.
 *
 * Reine Funktionen, kein React: `useTenantScope` liest den Slug daraus,
 * `useAdminSiteNav` den Screen. Zwei Parser für dasselbe Format wären zwei
 * Gelegenheiten, es unterschiedlich zu verstehen.
 */

export interface AdminRoute {
  /** Screen-Schlüssel, z. B. 'uebersicht' oder 'konfiguration'. */
  screen: string
  /** Mandanten-Slug, wenn die Adresse einen trägt — sonst null. */
  tenantSlug: string | null
  /** Zweites Pfadstück, z. B. eine Ticket-id. */
  detail: string | null
}

/** Startseite ohne Adresse: die Mandantenliste. Sie braucht keinen Mandanten
 *  und ist der Ort, an dem man einen auswählt. */
export const DEFAULT_SCREEN = 'uebersicht'

const sauber = (s: string): string => s.trim().replace(/^\/+|\/+$/g, '')

export function parseHash(hash: string): AdminRoute {
  const teile = sauber((hash || '').replace(/^#/, '')).split('/').filter(Boolean)

  if (teile[0] === 't') {
    // #/t/<slug>/<screen>[/<detail>] — ein Slug ohne Screen ist kein Fehler,
    // sondern «Mandant gewählt, nimm den Standard».
    const [, slug, screen, detail] = teile
    return {
      tenantSlug: slug ? decodeURIComponent(slug) : null,
      screen: screen || 'konfiguration',
      detail: detail ? decodeURIComponent(detail) : null,
    }
  }

  return {
    tenantSlug: null,
    screen: teile[0] || DEFAULT_SCREEN,
    detail: teile[1] ? decodeURIComponent(teile[1]) : null,
  }
}

export function buildHash(route: Partial<AdminRoute>): string {
  const screen = route.screen || DEFAULT_SCREEN
  const stuecke = route.tenantSlug
    ? ['t', encodeURIComponent(route.tenantSlug), screen]
    : [screen]
  if (route.detail) stuecke.push(encodeURIComponent(route.detail))
  return `#/${stuecke.join('/')}`
}

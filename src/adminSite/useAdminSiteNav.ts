/**
 * Navigation der Betreiber-Seite — der Screen-Teil des Hash.
 *
 * Bewusst ein Hash-Router von Hand statt einer Bibliothek: die Seite hat
 * zwölf Screens, zwei Ebenen und keine verschachtelten Layouts. Was
 * `react-router` hier hinzufügen würde, wäre eine Abhängigkeit im Bundle und
 * ein zweites Adressformat neben `route.ts`.
 *
 * Der Mandant im Hash gehört `useTenantScope`; dieser Hook fasst ihn nur an,
 * wenn er einen Screen setzt — dann schreibt er den vorhandenen Slug zurück,
 * damit ein Screenwechsel den gewählten Mandanten nicht aus der Adresse kippt.
 */
import { useCallback, useEffect, useState } from 'react'
import { buildHash, parseHash, type AdminRoute } from './route'

/** Alle Screens der Seite. Die Bereichszuordnung steht in der Shell —
 *  hier interessiert nur, was eine gültige Adresse ist. */
export const PLATTFORM_SCREENS = [
  'uebersicht',
  'service-status',
  'fehler',
  'support',
  'push-test',
  'newsletter',
] as const

export const MANDANT_SCREENS = [
  'konfiguration',
  'llm-kosten',
  'nutzung',
  'material',
  'bonus',
] as const

export type PlattformScreen = (typeof PLATTFORM_SCREENS)[number]
export type MandantScreen = (typeof MANDANT_SCREENS)[number]
export type AdminSiteScreen = PlattformScreen | MandantScreen

const ALLE: readonly string[] = [...PLATTFORM_SCREENS, ...MANDANT_SCREENS]

export const istMandantScreen = (s: string): s is MandantScreen =>
  (MANDANT_SCREENS as readonly string[]).includes(s)

export interface AdminSiteNav {
  route: AdminRoute
  screen: AdminSiteScreen
  detail: string | null
  navigate: (screen: AdminSiteScreen, detail?: string | null) => void
}

export function useAdminSiteNav(): AdminSiteNav {
  const [route, setRoute] = useState<AdminRoute>(() => parseHash(window.location.hash))

  useEffect(() => {
    const beiWechsel = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', beiWechsel)
    // Einmal nachziehen: zwischen dem `useState`-Initialisierer und diesem
    // Effekt kann der Hash bereits gesetzt worden sein (Deep-Link aus der Mail).
    beiWechsel()
    return () => window.removeEventListener('hashchange', beiWechsel)
  }, [])

  const navigate = useCallback((screen: AdminSiteScreen, detail: string | null = null) => {
    const jetzt = parseHash(window.location.hash)
    // Ein Plattform-Screen lässt den Mandanten in der Adresse stehen: der
    // Wähler im Kopf bleibt sichtbar, und der Rückweg in den Mandanten-Bereich
    // führt nicht über eine neue Auswahl.
    window.location.hash = buildHash({ ...jetzt, screen, detail })
  }, [])

  // Eine unbekannte Adresse (alter Link, Tippfehler) fällt auf die Übersicht
  // zurück, statt einen leeren Rahmen zu zeigen.
  const screen = (ALLE.includes(route.screen) ? route.screen : 'uebersicht') as AdminSiteScreen

  return { route, screen, detail: route.detail, navigate }
}

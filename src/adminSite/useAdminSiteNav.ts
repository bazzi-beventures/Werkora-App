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
  'konten',
  'llm-kosten',
  'nutzung',
  'material',
  'bonus',
] as const

/**
 * Der dritte Bereich (§8.3) — und er gehorcht weder dem Wähler noch der
 * Plattform.
 *
 * Diese drei Screens arbeiten auf dem **eigenen** Mandanten des angemeldeten
 * Kontos, dem Betreiber-Mandanten `werkora` (E9): dort liegen die Rechnungen
 * an die Mandanten, deren Zahlungseingänge und die Kunden. Sie laufen deshalb
 * über die **normalen** Mandanten-Routen mit der eigenen Sitzung, nicht über
 * `/pwa/superadmin/tenants/{id}/…` — es gibt hier nichts zu skopieren.
 *
 * Wer oben einen anderen Mandanten wählt, ändert daran nichts. Das ist kein
 * Versehen: «Rechnungen» heisst hier *unsere* Rechnungen, nicht «die
 * Rechnungen von Gehlhaar». Die sieht man im Admin von Gehlhaar.
 */
export const RECHNUNG_SCREENS = [
  'rechnungen',
  'zahlungsabgleich',
  'kunden',
] as const

export type PlattformScreen = (typeof PLATTFORM_SCREENS)[number]
export type MandantScreen = (typeof MANDANT_SCREENS)[number]
export type RechnungScreen = (typeof RECHNUNG_SCREENS)[number]
export type AdminSiteScreen = PlattformScreen | MandantScreen | RechnungScreen

const ALLE: readonly string[] = [
  ...PLATTFORM_SCREENS, ...MANDANT_SCREENS, ...RECHNUNG_SCREENS,
]

export const istMandantScreen = (s: string): s is MandantScreen =>
  (MANDANT_SCREENS as readonly string[]).includes(s)

export const istRechnungScreen = (s: string): s is RechnungScreen =>
  (RECHNUNG_SCREENS as readonly string[]).includes(s)

/**
 * Wer sieht den Bereich «Rechnungen» (§8.3)?
 *
 * **Nur ein Konto im Betreiber-Mandanten.** Der Bereich zeigt die Rechnungen des
 * SITZUNGS-Mandanten, nicht die des Wählers — also «unsere Rechnungen an die
 * Mandanten». Bei einem Konto in einem Kundenbetrieb wären es dessen Rechnungen
 * an dessen Kundschaft, unter der Überschrift der Betreiber-Seite.
 *
 * **Vorher entschied das die Modulliste** (`invoicing` + `payment_matching`) —
 * und die hat ein Kunde mit Fakturierung genauso. Die Sperre war damit keine:
 * Ein Superadmin, der (Übergangszeit, §8.6) noch in einem Kundenmandanten
 * sitzt, bekam dort die 47 Rechnungen dieses Kunden zu sehen (Befund
 * 18.09.2026). Jetzt antwortet der Server auf die Frage, die gemeint war, und
 * zwar am Slug: `/pwa/me` liefert `betreiber_mandant`.
 */
export const hatRechnungsbereich = (user: { betreiber_mandant?: boolean }): boolean =>
  user.betreiber_mandant === true

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

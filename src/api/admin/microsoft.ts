// «Mit Microsoft verbinden» — docs/specs/microsoft-365-verbindung.md §6, §9.2.
//
// Der Betrieb verbindet zwei Postfächer: «Versand & Kalender» (info@) und, mit dem
// Modul Mail-Eingang, ein eigenes Eingangspostfach. Werkora bekommt nie ein Passwort
// zu sehen: «Mit Microsoft verbinden» liefert eine Adresse bei Microsoft, dort meldet
// sich das Postfach an, und Microsoft schickt den Browser auf eine Ergebnisseite.
// Kein Token kommt je über diese Routen.

import { apiFetch } from '../client'
import type { Antwort } from '../generated'

export type MsZustand = Antwort<'MsZustand'>
export type MsVerbindung = Antwort<'MsVerbindung'>
export type MsLink = Antwort<'MsLink'>
export type MsZweck = MsVerbindung['zweck']

export function getMicrosoft(): Promise<MsZustand> {
  return apiFetch<MsZustand>('/pwa/admin/microsoft')
}

/** Adresse der Anmeldung bei Microsoft (15 Minuten gültig, einmal einlösbar). */
export function startMicrosoft(zweck: MsZweck, adresse: string): Promise<MsLink> {
  return apiFetch<MsLink>('/pwa/admin/microsoft/oauth/start', {
    method: 'POST',
    body: JSON.stringify({ zweck, adresse }),
  })
}

/** «Als Administrator freigeben» (§6.3) — der Admin des Microsoft-Kontos meldet sich an. */
export function startAdminFreigabe(zweck: MsZweck): Promise<MsLink> {
  return apiFetch<MsLink>('/pwa/admin/microsoft/adminconsent/start', {
    method: 'POST',
    body: JSON.stringify({ zweck }),
  })
}

export function sendeTestmail(): Promise<{ status: string; message?: string | null }> {
  return apiFetch('/pwa/admin/microsoft/versand/testmail', { method: 'POST' })
}

// Eastereggs: Meilenstein-Abfrage (Feature `eastereggs`).
// Teil des api/admin/-Barrels — eine Datei je Domäne, gebündelt in index.ts.
//
// Der Endpunkt ist doppelt gegated (Mandanten-Flag + Beta-Häkchen, dazu Rolle
// Geschäftsleitung). Der Aufrufer prüft das Flag vorher über `isFeatureEnabled`;
// diese Funktion schluckt trotzdem jeden Fehler und liefert dann `null`. Ein
// Easteregg, das eine Fehlermeldung über die Admin-App legt, wäre das Gegenteil
// von dem, wofür es da ist.

import { apiFetch } from '../client'

export interface EasterEggMilestone {
  /** Der überschrittene runde Wert, oder null solange keiner erreicht ist. */
  milestone: number | null
  /** Die eingestellte Schwelle des Mandanten (100 Projekte / CHF 100'000). */
  step: number
}

export interface EasterEggProjects extends EasterEggMilestone {
  /** Abgeschlossene Kundenprojekte insgesamt. */
  count: number
}

export interface EasterEggRevenue extends EasterEggMilestone {
  /** Fakturiert im laufenden Kalenderjahr, stornierte Rechnungen ausgenommen. */
  total: number
  year: number
}

export interface EasterEggStatus {
  projects: EasterEggProjects
  revenue: EasterEggRevenue
}

export async function getEasterEggs(): Promise<EasterEggStatus | null> {
  try {
    return await apiFetch<EasterEggStatus>('/pwa/admin/eastereggs')
  } catch {
    return null
  }
}

/**
 * Ereignis, das die Easteregg-Komponente zum erneuten Nachfragen bringt.
 *
 * Ohne das prüfte die Admin-App nur einmal beim Öffnen — wer eine Rechnung
 * erstellt oder ein Projekt abschliesst, sähe seinen Meilenstein erst beim
 * nächsten Neuladen. Genau in dem Moment, in dem etwas zu feiern ist, passiert
 * dann nichts; das ist der Unterschied zwischen einer Belohnung und einer
 * Meldung, die man Tage später findet.
 *
 * Ausgelöst wird es aus dem API-Layer (`generateInvoice`, `setProjectStatus`)
 * statt aus den Masken: so hängt es an der Aktion selbst und nicht daran, dass
 * jede aufrufende Maske daran denkt.
 */
export const EASTEREGG_RECHECK_EVENT = 'werkora:eastereggs-recheck'

/** Meldet, dass sich ein Meilenstein bewegt haben könnte. Nie werfend — ein
 *  fehlendes `window` (SSR, Test-Umgebung ohne DOM) darf keinen Schreibpfad
 *  mitreissen: die Rechnung ist wichtiger als das Konfetti. */
export function requestEasterEggCheck(): void {
  try {
    window.dispatchEvent(new CustomEvent(EASTEREGG_RECHECK_EVENT))
  } catch {
    /* kein DOM — dann gibt es auch keine Animation zu starten. */
  }
}

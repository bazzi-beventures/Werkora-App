// Sprach-Hilfen für Freitextfelder (Offerte/Rapport) — Module `ai` + `quotes`:
// Rechtschreibprüfung und das Ausformulieren einer Offertbeschreibung.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export interface SpellcheckResult {
  corrected: string
  // false = das Modell hat nichts geändert; die Maske zeigt dann "keine Fehler".
  changed: boolean
}

export async function checkSpelling(text: string): Promise<SpellcheckResult> {
  return apiFetch<SpellcheckResult>('/pwa/admin/spellcheck', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}


export interface QuoteDescriptionResult {
  description: string
  // false = es kam nichts Brauchbares zurück (leer, oder identisch zur Eingabe);
  // die Maske zeigt dann eine Meldung statt eines Vorschlags, der nichts ändert.
  changed: boolean
}

/**
 * Stichworte zu einer Offertbeschreibung ausformulieren.
 *
 * Gegenstück zu `checkSpelling` mit umgekehrtem Auftrag: dort darf nichts
 * dazukommen, hier ist der Satzbau der Zweck. Der Inhalt bleibt in beiden Fällen
 * der des Anwenders — Aufbau und Ton kommen aus der Vorgabe des Mandanten
 * (Offert-Vorlagen → «Beschreibung formulieren»).
 */
export async function composeQuoteDescription(text: string): Promise<QuoteDescriptionResult> {
  return apiFetch<QuoteDescriptionResult>('/pwa/admin/quote-description', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

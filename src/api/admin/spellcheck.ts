// Rechtschreibprüfung für Freitextfelder (Offerte/Rapport) — Module `ai` + `quotes`.
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

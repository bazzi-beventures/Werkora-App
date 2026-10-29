// «Ausgeführte Arbeiten» im Rechnung-Erstellen-Dialog (Projektdetail UND
// Rechnungen-Screen), Feature-Anfrage WW-52: per Häkchen wählen, ob der Block auf
// die Rechnung kommt, und den Text selbst schreiben statt den Vorschlag zu nehmen.
//
// Das Backend kennt drei Zustände (GenerateInvoiceRequest.work_description):
// weglassen = aus den Rapporten ableiten, '' = kein Block, Text = genau dieser Text.
// Die Übersetzung Dialog → Payload steht hier als reine Funktion, damit beide
// Dialoge sie teilen und sie ohne Rendering testbar ist.

export interface WorkDescriptionState {
  /** Häkchen «Ausgeführte Arbeiten auf der Rechnung». */
  enabled: boolean
  text: string
  /** Vorschlag noch nicht da — das Feld ist gesperrt. */
  loading: boolean
  /** Vorschlag konnte nicht geladen werden: dann leitet der Server ab. */
  failed: boolean
}

export const INITIAL_WORK_DESCRIPTION: WorkDescriptionState = {
  enabled: true, text: '', loading: true, failed: false,
}

/**
 * Wert für `work_description` im Generate-Request.
 *
 * - Häkchen aus → `''`: der Block entfällt, auch wenn Rapporte Text hätten.
 * - Vorschlag nicht geladen (Fehler) und nichts eingetippt → `undefined`: der
 *   Server leitet ab wie früher. Ein `''` hier unterdrückte den Block still, nur
 *   weil ein Lese-Request scheiterte.
 * - sonst der Text, wie er im Feld steht (leer gemacht = kein Block).
 */
export function workDescriptionPayload(s: WorkDescriptionState): string | undefined {
  if (!s.enabled) return ''
  if (s.failed && !s.text.trim()) return undefined
  return s.text
}

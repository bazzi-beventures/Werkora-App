// «Kein Feedback» — versendete Offerten, zu denen der Kunde sich nicht meldet.
//
// Spiegelt services/quote_no_feedback_service.py (Feature offerte_kein_feedback_meldung).
// Verbindlich ist der Server: er verschickt die interne Meldung. Diese Datei liefert
// nur die Kennzeichnung in der Offerten-Liste — und die wird bewusst aus `sent_at`
// gerechnet statt am Versand der Meldung festgemacht: der Meldungslauf ist täglich,
// die Liste soll die Lage sofort zeigen und nicht bis zu 24 Stunden hinterherhinken.
//
// Wichtig ist, was das NICHT ist: keine Rückmeldung heisst nicht abgelehnt. Die
// Offerte bleibt auf 'gesendet', die Kennzeichnung steht neben dem Status, nicht
// an seiner Stelle.

export const DEFAULT_WAIT_HOURS = 72

// Obergrenze wie im feature_registry (90 Tage).
const MAX_WAIT_HOURS = 2160

/** Konfigurierte Wartezeit aus dem Feature-Flag, auf denselben Bereich geklemmt wie
 *  im Backend. Müll (fehlend, 0, negativ, kein Zahlwert) → Default statt sofortiger
 *  Kennzeichnung jeder frisch versendeten Offerte. */
export function quoteWaitHours(config: { stunden?: unknown } | null | undefined): number {
  const raw = Number(config?.stunden)
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_WAIT_HOURS
  return Math.min(Math.floor(raw), MAX_WAIT_HOURS)
}

export interface QuoteFeedbackFields {
  status: string
  sent_at?: string | null
  created_at?: string | null
}

/** True, wenn die Offerte versendet ist und seit `waitHours` nichts zurückkam.
 *  `created_at` ist die Rückfallebene für Offerten aus der Zeit vor `sent_at`. */
export function isQuoteWithoutFeedback(
  q: QuoteFeedbackFields,
  waitHours: number,
  now: Date = new Date(),
): boolean {
  if (q.status !== 'gesendet') return false
  const raw = q.sent_at || q.created_at
  if (!raw) return false
  const sent = new Date(raw)
  if (Number.isNaN(sent.getTime())) return false
  return now.getTime() - sent.getTime() >= waitHours * 3600_000
}

import { ApiError, isOfflineError } from '../api/client'

/**
 * Text für einen fehlgeschlagenen Chat-Aufruf. Neben «offline» kennt er die
 * Limits je Konto (429, docs/specs/rapport-bot-guardrails.md §4.6): ohne eigenen
 * Text stand dort «Fehler beim Senden», und der Monteur versuchte es sofort
 * wieder — was das Limit nur verlängerte.
 */
export function chatFehlertext(err: unknown, sonst: string): string {
  if (isOfflineError(err)) return 'Keine Internetverbindung'
  if (err instanceof ApiError && err.status === 429) {
    return err.message === 'rate_limited_day'
      ? 'Für heute sind es zu viele Nachrichten an den Rapport-Bot. Bitte den Rapport über das Formular erfassen.'
      : 'Zu viele Nachrichten in kurzer Zeit — bitte einen Moment warten.'
  }
  if (err instanceof ApiError && err.status === 403 && err.message === 'feature_disabled') {
    // Not-Aus des Betriebs (Feature `rapport_bot`, Spec §4.7).
    return 'Der Rapport-Bot ist für euren Betrieb gerade ausgeschaltet. Bitte den Rapport im Projekt über «Rapport erstellen» im Formular erfassen.'
  }
  return sonst
}

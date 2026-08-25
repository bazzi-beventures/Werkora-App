// Regeln für den Zeitkorrektur-Antrag — geteilt von PWA (ArbeitsZeitScreen)
// und Admin (MyTimeScreen). Bewusst reine Funktionen: die Rechnung ist
// lohnrelevant und wird unit-getestet (correction.test.ts).
//
// Warum überhaupt geprüft wird: das Backend klemmt `total_minutes` bei der
// Genehmigung auf `max(0, spanne - pause)` (db/timekeeping.py::
// admin_update_work_session). Eine Pause länger als die Anwesenheit oder ein
// Ausstempel vor dem Einstempel wird also nicht abgelehnt, sondern still zu
// 0 Arbeitsminuten — der Monteur verliert den ganzen Tag, ohne dass es jemand
// merkt. Deshalb hier hart blockieren statt durchreichen.

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export interface CorrectionFormFields {
  clock_in: string
  clock_out: string
  break_minutes: number
  reason: string
}

/** `HH:MM` → Minuten seit Mitternacht; `null`, wenn das Feld leer/unlesbar ist. */
export function toMinutes(hhmm: string): number | null {
  const m = HHMM.exec((hhmm || '').trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Rohwert des Pausen-Feldes → Minuten.
 *
 * `<input type="number">` liefert für Unparsbares einen leeren String; leer
 * bedeutet hier "keine Pause". Nachkommastellen und Negatives fängt die
 * Funktion ab, damit kein `NaN` in den Payload gerät (`JSON.stringify(NaN)`
 * ist `null`, das Backend antwortet dann mit 422 statt einer klaren Meldung).
 */
export function parseBreakMinutes(raw: string): number {
  const n = Number(raw)
  if (!(raw || '').trim() || !Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

/** Anzeigewert für das Pausen-Feld: 0 zeigt leer, sonst führt die 0 zu "0695". */
export function breakInputValue(minutes: number): string {
  return minutes ? String(minutes) : ''
}

/** Pflichtfelder noch offen? Das ist kein Fehler, nur "noch nicht absendbar". */
export function correctionIncomplete(f: CorrectionFormFields): boolean {
  return !f.clock_in || !f.clock_out || !f.reason.trim()
}

/**
 * Inhaltlicher Fehler im Antrag, oder `null`, wenn er einreichbar ist.
 * Solange die Zeiten noch nicht beide gesetzt sind, wird nichts gemeldet —
 * sonst blinkt beim Tippen eine rote Zeile auf.
 */
export function correctionError(f: CorrectionFormFields): string | null {
  const start = toMinutes(f.clock_in)
  const end = toMinutes(f.clock_out)
  if (start === null || end === null) return null

  if (end <= start) {
    return 'Der Ausstempel muss nach dem Einstempel liegen.'
  }
  const span = end - start
  if (f.break_minutes < 0 || !Number.isFinite(f.break_minutes)) {
    return 'Die Pause muss eine Zahl in Minuten sein.'
  }
  if (f.break_minutes >= span) {
    return `Die Pause (${f.break_minutes} Min) muss kürzer sein als die Anwesenheit von ${span} Min.`
  }
  return null
}

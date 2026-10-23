// Ansichtszustand der Einsatzplanung über einen Ausflug in die Projektmaske
// hinweg (docs/specs/einsatzplanung-rueckmeldungen-2026-10.md §2.2 Pkt. 2).
//
// Doppelklick auf einen Einsatz → Projektmaske → Zurück: AdminApp baut den
// Screen neu auf (Fragment-key), und ohne Ablage stand die Planung danach
// wieder auf «Monat» und «heute», mit dem ersten Mitarbeiter und allen
// ausgeblendeten wieder sichtbar. Wer in KW 47 in der Mitarbeiter-Ansicht von
// Peter war, fing von vorn an.
//
// sessionStorage, nicht localStorage: ein neuer Tab soll wie bisher bei
// «heute» starten — gemerkt wird nur innerhalb der Sitzung. Damit fällt der
// Key auch nicht unter APP_DATA_VERSION (das betrifft localStorage).

import type { SchedulingViewKey } from '../../api/admin'

export const SCHEDULE_VIEW_KEY = 'einsatzplanung-ansicht'

export interface ScheduleViewState {
  view?: SchedulingViewKey
  /** Sichtbares Datum als YYYY-MM-DD (lokal). */
  date?: string
  /** Fokussierter Mitarbeiter der Mitarbeiter-Ansicht — id statt Index, die
   *  Reihenfolge der Liste kann sich zwischen zwei Besuchen ändern. */
  staffId?: string | null
  hiddenStaff?: string[]
}

export function readScheduleView(): ScheduleViewState {
  try {
    const raw = window.sessionStorage.getItem(SCHEDULE_VIEW_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as ScheduleViewState : {}
  } catch {
    return {}
  }
}

export function writeScheduleView(state: ScheduleViewState): void {
  // Private-Mode / voller Storage darf die Planung nicht blockieren.
  try { window.sessionStorage.setItem(SCHEDULE_VIEW_KEY, JSON.stringify(state)) } catch { /* egal */ }
}

/** YYYY-MM-DD → lokales Datum (Mitternacht); ungültig → null. */
export function parseViewDate(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

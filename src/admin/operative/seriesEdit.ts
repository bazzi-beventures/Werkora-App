// Serientermine nachträglich anpassen — Spec
// docs/specs/einsatzplanung-rueckmeldungen-2026-10.md §3.
//
// Gerechnet wird auf dem Server (db/project_appointments.py::plan_series_change):
// welche Termine eine Reichweite trifft, wohin sie verschoben werden, was beim
// Verlängern dazukommt. Hier steht nur, was die Oberfläche selbst entscheiden
// muss — Beschriftungen, das aktuelle Ende einer Serie und die Regel «eine Art
// Serien-Änderung pro Speichern», damit der Planer die Rückmeldung bekommt,
// bevor er auf den Server wartet.

import type { AppointmentScope, ProjectAppointment, SeriesRule } from '../../api/admin'

export const SCOPE_LABELS: Record<AppointmentScope, string> = {
  single: 'Nur dieser Termin',
  following: 'Dieser und alle folgenden',
  series: 'Ganze Serie',
}

const FREQ_LABELS: Record<SeriesRule['freq'], [string, string]> = {
  // [Abstand 1, Abstand n — mit {n}]
  daily: ['täglich', 'alle {n} Tage'],
  workdays: ['werktags', 'alle {n} Werktage'],
  weekly: ['wöchentlich', 'alle {n} Wochen'],
  monthly: ['monatlich', 'alle {n} Monate'],
}

/** «wöchentlich», «alle 2 Wochen» … — '' ohne bekannte Regel. */
export function describeRule(rule: SeriesRule | null | undefined): string {
  if (!rule?.freq || !FREQ_LABELS[rule.freq]) return ''
  const n = rule.interval && rule.interval > 1 ? rule.interval : 1
  const [one, many] = FREQ_LABELS[rule.freq]
  return n === 1 ? one : many.replace('{n}', String(n))
}

/** Termine einer Serie, chronologisch. Nimmt die Liste, die gerade da ist —
 *  eine Antwort ohne Array (Fehlerseite, Mock) ergibt eine leere Serie. */
export function seriesRows(all: unknown, seriesId: string | null): ProjectAppointment[] {
  if (!seriesId || !Array.isArray(all)) return []
  return (all as ProjectAppointment[])
    .filter(a => a.series_id === seriesId)
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id))
}

/** Aktuelles Ende einer Serie (Startdatum ihres letzten Termins). Die
 *  gespeicherte Regel gewinnt nicht: die Zeilen sind die Wahrheit. */
export function seriesEnd(rows: ProjectAppointment[], rule?: SeriesRule | null): string {
  if (rows.length > 0) return rows[rows.length - 1].start_date.slice(0, 10)
  return rule?.until ?? ''
}

export interface SeriesChange {
  scope: AppointmentScope
  dateChanged: boolean
  untilChanged: boolean
  rhythmChanged: boolean
}

/** Fehlertext, wenn ein Speichern mehr als eine Art Serien-Änderung enthält —
 *  sonst null. Dieselbe Regel wie der Server (`one_series_change_at_a_time`). */
export function seriesChangeError(c: SeriesChange): string | null {
  if (c.rhythmChanged && c.scope !== 'following') {
    return 'Ein neuer Rhythmus gilt ab diesem Termin — dafür «Dieser und alle folgenden» wählen.'
  }
  const kinds = [c.scope !== 'single' && c.dateChanged, c.untilChanged, c.rhythmChanged].filter(Boolean)
  if (kinds.length > 1) {
    return 'Bitte eins nach dem anderen: Datum verschieben, Ende ändern oder Rhythmus wechseln — und dazwischen speichern.'
  }
  return null
}

/** Hinweis unter der Reichweite: was ein geändertes Datum bewirkt. */
export function scopeHint(scope: AppointmentScope): string {
  if (scope === 'single') return 'Nur dieser Termin wird geändert — die übrigen der Serie bleiben, wie sie sind.'
  const wer = scope === 'following' ? 'dieser und alle folgenden Termine' : 'alle Termine der Serie'
  return `Uhrzeit, Typ, Bezeichnung und Team gelten für ${wer}. Ein neues Datum verschiebt ${wer} um gleich viele Tage.`
}

/** Toast nach dem Speichern einer Serien-Änderung. */
export function seriesSavedMessage(res: { series_created?: number; series_deleted?: number; series_updated?: number }): string {
  const parts: string[] = []
  if (res.series_created) parts.push(`${res.series_created} ${res.series_created === 1 ? 'Termin' : 'Termine'} angehängt`)
  if (res.series_deleted) parts.push(`${res.series_deleted} entfernt`)
  if (parts.length === 0 && (res.series_updated ?? 1) > 1) parts.push(`${res.series_updated} Termine angepasst`)
  return parts.length ? `Serie gespeichert: ${parts.join(', ')}.` : 'Gespeichert.'
}

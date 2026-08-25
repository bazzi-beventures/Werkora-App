import type { ProjectReport } from './types'

// Ein Rapport taugt als Rechnungsbasis, wenn er vom Kunden unterschrieben ODER
// manuell vom Projektleiter erfasst wurde (source 'admin_manual' — per Design
// ohne Unterschrift, das Backend behandelt ihn trotzdem als verrechnungsreif).
// Steuert die use_quote-Heuristik und den „kein Rapport"-Warnhinweis, damit ein
// manuell erfasster Rapport tatsächlich aus dem Rapport (nicht der Offerte)
// verrechnet wird.
//
// Spiegelbild von services/invoice_positions.py::is_invoice_ready_report — die
// beiden müssen dieselben Regeln kennen, sonst bietet die Maske einen
// Rechnungslauf an, den der Server mit 400 ablehnt (oder umgekehrt versteckt sie
// einen, der ginge). Deshalb auch die zwei Teilrapport-Ausnahmen
// (docs/specs/teilrapport.md §3.4 b):
//
//   * Ein Teilrapport öffnet das Tor NIE selbst — auch nicht als 'admin_manual'.
//     Er wartet auf die Unterschrift seines Gesamtrapports; die öffnet das Tor.
//   * Ein AUFGELÖSTER Gesamtrapport zählt nicht mehr: seine Kinder sind wieder
//     frei, er selbst trägt keine Positionen. Sein PDF bleibt als Beleg, ist aber
//     keine Abnahme für etwas, das noch offen ist.
//   * Ein Gesamtrapport zählt nur ABGENOMMEN — unterschrieben oder vom
//     Projektleiter ohne Unterschrift abgeschlossen (pl_accepted_at, 20260824d).
//     Seine Erfassungsart zählt nicht: auch der vom PL gebündelte Behälter
//     (source 'admin_manual') ist keine Erfassung, sondern der Träger der Abnahme.
export function hasBillableReport(
  reports: Pick<ProjectReport, 'signature_timestamp' | 'source' | 'is_partial'
    | 'is_aggregate' | 'dissolved_at' | 'pl_accepted_at'>[],
): boolean {
  return reports.some(r => {
    if (r.is_partial || r.dissolved_at) return false
    if (r.signature_timestamp) return true
    if (r.is_aggregate) return !!r.pl_accepted_at
    return r.source === 'admin_manual'
  })
}

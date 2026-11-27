import { fmtDate } from '../../utils/format'
import type { ProjectQuote, ProjectReport } from './types'

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

type RapportFelder = Pick<ProjectReport, 'signature_timestamp' | 'source' | 'is_partial'
  | 'is_aggregate' | 'dissolved_at' | 'pl_accepted_at' | 'report_date'>

// Offerte, aus der der use_quote-Pfad rechnen kann: weder archiviert noch abgelehnt
// (services/quote_variants.py::is_rejected_quote — 'abgelehnt' sagt der Kunde,
// 'absage' sagen wir). Eine noch nicht angenommene zählt: der Server rechnet sie
// mit einem Hinweis ab.
function hatVerrechenbareOfferte(quotes: Pick<ProjectQuote, 'status'>[]): boolean {
  return quotes.some(q => !['archiviert', 'abgelehnt', 'absage'].includes(q.status))
}

// Hinweis über der Rechnung, wenn kein abgenommener Rapport da ist — null, wenn
// einer da ist. Ohne verrechenbaren Rapport schickt die Maske use_quote; fehlt
// dann auch die Offerte, findet der Server nichts und lehnt mit 400 ab. Der
// häufigste Grund ist ein gebündelter, noch nicht abgenommener Gesamtrapport:
// er sperrt seine Teilrapporte gleich mit (Support WS-53). Den nennt der Hinweis
// beim Namen, statt eine Offerte anzukündigen, die es nicht gibt.
export function rechnungsgrundlageHinweis(
  reports: RapportFelder[], quotes: Pick<ProjectQuote, 'status'>[],
): string | null {
  if (hasBillableReport(reports)) return null
  const offen = reports.find(r => r.is_aggregate && !r.dissolved_at
    && !r.signature_timestamp && !r.pl_accepted_at)
  const abnehmen = 'im Reiter «Rapporte» unterschreiben lassen oder «Ohne Unterschrift abschliessen».'
  const gesamtrapport = offen ? `Der Gesamtrapport vom ${fmtDate(offen.report_date)} ist noch nicht abgenommen` : null
  if (hatVerrechenbareOfferte(quotes)) {
    const basis = 'Kein abgenommener Rapport vorhanden — die Rechnung wird auf Basis '
      + 'der aktuellen (zuletzt bearbeiteten) Offerte erstellt.'
    return gesamtrapport
      ? `${basis} ${gesamtrapport}; soll nach Rapport verrechnet werden, ihn zuerst ${abnehmen}`
      : basis
  }
  if (gesamtrapport) {
    return `${gesamtrapport} und das Projekt hat keine Offerte — es gibt noch nichts zu `
      + `verrechnen. Den Gesamtrapport zuerst ${abnehmen}`
  }
  return 'Kein abgenommener Rapport und keine Offerte vorhanden — es gibt noch nichts '
    + 'zu verrechnen. Zuerst einen Rapport vom Kunden unterschreiben lassen oder manuell erfassen.'
}

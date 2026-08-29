// Dateien am Projekt sind in beiden Sichten dieselben Zeilen (Charge H5) — der
// Typ steht in shared/projectDetail/types, hier nur die Wiederausfuhr, damit die
// Reiter ihn wie bisher aus './types' beziehen.
export type { ProjectFile, ProjectFileCategory } from '../../../shared/projectDetail/types'

export interface ProjectQuote {
  id: number
  parent_id: number | null
  version: number
  quote_number: string
  total_amount: number
  status: string
  created_at: string
  storage_path?: string | null
  xlsx_storage_path?: string | null
  customer_email: string | null
  thankyou_sent_at?: string | null
  order_confirmation_sent_at?: string | null
  rejection_mail_sent_at?: string | null
  variant_group_id?: string | null
  variant_group_kind?: string | null
  variant_rank?: number | null
}

export interface ProjectInvoice {
  id: number
  parent_id: number | null
  version: number
  invoice_number: string
  total_amount: number
  status: string
  created_at: string
  paid_at: string | null
  storage_path?: string | null
  created_without_report?: boolean
}

export interface ProjectReport {
  id: number
  report_date: string
  description: string | null
  // Wer den Rapport ERFASST hat — beim nacherfassten Rapport das Büro, nicht der
  // Monteur. Deshalb steht in der Zeile `monteure`; created_by nur als Zusatz.
  created_by: string | null
  // Wer vor Ort war: aus den erfassten Stunden (labor_hours), serverseitig
  // zusammengesetzt wie die Kopfzeile des Rapport-PDFs. Ohne erfasste Stunden
  // (Massaufnahme/Beratung) fällt der Server auf created_by zurück; fehlt das
  // Feld ganz, ist die Antwort älter als die Ergänzung.
  monteure?: string | null
  storage_path?: string | null
  signature_timestamp: string | null
  invoice_id: number | null
  created_at: string
  // Herkunft des Rapports: 'chat' (Standard, Monteur-App) oder 'admin_manual'
  // (Projektleiter hat ihn im Projekt-Detail nacherfasst). Steuert das Badge.
  source?: string
  // Dieser Einsatz ist als Garantiefall erfasst (reports.is_warranty). Eigenes
  // Badge NEBEN dem Status: es ersetzt «Abgerechnet»/«Manuell» nicht, sondern
  // ergänzt sie — beim Verrechnen ist genau diese Kombination die interessante.
  is_warranty?: boolean | null
  // Teilrapport/Sammelrapport (docs/specs/teilrapport.md). Alle vier optional: ein
  // Alt-Server ohne die Spalten liefert sie nicht, dann sieht die Liste aus wie vor
  // dem Feature. Sie tragen das Status-Badge und die Bündeln/Auflösen-Knöpfe.
  is_partial?: boolean | null
  is_aggregate?: boolean | null
  merged_into_report_id?: number | null
  dissolved_at?: string | null
  // Vom Projektleiter ohne Kundenunterschrift abgeschlossen (Migration 20260824d) —
  // dieselbe Abnahme-Wirkung wie die Unterschrift, aber ausdrücklich keine.
  pl_accepted_at?: string | null
}

// Aufgaben/Hinweise am Projekt: dieselbe Zeile, die die Monteur-PWA abhakt
// (api/projectTasks trägt auch die Aufrufe beider Seiten) — Charge H5.
export type { ProjectTask } from '../../../api/projectTasks'

export interface ProjectApproval {
  id: string
  title: string
  filename: string
  storage_path?: string | null
  mime_type: string | null
  requested_by_user_id: string | null
  requested_by_name: string | null
  approver_user_id: string | null
  approver_name: string | null
  status: 'pending' | 'approved' | 'rejected'
  decided_at: string | null
  decision_note: string | null
  created_at: string
}

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendent',
  approved: 'Freigegeben',
  rejected: 'Abgelehnt',
}

export const APPROVAL_STATUS_BADGE: Record<string, string> = {
  pending: 'admin-badge-open',
  approved: 'admin-badge-paid',
  rejected: 'admin-badge-closed',
}

export function groupByParent<T extends { id: number; parent_id: number | null; version: number }>(items: T[]): T[][] {
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const key = item.parent_id ?? item.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  const result = Array.from(groups.values())
  for (const g of result) g.sort((a, b) => b.version - a.version)
  result.sort((a, b) => {
    const aDate = (a[0] as unknown as { created_at: string }).created_at
    const bDate = (b[0] as unknown as { created_at: string }).created_at
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })
  return result
}

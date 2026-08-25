// Zahlungsabgleich: CAMT.054-Import und Differenz-Auflösung (Modul `payment_matching`).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFormFetch } from '../client'

export type ReconcileStatus = 'matched' | 'amount_mismatch' | 'already_paid' | 'unmatched'

export interface ReconcileResult {
  status: ReconcileStatus
  reference: string | null
  paid_amount: number
  currency: string | null
  value_date: string | null
  debtor_name: string | null
  invoice_id: number | null
  invoice_number: string | null
  project_name: string | null
  expected_amount: number | null
  amount_diff: number | null
}

export interface ReconcileSummary {
  total: number
  matched: number
  amount_mismatch: number
  already_paid: number
  unmatched: number
  applied: number
  dry_run: boolean
}

export interface ReconcileResponse {
  status: string
  summary: ReconcileSummary
  results: ReconcileResult[]
}

export async function reconcileCamt(file: File, dryRun: boolean): Promise<ReconcileResponse> {
  const form = new FormData()
  form.append('file', file)
  return apiFormFetch<ReconcileResponse>(
    `/pwa/admin/invoices/reconcile-camt?dry_run=${dryRun ? 'true' : 'false'}`,
    form,
  )
}

export async function getInvoicePdf(id: string): Promise<Blob> {
  const resp = await fetch(`/pwa/admin/invoices/${id}/pdf`, {
    credentials: 'include',
  })
  if (!resp.ok) throw new Error('PDF-Download fehlgeschlagen')
  return resp.blob()
}

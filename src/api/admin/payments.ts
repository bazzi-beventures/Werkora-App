// Zahlungsabgleich: CAMT.054-Import und Differenz-Auflösung (Modul `payment_matching`).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFormFetch } from '../client'
import type { Antwort } from '../generated'

// Generiert aus den Antwort-Modellen in agents/routers/antworten/rechnungen.py.
export type ReconcileResult = Antwort<'AbgleichZeile'>
export type ReconcileStatus = ReconcileResult['status']
export type ReconcileSummary = Antwort<'AbgleichSumme'>
export type ReconcileResponse = Antwort<'CamtAbgleich'>

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

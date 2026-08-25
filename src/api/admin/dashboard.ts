// Admin-Dashboard: Kennzahlen-Kacheln, offene Posten, überfällige Projekte.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export interface AdminDashboard {
  pending_corrections: number
  pending_absences: number
  open_invoices: number
  open_sessions: number
  draft_quotes: number
  quotes_pending_reminder: number
  invoices_pending_action: number
  pending_approvals: number
  projects_overdue: number
  pending_drafts: number
  recently_accepted_quotes: number
  recently_rejected_quotes: number
  my_open_tasks?: number
}

export interface OverdueProject {
  id: string
  name: string
  customer_name: string | null
  start_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
}

export async function getOverdueProjects(): Promise<OverdueProject[]> {
  return apiFetch<OverdueProject[]>('/pwa/admin/projects/overdue')
}

export interface PendingApproval {
  id: string
  title: string
  filename: string
  file_url: string | null
  storage_path?: string | null
  mime_type: string | null
  requested_by_name: string | null
  created_at: string
  project_id: string
  project_name: string | null
}

export async function getPendingApprovals(): Promise<PendingApproval[]> {
  return apiFetch<PendingApproval[]>('/pwa/admin/approvals/pending')
}

export async function approveApproval(id: string, note?: string): Promise<void> {
  await apiFetch(`/pwa/admin/approvals/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ note: note ?? null }),
  })
}

export async function rejectApproval(id: string, note?: string): Promise<void> {
  await apiFetch(`/pwa/admin/approvals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note: note ?? null }),
  })
}

export interface PendingActionInvoice {
  id: number
  invoice_number: string
  project_id: string | null
  project_name: string
  project_id_text: string | null
  customer_name: string | null
  total_amount: number
  sent_at: string | null
  due_date: string | null
  zahlungserinnerung_sent_at: string | null
  mahnung_sent_at: string | null
}

export interface PendingReminderQuote {
  id: number
  quote_number: string
  customer_name: string
  customer_email: string
  project_name: string
  total_amount: number
  sent_at: string | null
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  return apiFetch<AdminDashboard>('/pwa/admin/dashboard')
}

export async function getPendingReminderQuotes(): Promise<PendingReminderQuote[]> {
  return apiFetch<PendingReminderQuote[]>('/pwa/admin/quotes/pending-reminders')
}

export async function sendQuoteReminder(quoteId: number): Promise<void> {
  await apiFetch(`/pwa/admin/quotes/${quoteId}/send-reminder`, { method: 'POST' })
}

export async function getPendingActionInvoices(): Promise<PendingActionInvoice[]> {
  return apiFetch<PendingActionInvoice[]>('/pwa/admin/invoices/pending-action')
}

export async function sendZahlungserinnerung(invoiceId: number): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${invoiceId}/send-zahlungserinnerung`, { method: 'POST' })
}

export async function sendMahnung(invoiceId: number): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${invoiceId}/send-mahnung`, { method: 'POST' })
}

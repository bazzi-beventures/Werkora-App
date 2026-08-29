// Offerten — bisher nur das, was andere Domänen brauchen.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.
//
// Mit Charge H2 ist der QuotesScreen hier angekommen: Liste, Detail, Anlegen,
// Bearbeiten, Status, Versand und die PDF-Extraktion laufen über dieses Modul.
// In den Screens steht kein roher `/pwa/admin/…`-Aufruf mehr (Wächter:
// rawAdminFetch.guard.test.ts).

import { apiFetch, apiFormFetch } from '../client'
import type { ConfirmedPosition, PdfExtractionResponse } from '../../admin/operative/PdfExtractionReviewModal'

// Teilmenge der Listen-Antwort: was für die Frage «gibt es zu diesem Projekt eine
// angenommene Offerte?» reicht.
export interface QuoteProjectRef {
  project_id?: string | null
  project_name: string
  status: string
}

export async function listQuoteProjectRefs(): Promise<QuoteProjectRef[]> {
  return apiFetch<QuoteProjectRef[]>('/pwa/admin/quotes')
}

/**
 * Hat das Projekt eine angenommene Offerte? Entscheidet im Rechnungs-Dialog, ob
 * «aus Offerte abrechnen» überhaupt angeboten wird.
 *
 * Die Zuordnung läuft über die `project_id`; der Name dient nur als Fallback für
 * Alt-Offerten, die noch keine ID tragen.
 */
export async function hasAcceptedQuote(projectId: string, projectName: string): Promise<boolean> {
  const quotes = await listQuoteProjectRefs()
  return quotes.some(q =>
    q.status === 'akzeptiert'
    && (q.project_id ? q.project_id === projectId : q.project_name === projectName))
}

/**
 * Danke-Mail zu einer angenommenen Offerte von Hand versenden. Die Antwort trägt
 * die Meldung, die der Dialog anzeigt (z.B. mit Hinweis auf den Empfänger).
 */
export async function sendQuoteThankyou(
  quoteId: number | string, recipientEmail: string,
): Promise<{ message?: string }> {
  return apiFetch<{ message?: string }>(`/pwa/admin/quotes/${quoteId}/send-thankyou`, {
    method: 'POST',
    body: JSON.stringify({ recipient_email: recipientEmail }),
  })
}

/**
 * Auftragsbestätigung zu einer angenommenen Offerte von Hand versenden.
 *
 * Hängt bewusst an KEINEM Feature-Flag — anders als Danke-/Absage-Mail steht der
 * Knopf jedem Mandanten offen. Das Feature `offerte_auftragsbestaetigung` schaltet
 * nur den automatischen Versand bei jeder Annahme.
 *
 * `resend` ist der bewusste zweite Versand. Ohne das Flag lehnt das Backend eine
 * bereits versendete Bestätigung weiterhin ab — ein Doppelklick löst also keine
 * zweite Mail aus.
 */
export async function sendQuoteOrderConfirmation(
  quoteId: number | string, recipientEmail: string, resend = false,
): Promise<{ message?: string }> {
  return apiFetch<{ message?: string }>(`/pwa/admin/quotes/${quoteId}/send-order-confirmation`, {
    method: 'POST',
    body: JSON.stringify({ recipient_email: recipientEmail, resend }),
  })
}

/** Vollständige Offerte inklusive aller Positionen. */
export async function getQuoteDetail(quoteId: number): Promise<QuoteDetail> {
  return apiFetch<QuoteDetail>(`/pwa/admin/quotes/${quoteId}`)
}

/** Erzeugt das PDF neu (neue Version) — Inhalt bleibt, Nummer und Datei nicht. */
export async function regenerateQuote(quoteId: number): Promise<void> {
  await apiFetch(`/pwa/admin/quotes/${quoteId}/regenerate`, { method: 'POST' })
}

/**
 * «Weitere Offerte»: kopiert die Offerte als neue Variante in dieselbe Gruppe.
 * `kind` legt beim ersten Mal die Art fest — 'variante' (Kunde wählt eine) oder
 * 'mehrfach' (Kunde kann mehrere annehmen).
 */
export async function addQuoteVariant(
  quoteId: number, kind: 'variante' | 'mehrfach',
): Promise<void> {
  await apiFetch(`/pwa/admin/quotes/${quoteId}/add-variant`, {
    method: 'POST',
    body: JSON.stringify({ variant_group_kind: kind }),
  })
}

export async function setQuoteStatus(quoteId: number, status: string): Promise<void> {
  await apiFetch(`/pwa/admin/quotes/${quoteId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

/** Absage-Mail an den Kunden; die Antwort trägt die Meldung für den Toast. */
export async function sendQuoteRejection(quoteId: number): Promise<{ message?: string }> {
  return apiFetch<{ message?: string }>(`/pwa/admin/quotes/${quoteId}/send-rejection`, {
    method: 'POST',
  })
}

// ─── Liste und Detail ───────────────────────────────────────

/** Eine Offerte in der Liste. `sent_at` trägt die Kennzeichnung «Kein Feedback»
 *  (Feature offerte_kein_feedback_meldung, siehe quoteFeedback.ts). */
export interface Quote {
  id: number
  quote_number: string
  project_name: string
  total_amount: number
  status: string
  created_at: string
  storage_path?: string | null
  xlsx_storage_path?: string | null
  reminder_sent_at: string | null
  projektleiter_id: string | null
  // Text-Snapshot des Rechnungsempfängers (siehe quotes.customer_id) — für die
  // Kunden-Spalte und die Suche in der Liste.
  customer_name?: string | null
  customer_email?: string | null
  thankyou_sent_at?: string | null
  rejection_mail_sent_at?: string | null
  order_confirmation_sent_at?: string | null
  sent_at?: string | null
}

/** Offerte mit allen Positionen — was die Bearbeiten-Maske füllt.
 *
 * Die Metadaten der Produktzeilen (ek_price/margin_factor/supplier_id/category/
 * positions) stammen aus PDF-Extraktion oder manueller Erfassung. Sie sind
 * preisneutral (das Total zählt nur total_price), aber für die Nachkalkulation
 * relevant — sie dürfen ein Bearbeiten nicht verlieren. */
export interface QuoteDetail {
  id: number
  quote_number: string
  project_name: string
  project_id?: string | null
  // Kunde der Offerte — eigenständig gegenüber dem Projektkunden (quotes.customer_id).
  // Alt-Offerten haben nur den Text-Snapshot customer_name, customer_id ist dort null.
  customer_id: string | null
  customer_name: string | null
  labor_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number; hidden?: boolean }[]
  material_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number; optional?: boolean }[]
  travel_items: { description: string; total_price: number }[]
  extra_product_items: {
    description: string; quantity: number; unit: string; unit_price: number; total_price: number
    optional?: boolean
    ek_price?: number
    margin_factor?: number
    supplier_id?: string | null
    category?: string | null
    positions?: ConfirmedPosition[]
  }[]
  // `werkora_bonus`: automatisch ergänzte Endziffern-Aufrundung (Feature
  // `werkora_bonus`). Beim Bearbeiten unverändert zurückschicken — das Backend
  // erkennt die Zeile daran und nimmt sie aus der Rechenbasis.
  extra_charge_items: { description: string; total_price: number; werkora_bonus?: boolean }[]
  installation_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number }[]
  special_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number }[]
  labor_discount_pct: number
  material_discount_pct: number
  skonto_pct: number | null
  skonto_days: number | null
  // Fixpreis brutto inkl. MwSt (Migration 20260813). null = kein Fixpreis.
  fixed_price: number | null
  notes: string | null
  product_description: string | null
}

export async function listQuotes(): Promise<Quote[]> {
  return apiFetch<Quote[]>('/pwa/admin/quotes')
}

// ─── Anlegen und Bearbeiten ─────────────────────────────────

/** Antwort beider Schreibpfade. `fixed_price_missed` heisst: gespeichert, aber der
 *  Fixpreis geht nicht auf (über der Kalkulation oder unter Lohn + Fahrt) — das
 *  Total der Offerte ist dann ein anderes als der eingegebene Betrag. */
export interface QuoteWriteResult {
  total_amount?: number
  fixed_price_missed?: boolean
}

// Der Payload wird in admin/operative/quotes/quotePayload.ts gebaut (dort liegt die
// Zeilentotal-Rechnung samt Test). Hier steht bewusst kein zweites Schema davon —
// eines der beiden liefe sonst der Maske hinterher.
export type QuotePayload = Record<string, unknown>

export async function createQuote(payload: QuotePayload): Promise<QuoteWriteResult> {
  return apiFetch<QuoteWriteResult>('/pwa/admin/quotes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateQuote(quoteId: number, payload: QuotePayload): Promise<QuoteWriteResult> {
  return apiFetch<QuoteWriteResult>(`/pwa/admin/quotes/${quoteId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** Lieferanten-PDF (Griesser/Stobag u.a.) per OCR in Produktzeilen zerlegen.
 *  Läuft lange — die Fehlerbehandlung dazu steht in QuoteFormParts.pdfUploadErrorMessage. */
export async function extractQuotePdf(file: File): Promise<PdfExtractionResponse> {
  const form = new FormData()
  form.append('file', file)
  return apiFormFetch<PdfExtractionResponse>('/pwa/admin/quotes/extract-pdf', form)
}

// ─── Versand ────────────────────────────────────────────────

/** Antwort von GET /pwa/admin/quotes/{id}/send-attachments — steuert, welche
 *  Anhang-Quellen der Versand-Dialog anbietet. Zwei getrennte Schalter: `enabled`
 *  für die Dokumente (Feature prospekt_mit_offerte), `fotos_enabled` für die
 *  Projekt-Fotos (Feature fotos_mit_offerte). */
export interface SendAttachmentsInfo {
  enabled: boolean
  fotos_enabled: boolean
  project_id: string | null
  projekt_anhaenge: { id: string; filename: string }[]
  vorlagen: { id: string; filename: string }[]
  projekt_fotos: { id: string; filename: string; mime_type: string | null; created_at?: string | null }[]
}

export async function getQuoteSendAttachments(quoteId: number): Promise<SendAttachmentsInfo> {
  return apiFetch<SendAttachmentsInfo>(`/pwa/admin/quotes/${quoteId}/send-attachments`)
}

export interface SendQuoteInput {
  quoteId: number
  recipientEmail: string
  additionalRecipients: string[]
  ccRecipients: string[]
  anhangFileIds: string[]
  vorlageAttachmentIds: string[]
  fotoFileIds: string[]
}

export async function sendQuote(input: SendQuoteInput): Promise<void> {
  await apiFetch('/pwa/admin/quotes/send', {
    method: 'POST',
    body: JSON.stringify({
      quote_id: input.quoteId,
      recipient_email: input.recipientEmail,
      additional_recipients: input.additionalRecipients,
      cc_recipients: input.ccRecipients,
      anhang_file_ids: input.anhangFileIds,
      vorlage_attachment_ids: input.vorlageAttachmentIds,
      foto_file_ids: input.fotoFileIds,
    }),
  })
}

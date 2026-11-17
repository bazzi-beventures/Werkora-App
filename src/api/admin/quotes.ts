// Offerten — bisher nur das, was andere Domänen brauchen.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.
//
// Mit Charge H2 ist der QuotesScreen hier angekommen: Liste, Detail, Anlegen,
// Bearbeiten, Status, Versand und die PDF-Extraktion laufen über dieses Modul.
// In den Screens steht kein roher `/pwa/admin/…`-Aufruf mehr (Wächter:
// rawAdminFetch.guard.test.ts).

import { apiBlobFetch, apiFetch, apiFormFetch } from '../client'
import type { Antwort } from '../generated'
import { listPageParams, type ListPage, type ListPageQuery } from './listPage'
import type { PdfExtractionResponse } from '../../admin/operative/PdfExtractionReviewModal'

// Teilmenge der Listen-Antwort: was für die Frage «gibt es zu diesem Projekt eine
// angenommene Offerte?» reicht.
export type QuoteProjectRef = Pick<Quote, 'project_id' | 'project_name' | 'status'>

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
  quoteId: number | string, recipientEmail: string, resend = false, ccRecipients: string[] = [],
): Promise<{ message?: string }> {
  // `cc_recipients` nur, wenn es welche gibt — der Body ohne CC bleibt wie bisher.
  const cc = ccRecipients.map(a => a.trim()).filter(Boolean)
  return apiFetch<{ message?: string }>(`/pwa/admin/quotes/${quoteId}/send-order-confirmation`, {
    method: 'POST',
    body: JSON.stringify({ recipient_email: recipientEmail, resend, ...(cc.length ? { cc_recipients: cc } : {}) }),
  })
}

/**
 * Auftragsbestätigung nur als PDF erzeugen und herunterladen — ohne Mail an den
 * Kunden (Post, persönliche Übergabe, eigenes Mailprogramm, oder erst ansehen).
 *
 * Gleiches Dokument wie beim Versand, gleiche Ablage beim Projekt unter «Offerten».
 * Der Versand-Stempel (`order_confirmation_sent_at`) bleibt dagegen unberührt:
 * heruntergeladen ist nicht versendet.
 */
export async function downloadQuoteOrderConfirmationPdf(quoteId: number | string): Promise<void> {
  const { blob, filename } = await apiBlobFetch(
    `/pwa/admin/quotes/${quoteId}/order-confirmation-pdf`,
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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

/**
 * Offerte als (per Post/von Hand) versendet markieren, ohne sie zu mailen —
 * das Gegenstück zu `markInvoiceSentByPost`.
 *
 * `sentDate` ist das Versanddatum (ISO, JJJJ-MM-TT), nachtragbar: der Postversand
 * wird oft erst Tage später erfasst, und an dem Datum hängen Erinnerungsfrist und
 * die Kennzeichnung «Kein Feedback».
 */
export async function markQuoteSentByPost(quoteId: number, sentDate: string): Promise<void> {
  await apiFetch(`/pwa/admin/quotes/${quoteId}/mark-sent`, {
    method: 'POST',
    body: JSON.stringify({ sent_date: sentDate }),
  })
}

/** Absage-Mail an den Kunden; die Antwort trägt die Meldung für den Toast. */
export async function sendQuoteRejection(quoteId: number): Promise<{ message?: string }> {
  return apiFetch<{ message?: string }>(`/pwa/admin/quotes/${quoteId}/send-rejection`, {
    method: 'POST',
  })
}

// ─── Liste und Detail ───────────────────────────────────────

/** Eine Offerte in der Liste — generiert aus `OfferteZeile`
 *  (agents/routers/antworten/offerten.py, Feldbeschreibungen dort). */
export type Quote = Antwort<'OfferteZeile'>

/** Offerte mit allen Positionen — was die Bearbeiten-Maske füllt (generiert aus
 *  `OfferteDetail`). Die Metadaten der Produktzeilen (EK, Faktor, Lieferant,
 *  Positionen) sind preisneutral, dürfen ein Bearbeiten aber nicht verlieren. */
export type QuoteDetail = Antwort<'OfferteDetail'>

export async function listQuotes(): Promise<Quote[]> {
  return apiFetch<Quote[]>('/pwa/admin/quotes')
}

/** Eine Seite der Offertenliste — Status, Suche und Projektleiter filtert der
 *  Server. Die Suche läuft über Nummer, Projekt, Kunde und den Projektleiter, der
 *  die Offerte erstellt hat (Snapshot). */
export async function listQuotesPage(
  q: ListPageQuery & {
    /** Nur Offerten, die in den letzten n Tagen angenommen bzw. abgelehnt wurden
     *  (genau ein Status `akzeptiert`/`abgelehnt`) — das Fenster der Dashboard-Kacheln. */
    entschiedenSeitTagen?: number
  },
): Promise<ListPage<Quote>> {
  const fenster = q.entschiedenSeitTagen ? `&entschieden_seit_tagen=${q.entschiedenSeitTagen}` : ''
  return apiFetch<ListPage<Quote>>(`/pwa/admin/quotes/list?${listPageParams(q)}${fenster}`)
}

// ─── Anlegen und Bearbeiten ─────────────────────────────────

/** Antwort beider Schreibpfade (generiert aus `OfferteGespeichert`). */
export type QuoteWriteResult = Antwort<'OfferteGespeichert'>

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

/** Anhang-Quellen des Versand-Dialogs — generiert aus `VersandAnhaenge`. */
export type SendAttachmentsInfo = Antwort<'VersandAnhaenge'>

export async function getQuoteSendAttachments(quoteId: number): Promise<SendAttachmentsInfo> {
  return apiFetch<SendAttachmentsInfo>(`/pwa/admin/quotes/${quoteId}/send-attachments`)
}

/** Eine Offerte, die beim Versand zusammen mit der gewählten in EIN Mail geht
 *  (generiert aus `Gruppenmitglied`, WW-34). */
export type QuoteSendGroupMember = Antwort<'Gruppenmitglied'>

/** Leer = Einzelversand, der Dialog zeigt dann keine Auswahl. */
export async function getQuoteSendGroup(quoteId: number): Promise<QuoteSendGroupMember[]> {
  const res = await apiFetch<Antwort<'Versandgruppe'>>(`/pwa/admin/quotes/${quoteId}/send-group`)
  return res?.members ?? []
}

export interface SendQuoteInput {
  quoteId: number
  recipientEmail: string
  additionalRecipients: string[]
  ccRecipients: string[]
  anhangFileIds: string[]
  vorlageAttachmentIds: string[]
  fotoFileIds: string[]
  // Auswahl im Varianten-Versand; weglassen = alle offenen Offerten der Gruppe.
  groupQuoteIds?: number[]
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
      ...(input.groupQuoteIds ? { group_quote_ids: input.groupQuoteIds } : {}),
    }),
  })
}

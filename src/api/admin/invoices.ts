// Rechnungen: Liste, Erzeugung, Versand und Status-Wechsel (Modul `invoicing`).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiBlobFetch, apiFetch } from '../client'
import type { Antwort } from '../generated'
import { listPageParams, type ListPage, type ListPageQuery } from './listPage'
import { requestEasterEggCheck } from './eastereggs'

// Eine Zeile der Rechnungsliste — generiert aus dem Antwort-Modell `RechnungZeile`
// (agents/routers/antworten/rechnungen.py, Charge N). Wer ein Feld braucht oder
// ändert, ändert es dort und zieht nach: `python -m scripts.api_vertrag`, dann
// `npm run api:gen`. Die Feldbeschreibungen stehen im Modell.
export type Invoice = Antwort<'RechnungZeile'>

export interface GenerateInvoiceInput {
  project_name: string
  project_id: string
  // true = aus der akzeptierten Offerte abrechnen statt aus den Rapporten.
  use_quote: boolean
  // Arbeitsbeschrieb «Ausgeführte Arbeiten». Drei Zustände, die das Backend
  // unterscheidet (GenerateInvoiceRequest): weglassen = aus den Rapporten ableiten,
  // '' = bewusst geleert (kein Block auf dem PDF), Text = genau dieser Text. Ein
  // Aufrufer ohne Eingabefeld lässt das Feld deshalb weg — ein hartes '' unterdrückt
  // den Block, statt ihn abzuleiten.
  work_description?: string
  remark: string
  // Explizite Offerten-Auswahl aus dem Erstellen-Dialog (getInvoiceQuoteCoverage) —
  // auch gruppen-übergreifend oder als Teilmenge einer mehrfach-Gruppe (Etappe).
  // Weglassen = automatische Auflösung wie bisher; das Backend validiert die
  // Auswahl hart (409 statt stiller Korrektur).
  quote_ids?: number[]
  // «Allg. Abzüge» (Feature allgemeine_abzuege): Prozentsatz und Basis.
  // Weglassen = kein Abzug. Gesetzt ohne Freischaltung antwortet das Backend 403.
  general_deduction_pct?: number
  general_deduction_sections?: GeneralDeductionSection[]
  // «Weitere Rechnung» (WW-39/WW-47): eigene Rechnung neben den bestehenden statt
  // Neufassung der jüngsten. Nichts wird archiviert; was schon auf einer offenen
  // Rechnung steht, kommt nicht noch einmal drauf. Weglassen = Neufassung.
  additional?: boolean
  // Rapport-Auswahl (getBillableReports). Weglassen = alle verrechenbaren; das
  // Backend validiert hart (409).
  report_ids?: number[]
  // Abzuziehende Anzahlungen (getAnzahlungen). Weglassen = alle offenen, [] = keine.
  anzahlung_ids?: number[]
  // Anzahlungsrechnung über `anzahlung_pct` % des Offerten-Nettos (WW-47) oder
  // über `anzahlung_betrag` CHF inkl. MWST (WS-41) — genau eines von beiden.
  kind?: 'rechnung' | 'anzahlung'
  anzahlung_pct?: number
  anzahlung_betrag?: number
  // false = Fahrzeitkosten abgewählt. Weglassen = Vorgabe von Projekt/Offerte.
  include_travel?: boolean
}

/** Basis der Allg. Abzüge; `material` umfasst die weiteren Produkte. */
export type GeneralDeductionSection = 'labor' | 'material' | 'travel'

/** Antwort von «Rechnung erstellen» — generiert aus `RechnungErstellt`. */
export type GenerateInvoiceResult = Antwort<'RechnungErstellt'>
/** Antwort von «Rechnung ohne Projekt» — generiert aus `FreieRechnungErstellt`. */
export type FreeInvoiceResult = Antwort<'FreieRechnungErstellt'>

export async function listInvoices(status?: string): Promise<Invoice[]> {
  return apiFetch<Invoice[]>(`/pwa/admin/invoices${status ? `?status=${status}` : ''}`)
}

export type InvoicesPage = ListPage<Invoice>

/** Eine Seite der Rechnungsliste — Status, Suche (Nummer, Projekt) und
 *  Projektleiter filtert der Server. */
/** `ueberfaellig`: nur gesendete Rechnungen mit überschrittenem Zahlungsziel —
 *  dieselbe Regel wie die Kachel, der Statusfilter zählt dann nicht (WF-53). */
export async function listInvoicesPage(q: ListPageQuery & { ueberfaellig?: boolean }): Promise<InvoicesPage> {
  const extra = q.ueberfaellig ? '&ueberfaellig=true' : ''
  return apiFetch<InvoicesPage>(`/pwa/admin/invoices/list?${listPageParams(q)}${extra}`)
}

export async function generateInvoice(input: GenerateInvoiceInput): Promise<GenerateInvoiceResult> {
  const result = await apiFetch<GenerateInvoiceResult>('/pwa/admin/invoices/generate', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  // Eine neue Rechnung kann die Umsatzschwelle gerissen haben — nachfragen
  // lassen, statt bis zum nächsten Neuladen zu warten (api/admin/eastereggs.ts).
  requestEasterEggCheck()
  return result
}

/**
 * Rechnung als PDF ansehen, bevor sie entsteht (WF-51): derselbe Body wie
 * `generateInvoice`, das Backend speichert nichts und vergibt keine Nummer.
 * Öffnet das PDF (Wasserzeichen «VORSCHAU») in einem neuen Tab.
 */
export async function previewInvoice(input: GenerateInvoiceInput): Promise<void> {
  // Tab vor dem await öffnen: sonst blockiert der Popup-Blocker (Safari).
  const tab = window.open('', '_blank')
  try {
    const { blob } = await apiBlobFetch('/pwa/admin/invoices/preview', input)
    const url = URL.createObjectURL(blob)
    if (tab) tab.location.href = url
    else window.open(url, '_blank')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    tab?.close()
    throw err
  }
}

/**
 * Vorschlag für den Leistungsbeschrieb der Rechnung (aus Rapporten/Offerte
 * zusammengesetzt). Nicht blockierend gedacht: schlägt der Aufruf fehl, entsteht
 * die Rechnung ohne den Block.
 */
/** Eine Position der freien Rechnung. Spiegelt `FreePosition` aus
 *  services/free_invoice.py — dieselben vier Felder, dieselben Namen. */
export interface FreePosition {
  text: string
  menge: number
  einheit: string
  einzelpreis: number
}

export interface GenerateFreeInvoiceInput {
  customer_id: string
  /** Worum es geht, kurz («Hagelschaden-Modul») — Pflicht. Der Bezug einer Rechnung
   *  ohne Projekt: PDF-Titel und Mail-Betreff (services/rechnungs_bezug.py). */
  inhalt: string
  positions: FreePosition[]
  payment_terms_days: number
  remark?: string
}

/**
 * Rechnung ohne Projekt und ohne Rapport (§8.2 a).
 *
 * Läuft im Backend durch **dieselbe Kette** wie jede andere Rechnung — Nummer
 * aus dem RPC, SCOR-Referenz, PDF, Bucket, `save_invoice_record`; nur die
 * Datengrundlage sind Positionen statt Rapporten. Deshalb liefert sie auch
 * dasselbe Ergebnis zurück.
 *
 * Hinter `require_feature("freie_rechnung")`: ohne Flag antwortet der Server
 * 403, und das ist gewollt — der Rapport-Zwang der Projektrechnung soll nicht
 * als Nebenwirkung wegfallen.
 */
export async function generateFreeInvoice(
  input: GenerateFreeInvoiceInput,
): Promise<FreeInvoiceResult> {
  const result = await apiFetch<FreeInvoiceResult>('/pwa/admin/invoices/generate-free', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  requestEasterEggCheck()
  return result
}

export async function getInvoiceWorkDescription(
  projectName: string, projectId: string, additional = false, reportIds?: number[],
): Promise<string> {
  const res = await apiFetch<Antwort<'Arbeitsbeschrieb'>>(
    `/pwa/admin/invoices/work-description?project_name=${encodeURIComponent(projectName)}`
    + `&project_id=${encodeURIComponent(projectId)}`
    + (additional ? '&additional=true' : '')
    + (reportIds && reportIds.length ? `&report_ids=${reportIds.join(',')}` : ''),
  )
  return res.work_description || ''
}

// Offerten-Auswahl im Erstellen-Dialog — generiert (Feldbeschreibungen im Modell).
export type CoverageQuote = Antwort<'AbdeckungOfferte'>
export type InvoiceQuoteCoverage = Antwort<'OffertenAbdeckung'>

/**
 * Offerten-Auswahl für den Rechnung-Erstellen-Dialog. Nicht blockierend gedacht:
 * schlägt der Aufruf fehl, zeigt der Dialog keine Auswahl und die Rechnung entsteht
 * wie bisher über die automatische Auflösung.
 */
export async function getInvoiceQuoteCoverage(
  projectId: string, additional = false,
): Promise<InvoiceQuoteCoverage> {
  return apiFetch<InvoiceQuoteCoverage>(
    `/pwa/admin/invoices/quote-coverage?project_id=${encodeURIComponent(projectId)}`
    + (additional ? '&additional=true' : ''),
  )
}

/** Ein verrechenbarer Rapport in der Auswahl des Erstellen-Dialogs (generiert). */
export type BillableReport = Antwort<'VerrechenbarerRapport'>

export async function getBillableReports(projectId: string, additional = false): Promise<BillableReport[]> {
  const res = await apiFetch<Antwort<'VerrechenbareRapporte'>>(
    `/pwa/admin/invoices/billable-reports?project_id=${encodeURIComponent(projectId)}`
    + (additional ? '&additional=true' : ''),
  )
  return res.reports || []
}

/** Eine Anzahlungsrechnung, die eine neue Rechnung abziehen kann (WW-47, generiert). */
export type OpenAnzahlung = Antwort<'OffeneAnzahlung'>

export async function getAnzahlungen(projectId: string, additional = false): Promise<OpenAnzahlung[]> {
  const res = await apiFetch<Antwort<'OffeneAnzahlungen'>>(
    `/pwa/admin/invoices/anzahlungen?project_id=${encodeURIComponent(projectId)}`
    + (additional ? '&additional=true' : ''),
  )
  return res.anzahlungen || []
}

/** `ccRecipients`: Mitleser im selben Mail (WW-78). Leere Zeilen aus dem Dialog
 *  fallen weg; ohne CC bleibt der Body wie bisher. */
export async function sendInvoice(
  invoiceId: number, recipientEmail: string, ccRecipients: string[] = [],
): Promise<void> {
  const cc = ccRecipients.map(a => a.trim()).filter(Boolean)
  await apiFetch('/pwa/admin/invoices/send', {
    method: 'POST',
    body: JSON.stringify({
      invoice_id: invoiceId, recipient_email: recipientEmail,
      ...(cc.length ? { cc_recipients: cc } : {}),
    }),
  })
}

/** `paidAt` ist das Zahlungsdatum (ISO), nicht der Zeitpunkt des Klicks.
 *  `paidAmount` = eingegangener Betrag, wenn weniger als die Rechnung (Skonto);
 *  null/weggelassen = voll bezahlt. */
export async function markInvoicePaid(id: number, paidAt: string, paidAmount: number | null = null): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${id}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify({ paid_at: paidAt, paid_amount: paidAmount }),
  })
}

export async function unmarkInvoicePaid(id: number): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${id}/unmark-paid`, { method: 'POST' })
}

/** Postversand: die Rechnung gilt als gesendet, ohne dass eine Mail rausgeht. */
export async function markInvoiceSentByPost(id: number, sentDate: string): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${id}/mark-sent`, {
    method: 'POST',
    body: JSON.stringify({ sent_date: sentDate }),
  })
}

/** Archivieren macht die verrechneten Rapporte wieder verrechenbar. */
export async function archiveInvoice(id: number): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${id}/archive`, { method: 'POST' })
}

// ─── bexio-Badge (docs/specs/bexio-anbindung.md §8.2) ───────────────────────

/** Zustand in bexio — generiert aus `BexioBadge` (Zustände als Literal im Modell). */
export type BexioBadge = Antwort<'BexioBadge'>
export type BexioBadgeState = BexioBadge['state']

/**
 * Der Betrieb bestätigt das Storno einer archivierten Rechnung in bexio (§6.7).
 * Ausgeführt wird es im nächsten Lauf (wenige Minuten) — die Route spricht nie
 * selbst mit bexio.
 */
export async function cancelInBexio(id: number): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${id}/bexio-cancel`, { method: 'POST' })
}

/** Zustand in bexio für die sichtbaren Rechnungen — eine Anfrage für die ganze Liste. */
export async function getBexioStatus(ids: number[]): Promise<Record<string, BexioBadge>> {
  if (ids.length === 0) return {}
  const res = await apiFetch<Antwort<'BexioStatus'>>(
    `/pwa/admin/invoices/bexio-status?ids=${ids.slice(0, 500).join(',')}`,
  )
  return res.states ?? {}
}

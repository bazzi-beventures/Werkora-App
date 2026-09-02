// Offert-Vorlagen: Positions-Vorlagen (Montage/Sonderpositionen), Skonto-Vorgabe
// und Standard-Anhänge (Modul `quotes`).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.
//
// Die reinen Textbausteine (Bemerkungen, Disclaimer, Mail-Texte) laufen NICHT
// hierüber, sondern über `useTenantText` — sie hängen an der Backend-Factory
// make_tenant_text_endpoints und haben denselben Vertrag für alle Bausteine.

import { apiFetch, apiFormFetch } from '../client'
import type { TravelCostTable } from '../../admin/utils/quotePricing'

export type SpecialMode = 'pauschal' | 'stunden'

// Montage-Vorlage: Pauschalbetrag für eine Montageleistung.
export interface InstallationTpl {
  id: string
  label: string
  default_fee: number
  sort_order: number
  notes: string | null
}

// Sonderposition (Demontage/Entsorgung): Pauschale oder Stundenansatz.
export interface SpecialTpl {
  id: string
  label: string
  pricing_mode: SpecialMode
  default_fee: number
  default_hours: number | null
  sort_order: number
  notes: string | null
}

// Standard-Anhänge: mandantenweite Dokumente (AGB, Firmenprospekt …), die beim
// Offerten-Versand als Mail-Anhang wählbar sind (Feature 'prospekt_mit_offerte').
export interface QuoteAttachmentTpl {
  id: string
  filename: string
  mime_type: string | null
  file_size: number | null
  created_at: string
}

export type PositionTemplateKind = 'installation' | 'special'

export interface PositionTemplateInput {
  label: string
  default_fee: number
  notes: string | null
  // Nur für 'special' — bei 'installation' lässt der Aufrufer beide weg.
  pricing_mode?: SpecialMode
  default_hours?: number | null
}

// Zwei Endpoints, ein Vertrag: die Vorlagenart entscheidet nur über den Pfad.
function basePath(kind: PositionTemplateKind): string {
  return kind === 'installation'
    ? '/pwa/admin/installation-templates'
    : '/pwa/admin/special-position-templates'
}

export async function getQuotePositionTemplates(): Promise<{
  installation: InstallationTpl[]
  special: SpecialTpl[]
}> {
  return apiFetch<{ installation: InstallationTpl[]; special: SpecialTpl[] }>(
    '/pwa/admin/quote-position-templates',
  )
}

/** Ohne `id` anlegen, mit `id` ändern. */
export async function savePositionTemplate(
  kind: PositionTemplateKind, input: PositionTemplateInput, id?: string,
): Promise<void> {
  await apiFetch(id ? `${basePath(kind)}/${id}` : basePath(kind), {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(input),
  })
}

export async function deletePositionTemplate(kind: PositionTemplateKind, id: string): Promise<void> {
  await apiFetch(`${basePath(kind)}/${id}`, { method: 'DELETE' })
}

// Startwerte für die Skonto-Felder einer neuen Offerte. `pct: null` = keine Vorgabe.
export interface QuoteSkontoDefaults {
  pct: number | null
  days: number | null
}

export async function getQuoteSkontoDefaults(): Promise<QuoteSkontoDefaults> {
  return apiFetch<QuoteSkontoDefaults>('/pwa/admin/quote-skonto-defaults')
}

/**
 * Die Antwort ist die normalisierte Wahrheit (ein unmöglicher Satz wie 150 %
 * kommt als `null` zurück) — der Aufrufer schreibt sie zurück ins Formular,
 * sonst zeigt es einen Wert, den der Server verworfen hat.
 */
export async function saveQuoteSkontoDefaults(input: QuoteSkontoDefaults): Promise<QuoteSkontoDefaults> {
  return apiFetch<QuoteSkontoDefaults>('/pwa/admin/quote-skonto-defaults', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

// Gültigkeitsdauer der Offerte in Monaten ab Ausstellungsdatum. Ein Wert für drei
// Dinge: das "Gültig bis" auf dem PDF, die Laufzeit des Annehmen-/Ablehnen-Links in
// der Offerten-Mail und die Frist im Standard-Bemerkungstext. `is_default` = der
// Mandant hat nichts gesetzt, `months` ist der System-Wert.
export interface QuoteValidity {
  months: number
  is_default: boolean
  min: number
  max: number
  default: number
}

export async function getQuoteValidity(): Promise<QuoteValidity> {
  return apiFetch<QuoteValidity>('/pwa/admin/quote-validity')
}

/** `months: null` setzt zurück auf den System-Default. Die Antwort ist der wirksame
 *  Stand (der Server klemmt auf min/max) — zurückschreiben statt raten. */
export async function saveQuoteValidity(months: number | null): Promise<QuoteValidity> {
  return apiFetch<QuoteValidity>('/pwa/admin/quote-validity', {
    method: 'PATCH',
    body: JSON.stringify({ months }),
  })
}

export async function listQuoteAttachmentTemplates(): Promise<QuoteAttachmentTpl[]> {
  const res = await apiFetch<{ attachments: QuoteAttachmentTpl[] }>('/pwa/admin/quote-attachment-templates')
  return res.attachments ?? []
}

export async function uploadQuoteAttachmentTemplate(file: File): Promise<void> {
  const fd = new FormData()
  fd.append('file', file)
  await apiFormFetch('/pwa/admin/quote-attachment-templates', fd)
}

export async function deleteQuoteAttachmentTemplate(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/quote-attachment-templates/${id}`, { method: 'DELETE' })
}

// ─── Was das Offert-Formular beim Öffnen liest ──────────────
// Schreiben laeuft ueber die Vorlagen-Panels oben; hier stehen nur die
// Lese-Aufrufe der Maske (Charge H2).

export async function listInstallationTemplates(): Promise<InstallationTpl[]> {
  return apiFetch<InstallationTpl[]>('/pwa/admin/installation-templates')
}

export async function listSpecialPositionTemplates(): Promise<SpecialTpl[]> {
  return apiFetch<SpecialTpl[]>('/pwa/admin/special-position-templates')
}

/** Standard-Bemerkungen des Mandanten. Gepflegt wird der Text ueber `useTenantText`
 *  in den Offert-Vorlagen — das Formular liest ihn nur. */
export async function getQuoteStandardNotes(): Promise<{ notes: string }> {
  return apiFetch<{ notes: string }>('/pwa/admin/quote-standard-notes')
}

/** Wirksame Fahrspesen-Staffelung (Mandanten-Override, sonst System-Default).
 *  Kommt vom Backend, damit die Vorschau im Formular nicht von der verbindlichen
 *  Berechnung abweicht — die Auswertung steht in utils/quotePricing.computeTravelCost. */
export async function getQuoteTravelCostTable(): Promise<{ travel_cost_table: TravelCostTable }> {
  return apiFetch<{ travel_cost_table: TravelCostTable }>('/pwa/admin/quote-travel-cost-table')
}

// Lieferantenrechnungen (Modul `kreditoren`) — docs/specs/lieferantenrechnung-bexio.md.
//
// Erfassen (Upload), lesen lassen (QR-Zahlteil + OCR im Hintergrund), prüfen,
// kontieren, visieren. Alles unter `/pwa/admin/kreditoren`, Admin-Rolle und Modul.
// Fehler kommen als `{detail: string}` mit deutschem Klartext — `apiFetch` legt
// ihn in `ApiError.message`, die Oberfläche zeigt ihn unverändert.
//
// Die Datei des Belegs kommt über `/datei` mit Cookie-Auth; für die Vorschau im
// `<iframe>` wird sie als Blob geholt (das Backend setzt `X-Frame-Options: DENY`,
// eine direkte URL im Rahmen bliebe grau — siehe apiTextFetch in client.ts).

import { apiBlobFetch, apiFetch, apiFormFetch } from './client'

export type KreditorStatus =
  | 'neu' | 'zu_pruefen' | 'zu_visieren' | 'visiert' | 'uebergeben'
  | 'gebucht' | 'bezahlt' | 'abgelehnt' | 'verworfen'

export type KreditorBucket = 'projekt' | 'lager' | 'gemeinkosten'

export type KreditorAnsicht = 'zu_pruefen' | 'zu_visieren' | 'visiert' | 'alle'

/** Ein Projekt in der schmalen Form — mehr zeigt die Zuordnung nie. */
export interface CompactProject {
  project_id: string
  number: string
  name: string
  customer: string
  locality: string
  status?: string
}

export interface KreditorZaehler {
  zu_pruefen: number
  zu_visieren: number
  /** Davon die, bei denen das angemeldete Konto Projektleiter ist. */
  zu_visieren_meine: number
  /** Zahl am Navigationspunkt: zu prüfen + meine zu visieren. */
  badge: number
}

export interface KreditorSummary {
  id: string
  status: KreditorStatus
  source: 'upload' | 'foto' | 'mail' | 'bexio'
  supplier_id: string | null
  supplier_name: string | null
  bill_number: string | null
  bill_date: string | null
  due_date: string | null
  currency: string
  gross_total: number | null
  is_credit_note: boolean
  erfasst_am: string
  erfasst_von_name: string | null
  lese_status: 'laeuft' | 'gelesen' | 'fehler'
  /** 'kontingent' | 'ocr_fehler' | 'unlesbar' */
  lese_fehler: string | null
  projekte: CompactProject[]
  sperre: boolean
  iban_status: 'bekannt' | 'neu' | 'bestaetigt' | null
  visiert_von_name: string | null
  visiert_am: string | null
  skonto_pct: number | null
  skonto_until: string | null
  /** Das angemeldete Konto ist Projektleiter eines Projekts dieser Rechnung. */
  meine: boolean
}

export interface KreditorLine {
  id?: string
  pos: number
  text: string | null
  quantity: number | null
  net_amount: number
  vat_rate: number | null
  account_no: string | null
  project_id: string | null
  project: CompactProject | null
  bucket: KreditorBucket
}

export interface KreditorHinweis {
  code: string
  stufe: 'sperre' | 'warnung' | 'info'
  text: string
  /** Bei einer Dublette: die schon erfasste Rechnung. */
  bill_id?: string
}

export interface KreditorSupplier {
  id: string
  name: string
  uid: string | null
  street: string | null
  zip: string | null
  city: string | null
  default_account: string | null
  default_bucket: KreditorBucket | null
}

export interface KreditorPayment {
  iban: string
  reference_type: string | null
  reference: string | null
  amount: number | null
  currency: string | null
  creditor_name: string | null
}

export interface KreditorSupplierNeu {
  name: string
  uid: string | null
  street: string | null
  zip: string | null
  city: string | null
}

export interface KreditorAktionen {
  bearbeiten: boolean
  erneut_lesen: boolean
  zur_visierung: boolean
  visieren: boolean
  visum_zuruecknehmen: boolean
  ablehnen: boolean
  verwerfen: boolean
}

export interface KreditorDetail extends KreditorSummary {
  supplier: KreditorSupplier | null
  supplier_name_beleg: string | null
  supplier_uid_beleg: string | null
  net_total: number | null
  vat_total: number | null
  payment: KreditorPayment | null
  payment_source: 'qr' | 'manuell' | 'keine'
  file_name: string | null
  mime_type: string | null
  pages: number | null
  lines: KreditorLine[]
  vorschlag: {
    supplier_id: string | null
    supplier_quelle: 'uid' | 'iban' | 'name' | null
    supplier_neu: KreditorSupplierNeu | null
    projekt_kandidaten: CompactProject[]
    lieferscheine: string[]
  }
  hinweise: KreditorHinweis[]
  aktionen: KreditorAktionen
  /** Warum «Visieren» gesperrt ist — Text für neben dem Knopf. */
  visum_block: string | null
  iban_bestaetigung_noetig: boolean
  abgelehnt_grund: string | null
  konten: { nr: string; name: string }[]
  mwst_saetze: number[]
}

export interface KreditorLinePatch {
  text?: string | null
  quantity?: number | null
  net_amount: number
  vat_rate?: number | null
  account_no: string
  project_id?: string | null
  bucket: KreditorBucket
}

export interface KreditorPatch {
  supplier_id?: string | null
  bill_number?: string | null
  bill_date?: string | null
  due_date?: string | null
  currency?: string
  net_total?: number | null
  vat_total?: number | null
  gross_total?: number | null
  skonto_pct?: number | null
  skonto_until?: string | null
  is_credit_note?: boolean
  /** Nur von Hand und nur, wenn die Zahlung nicht aus dem QR-Zahlteil stammt. */
  payment?: { iban: string; reference?: string | null } | null
  /** Immer die vollständige Liste — der Server ersetzt alle Positionen. */
  lines?: KreditorLinePatch[]
}

export interface KreditorUploadFehler {
  datei: string
  grund: string
  /** Dublette: die schon erfasste Rechnung. */
  bill_id?: string
}

/** Kosten aus visierten Lieferantenrechnungen am Projekt (Nachkalkulation). */
export interface KreditorEinkauf {
  rechnungen: number
  /** Noch nicht visierte Rechnungen am Projekt — zählen noch nicht. */
  offen: number
  material: number | null
  fremdleistung: number | null
  uebrige: number | null
  total: number | null
}

const BASE = '/pwa/admin/kreditoren'

export interface KreditorListeFilter {
  q?: string
  von?: string
  bis?: string
}

export async function listKreditoren(
  ansicht: KreditorAnsicht, filter: KreditorListeFilter = {},
): Promise<{ bills: KreditorSummary[]; zaehler: KreditorZaehler }> {
  const params = new URLSearchParams({ ansicht })
  if (filter.q?.trim()) params.set('q', filter.q.trim())
  if (filter.von) params.set('von', filter.von)
  if (filter.bis) params.set('bis', filter.bis)
  return apiFetch(`${BASE}?${params.toString()}`)
}

export async function getKreditorenZaehler(): Promise<KreditorZaehler> {
  return apiFetch<KreditorZaehler>(`${BASE}/zaehler`)
}

export async function uploadKreditoren(
  files: File[],
): Promise<{ bills: KreditorSummary[]; fehler: KreditorUploadFehler[] }> {
  const form = new FormData()
  for (const f of files) form.append('files', f, f.name)
  return apiFormFetch(BASE, form)
}

/** Projekte für die Kontierung — alle Status, auch abgeschlossene. */
export async function searchKreditorenProjekte(q: string): Promise<CompactProject[]> {
  const res = await apiFetch<{ projects: CompactProject[] }>(
    `${BASE}/projekte?q=${encodeURIComponent(q)}`,
  )
  return res.projects ?? []
}

/** Nur Kennzahlen-Rollen; sonst 403 (der Aufrufer lässt den Block dann weg). */
export async function getProjektEinkauf(projectId: string): Promise<KreditorEinkauf> {
  return apiFetch<KreditorEinkauf>(`${BASE}/projekt/${encodeURIComponent(projectId)}/einkauf`)
}

export async function getKreditor(id: string): Promise<KreditorDetail> {
  return apiFetch<KreditorDetail>(`${BASE}/${id}`)
}

/** Der Beleg als Blob (PDF oder Bild) — für Vorschau und «Beleg öffnen». */
export async function holeKreditorDatei(id: string): Promise<Blob> {
  const { blob } = await apiBlobFetch(`${BASE}/${id}/datei`)
  return blob
}

export async function patchKreditor(id: string, patch: KreditorPatch): Promise<KreditorDetail> {
  return apiFetch<KreditorDetail>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function kreditorErneutLesen(id: string): Promise<KreditorDetail> {
  return apiFetch<KreditorDetail>(`${BASE}/${id}/lesen`, { method: 'POST' })
}

export async function kreditorZurVisierung(id: string): Promise<KreditorDetail> {
  return apiFetch<KreditorDetail>(`${BASE}/${id}/zur-visierung`, { method: 'POST' })
}

export async function kreditorVisieren(
  id: string, ibanTelefonischBestaetigt = false,
): Promise<KreditorDetail> {
  return apiFetch<KreditorDetail>(`${BASE}/${id}/visieren`, {
    method: 'POST',
    body: JSON.stringify(ibanTelefonischBestaetigt ? { iban_telefonisch_bestaetigt: true } : {}),
  })
}

export async function kreditorVisumZuruecknehmen(id: string): Promise<KreditorDetail> {
  return apiFetch<KreditorDetail>(`${BASE}/${id}/visum-zuruecknehmen`, { method: 'POST' })
}

export async function kreditorAblehnen(id: string, grund: string): Promise<KreditorDetail> {
  return apiFetch<KreditorDetail>(`${BASE}/${id}/ablehnen`, {
    method: 'POST',
    body: JSON.stringify({ grund }),
  })
}

export async function kreditorVerwerfen(id: string): Promise<KreditorDetail> {
  return apiFetch<KreditorDetail>(`${BASE}/${id}/verwerfen`, { method: 'POST' })
}

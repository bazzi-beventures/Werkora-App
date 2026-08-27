// Projekte: Stammdaten, Liste, Abschluss, Status, Beschaffungsschritt, Kommentare
// und die Termin-Legacy-Felder.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.
//
// `Project` war fünfmal definiert (Spec Charge H, §2 Schritt 4): hier schlank für
// Dropdowns, im ProjectsScreen vollständig für die Projektmaske, im QuotesScreen
// mit `distance_km`, dazu die Monteur-Variante. Das ist jetzt EIN Typ — die
// vollständige Form, denn sie beschreibt, was der Endpoint liefert. Wer nur zwei
// Felder braucht, nimmt sich zwei; wer mehr erwartet als da ist, fällt jetzt auf.
// (Die Monteur-PWA behält ihre eigene Fassung bis Charge H5.)

import { apiFetch, apiBlobFetch, apiFormFetch } from '../client'
import {
  deleteProjectFile as deleteFile, listProjectFiles as listFiles,
  renameProjectFile as renameFile, uploadProjectFile as uploadFile,
} from '../projectFiles'
import type { UploadProjectFileResult } from '../projectFiles'
import type {
  EmbeddedCustomer, Kontakt, ProjectComment, ProjectFile, ProjectKind,
} from '../../shared/projectDetail/types'

// Projekt-Art, Kontakte und Kunden-Embed sind in beiden Sichten dieselben Zeilen
// (Charge H5) — sie stehen in shared/projectDetail/types und werden hier nur
// weitergereicht, damit `from '../api/admin'` weiter alles findet.
export type { EmbeddedCustomer, Kontakt, ProjectKind }
export type { UploadProjectFileResult }

// Lebenszyklus des Projekts. Die Labels/Badges dazu stehen in
// admin/constants/statuses.ts — hier nur der Vertrag.
export type ProjectStatus = 'offen' | 'abgeschlossen' | 'archiviert'

// Eigentümer des Objekts — eigene Rolle, getrennt vom Auftraggeber (customer),
// Rechnungsempfänger (customer.billing_*) und Baustellenkontakt (kontakte).
export interface Eigentuemer {
  name: string
  adresse: string
  telefon: string
  email: string
}

export interface DisposalDetails {
  material: string
  menge: string
  entsorger: string
  nachweis_url: string
  bemerkung: string
}

export interface ProjectInvoiceSummary {
  invoice_number: string
  total_amount: number
  status: string
  created_at: string
  pdf_url: string | null
}

export interface ProjectQuoteSummary {
  quote_number: string
  total_amount: number
  status: string
  created_at: string
  pdf_url: string | null
}

export interface Project {
  id: string
  // Projektnummer — eindeutig, anders als der Name. Steht in Auswahllisten hinter
  // dem Namen, damit zwei gleichnamige Projekte unterscheidbar bleiben.
  project_id_text: string | null
  name: string
  kind: ProjectKind
  customer_id: string | null
  customer: EmbeddedCustomer | null
  object_name: string | null
  object_address: string | null
  // Koordinaten der Baustelle (WGS84) fuer die Auftragskarte der Einsatzplanung.
  // null = nicht geocodiert: keine Adresse, kein Treffer, oder ausserhalb der
  // Schweiz. Die Karte zaehlt solche Projekte im Teil-Zustand mit, statt sie
  // stillschweigend zu unterschlagen.
  object_lat?: number | null
  object_lon?: number | null
  // Abweichende Rechnungsadresse NUR für dieses Projekt — hat auf Offerte/Rechnung
  // Vorrang vor customer.billing_*/name/address, ändert den Kundenstamm nicht.
  billing_name?: string | null
  billing_address?: string | null
  art_der_arbeit: string[] | null
  projektleiter_id: string | null
  monteur_ids: string[]
  kontakte: Kontakt[]
  eigentuemer: Eigentuemer | null
  disposal_details: DisposalDetails | null
  is_warranty?: boolean
  wartung_interval_months?: number | null
  wartung_last_at?: string | null
  wartung_next_due_at?: string | null
  status: ProjectStatus
  // Beschaffungs-Arbeitsschritt (Feature `beschaffungsstatus`) — NICHT der Lebenszyklus
  // oben, sondern "wo stehe ich im Beschaffungsablauf". null = nichts bestellt.
  workflow_status?: string | null
  workflow_status_at?: string | null
  workflow_status_source?: string | null
  is_closed: boolean
  created_at: string
  created_by: string | null
  created_by_id: string | null
  bemerkung: string | null
  geruestfach: number | null
  start_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
  // Fahrdistanz zum Objekt (projects.distance_km) — füllt die Fahrspesen im
  // Offert-Formular vor.
  distance_km?: number | null
  invoice?: ProjectInvoiceSummary | null
  quote?: ProjectQuoteSummary | null
}

export interface ProjectsListResponse {
  rows: Project[]
  total: number
  // Zähler für die Filter-Reiter — sie gelten für den ganzen Bestand, nicht für
  // die aktuelle Seite.
  open_count: number
  closed_count: number
  archived_count: number
  page: number
  page_size: number
}

/**
 * Sonderwert der Mehrfachfilter: "keiner". `invoiceStatus: ['none']` heisst
 * "Projekte ohne Rechnung" — zusammen mit `lifecycle: ['abgeschlossen']` ist das
 * die Frage "fertig, aber noch nicht verrechnet".
 */
export const FILTER_NONE = 'none'

export interface ProjectsListQuery {
  // 'open' (Default der Maske), 'all' (offen + abgeschlossen) oder 'archived'.
  // Bleibt gültig; `lifecycle` hat Vorrang, wo beides gesetzt ist.
  status: string
  sort: string
  dir: 'asc' | 'desc'
  page: number
  pageSize: number
  search?: string
  projektleiterId?: string
  // Spaltenfilter (Spec §5). Leere Arrays und leere Strings werden weggelassen —
  // ein Filter ohne Auswahl ist kein Filter.
  lifecycle?: string[]
  projektleiterIds?: string[]
  quoteStatus?: string[]
  invoiceStatus?: string[]
  beschaffung?: string[]
  locality?: string[]
  /** 'YYYY-MM-DD'; `createdTo` schliesst den genannten Tag ein. */
  createdFrom?: string
  createdTo?: string
  /** "enthält" über alle Adressfelder bzw. alle Telefonnummern des Projekts. */
  address?: string
  phone?: string
}

export interface ProjectLocality {
  locality: string
  /** Anzahl Projekte — steht in der Auswahlliste hinter dem Ort. */
  count: number
}

export async function listProjects(q: ProjectsListQuery): Promise<ProjectsListResponse> {
  const params = new URLSearchParams({
    status: q.status,
    sort: q.sort,
    dir: q.dir,
    page: String(q.page),
    page_size: String(q.pageSize),
  })
  if (q.search) params.set('search', q.search)
  if (q.projektleiterId) params.set('projektleiter_id', q.projektleiterId)
  // Mehrfachauswahlen gehen als CSV raus — so liest sie der Endpoint (§5).
  const csv: [string, string[] | undefined][] = [
    ['lifecycle', q.lifecycle],
    ['projektleiter_ids', q.projektleiterIds],
    ['quote_status', q.quoteStatus],
    ['invoice_status', q.invoiceStatus],
    ['beschaffung', q.beschaffung],
    ['locality', q.locality],
  ]
  for (const [key, values] of csv) {
    if (values && values.length > 0) params.set(key, values.join(','))
  }
  if (q.createdFrom) params.set('created_from', q.createdFrom)
  if (q.createdTo) params.set('created_to', q.createdTo)
  if (q.address) params.set('address', q.address)
  if (q.phone) params.set('phone', q.phone)
  return apiFetch<ProjectsListResponse>(`/pwa/admin/projects/list?${params.toString()}`)
}

/**
 * Ortschaften, die im Bestand vorkommen, mit Trefferzahl — Wertevorrat des
 * Ortschafts-Filters. Bewusst getrennt von `listProjects`, damit die Aggregation
 * nicht an jedem Tastendruck in der Suche hängt (serverseitig 5 Minuten gecacht).
 */
export async function listProjectLocalities(): Promise<ProjectLocality[]> {
  return apiFetch<ProjectLocality[]>('/pwa/admin/projects/localities')
}

/** Ungefilterte Liste für Auswahlfelder; die Tabelle nutzt `listProjects`. */
export async function getAdminProjects(): Promise<Project[]> {
  return apiFetch<Project[]>('/pwa/admin/projects')
}

export async function getProject(id: string): Promise<Project> {
  return apiFetch<Project>(`/pwa/admin/projects/${id}`)
}

export async function upsertProject(data: Partial<Project> & { id?: string }): Promise<Project> {
  const method = data.id ? 'PATCH' : 'POST'
  const url = data.id ? `/pwa/admin/projects/${data.id}` : '/pwa/admin/projects'
  return apiFetch<Project>(url, { method, body: JSON.stringify(data) })
}

/**
 * Speichert die Projektmaske: ohne `id` anlegen (POST), mit `id` aendern (PATCH).
 *
 * Anders als `upsertProject` gibt diese Funktion die Serverantwort unveraendert
 * zurueck — der POST liefert die neu angelegte Zeile in `project`, und genau die
 * braucht die Maske, um danach in das frische Projekt zu springen. Die
 * Terminfelder gehoeren NICHT in die Nutzlast: Termine laufen ueber die
 * appointment-Endpunkte, der Server spiegelt daraus den Ersttermin auf projects.
 */
export async function saveProjectForm(
  payload: Record<string, unknown>, id?: string,
): Promise<{ project?: Project | null } | null> {
  return apiFetch<{ project?: Project | null } | null>(
    id ? `/pwa/admin/projects/${id}` : '/pwa/admin/projects',
    { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
  )
}

/** Macht einen Abschluss rueckgaengig — das Projekt ist danach wieder offen. */
export async function reopenProject(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/projects/${id}/reopen`, { method: 'POST' })
}

export async function closeProject(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/projects/${id}/close`, { method: 'POST' })
}

/**
 * Lebenszyklus-Status ('offen' | 'abgeschlossen' | …) — nicht zu verwechseln mit
 * dem Beschaffungs-Arbeitsschritt unten. Eigener Endpoint statt `upsertProject`,
 * weil das ein Ein-Klick-Vorgang ist.
 */
export async function setProjectStatus(id: string, status: string): Promise<void> {
  await apiFetch(`/pwa/admin/projects/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

/**
 * Setzt den Beschaffungs-Arbeitsschritt (Feature `beschaffungsstatus`).
 * `null` leert ihn (= kein Beschaffungsvorgang). Eigener Endpoint und nicht
 * `upsertProject`: das ist ein Ein-Klick-Vorgang aus dem Dropdown, der nicht das ganze
 * Projektformular mitschicken soll.
 */
export async function setProjectBeschaffung(
  id: string,
  status: string | null,
): Promise<{ project: { workflow_status: string | null; workflow_status_at: string | null } }> {
  return apiFetch<{ project: { workflow_status: string | null; workflow_status_at: string | null } }>(
    `/pwa/admin/projects/${id}/beschaffung`,
    { method: 'PATCH', body: JSON.stringify({ status }) },
  )
}

export async function updateProjectSchedule(
  id: string,
  start_date: string | null,
  end_date: string | null,
  start_time?: string | null,
  end_time?: string | null,
): Promise<void> {
  await apiFetch(`/pwa/admin/projects/${id}/schedule`, {
    method: 'PATCH',
    body: JSON.stringify({
      start_date,
      end_date,
      start_time: start_time ?? null,
      end_time: end_time ?? null,
    }),
  })
}

/**
 * Planbare Projekte für die Einsatzplanung: server-seitig gefiltert und ohne die
 * Offerten-/Rechnungs-Embeds. Vorher holte der Kalender `/admin/projects` — alle
 * je angelegten Projekte samt beider Beleg-Tabellen, nur damit die Zeile hier
 * gleich wieder wegfiel.
 */
export async function getScheduleProjects(): Promise<Project[]> {
  return apiFetch<Project[]>('/pwa/admin/projects/schedule')
}

/**
 * Wochenplan als PDF. `staffIds` nur setzen, wenn der Monteure-Filter aktiv ist —
 * ohne den Parameter nimmt das Backend alle Monteure mit Einsatz in dieser Woche.
 */
export async function downloadSchedulePdf(
  weekStartIso: string, staffIds?: string[] | null,
): Promise<{ blob: Blob; filename: string }> {
  const staffParam = staffIds == null
    ? ''
    : `&staff_ids=${encodeURIComponent(staffIds.join(','))}`
  const { blob, filename } = await apiBlobFetch(
    `/pwa/admin/projects/schedule.pdf?week_start=${weekStartIso}${staffParam}`,
  )
  return { blob, filename }
}

// ─── Kommentare am Projekt ──────────────────────────────────
// Kurze Notizen im Projekt-Detail; Monteure schreiben sie über die PWA mit. Nicht
// zu verwechseln mit den Kunden-Kommentaren in customers.ts.

export type { ProjectComment } from '../../shared/projectDetail/types'

export async function listProjectComments(projectId: string): Promise<ProjectComment[]> {
  return apiFetch<ProjectComment[]>(`/pwa/admin/projects/${projectId}/comments`)
}

export async function addProjectComment(projectId: string, text: string): Promise<void> {
  await apiFetch(`/pwa/admin/projects/${projectId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

/** Serverseitig nur innerhalb der 10-Minuten-Frist erlaubt (die Maske blendet es danach aus). */
export async function updateProjectComment(
  projectId: string, commentId: string, text: string,
): Promise<void> {
  await apiFetch(`/pwa/admin/projects/${projectId}/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ text }),
  })
}

export async function deleteProjectComment(projectId: string, commentId: string): Promise<void> {
  await apiFetch(`/pwa/admin/projects/${projectId}/comments/${commentId}`, { method: 'DELETE' })
}

// ─── Bestellfreigaben ───────────────────────────────────────
// Ein Dokument (Bestellung/Angebot) geht zur Freigabe an einen Vorgesetzten; der
// entscheidet per Mail-Link oder im Dashboard. Die Zeilen selbst kommen mit
// `ProjectApproval` aus projectDetail/types.

export async function listProjectApprovals<T>(projectId: string): Promise<T[]> {
  return apiFetch<T[]>(`/pwa/admin/projects/${projectId}/approvals`)
}

/** Titel, Freigeber und das Dokument gehen als multipart raus (die Datei ist Pflicht). */
export async function createProjectApproval(
  projectId: string, title: string, approverUserId: string, file: File,
): Promise<void> {
  const form = new FormData()
  form.append('title', title)
  form.append('approver_user_id', approverUserId)
  form.append('file', file)
  await apiFormFetch(`/pwa/admin/projects/${projectId}/approvals`, form)
}

/** `note` ist der Ablehnungsgrund; beim Genehmigen bleibt er leer. */
export async function decideProjectApproval(
  approvalId: string, decision: 'approve' | 'reject', note?: string | null,
): Promise<void> {
  await apiFetch(`/pwa/admin/approvals/${approvalId}/${decision}`, {
    method: 'POST',
    body: JSON.stringify({ note: note ?? null }),
  })
}

/** Nur für noch pendente Freigaben gedacht — entschiedene bleiben als Beleg stehen. */
export async function deleteProjectApproval(approvalId: string): Promise<void> {
  await apiFetch(`/pwa/admin/approvals/${approvalId}`, { method: 'DELETE' })
}

// ─── Projekt-Dateien ────────────────────────────────────────
// Fotos, Pläne, Lieferantendokumente. Die Zeilen selbst tragen den Typ
// `ProjectFile` aus projectDetail/types.

// Die Verwaltungs-Sicht auf api/projectFiles: derselbe Endpoint-Satz wie in der
// Monteur-PWA, nur mit dem Präfix /pwa/admin davor (Charge H5).

export async function listProjectFiles(projectId: string): Promise<ProjectFile[]> {
  return listFiles('/pwa/admin', projectId)
}

export async function uploadProjectFile(
  projectId: string, file: File, category: string,
): Promise<UploadProjectFileResult> {
  return uploadFile('/pwa/admin', projectId, file, category)
}

export async function deleteProjectFile(projectId: string, fileId: string): Promise<void> {
  await deleteFile('/pwa/admin', projectId, fileId)
}

export async function renameProjectFile(
  projectId: string, fileId: string, filename: string,
): Promise<void> {
  await renameFile('/pwa/admin', projectId, fileId, filename)
}

// ─── Belege am Projekt ──────────────────────────────────────
// Kopfdaten-Listen für die Reiter Offerten/Rechnungen/Rapporte. Die Zeilentypen
// stehen in projectDetail/types — hier bleibt offen, wie viel die Maske davon
// braucht.

export async function listProjectQuotes<T>(projectId: string): Promise<T[]> {
  return apiFetch<T[]>(`/pwa/admin/projects/${projectId}/quotes`)
}

export async function listProjectInvoices<T>(projectId: string): Promise<T[]> {
  return apiFetch<T[]>(`/pwa/admin/projects/${projectId}/invoices`)
}

export async function listProjectReports<T>(projectId: string): Promise<T[]> {
  return apiFetch<T[]>(`/pwa/admin/projects/${projectId}/reports`)
}

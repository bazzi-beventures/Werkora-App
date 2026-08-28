import { apiFetch, apiBlobFetch, apiFormFetch, apiStreamFetch } from './client'

export interface DisambiguationOption {
  name: string
  art_nr: string
  manufacturer?: string
  category?: string
}

/**
 * Ein gleichnamiges Projekt zur Auswahl. Zwei Liegenschaften desselben Kunden
 * dürfen gleich heissen — dann muss der Monteur sagen, welche er meint. Die
 * Antwort ist die `project_id`, kein Satz: die Auswahl darf nirgends durch das
 * Sprachmodell laufen (es reimte sich sonst aus der genannten Adresse die
 * falsche Projektnummer zusammen und rapportierte auf die andere Liegenschaft).
 */
export interface ProjectChoiceOption {
  project_id: string
  name: string
  project_number: string
  object_name?: string
  object_address?: string
}

// Ein Hauptmaterial aus der Rapport-Zusammenfassung (vom LLM erkannt/aufgelöst).
export interface SummaryItem {
  name: string
  amount: number
  unit?: string
  art_nr?: string
}

/**
 * Maschinenlesbares Ergebnis einer Zeit-Aktion — für die Offline-Queue, die den
 * deutschen Antworttext nicht parsen soll. Siehe services/pwa_timekeeping.py.
 *   applied  — hat gewirkt                        → aus der Queue entfernen
 *   noop     — Zustand war schon so (Doppel-Tap)  → aus der Queue entfernen
 *   rejected — dauerhaft nicht anwendbar          → Queue anhalten, Korrekturantrag
 *   retry    — vorübergehender Fehler             → Queue anhalten, später erneut
 */
export type ZeitOutcome = 'applied' | 'noop' | 'rejected' | 'retry'

export interface ChatResponse {
  reply: string
  action_taken: string | null
  outcome?: ZeitOutcome
  transcription?: string
  report_id?: number | string
  // Der gespeicherte Rapport ist ein Teilrapport: der Chat überspringt dann den
  // Unterschriftsschritt (docs/specs/teilrapport.md §6.1).
  is_partial?: boolean
  correction_id?: string
  disambiguation?: DisambiguationOption[]
  project_choice?: ProjectChoiceOption[]
  pending_summary?: {
    project: string
    date: string
    staff: { name: string; hours: number }[]
    items: SummaryItem[]
    // Einbauort des Einsatzes (reports.einbauort). Nur bei Mandanten mit
    // Feature-Flag `material_standort` und nur, wenn der Monteur ihn genannt hat.
    einbauort?: string
    // Vorauswahl der Leistungsart-Chips (aus dem Projekt geerbt).
    art_der_arbeit?: string[]
    // Vorauswahl «Teilrapport» im Abschluss-Schritt: das Projekt hat bereits einen
    // freien Teilrapport (docs/specs/teilrapport.md §3.10). Fehlt beim Alt-Server →
    // «Unterschrift jetzt», die gewöhnliche Vorauswahl.
    preselect_partial?: boolean
  }
}

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'result'; result: ChatResponse }

/**
 * Streamt eine Chat-Nachricht. Yieldet pro Backend-SSE-Event:
 *   - { type: 'delta', text }       — Text-Chunk während der Bot tippt
 *   - { type: 'result', result }    — Terminal-Event mit pending_summary etc.
 *
 * Caller bekommt am Ende garantiert genau ein "result"-Event.
 *
 * `project`/`projectId` werden NUR mit der Startnachricht aus dem Projekt-Detail
 * mitgeschickt und binden den Rapport server-seitig an genau dieses Projekt. Ohne
 * die Angabe müsste der Server das Projekt bei jedem Turn aus dem Gesprächsverlauf
 * raten — und lag daneben, sobald der Monteur nur noch Stunden nachreichte.
 *
 * Massgeblich ist die **id**. Der Name allein reicht nicht: zwei Liegenschaften
 * desselben Kunden dürfen gleich heissen, und ein mehrdeutiger Name band gar nicht
 * — der Rapport startete ungebunden, und die Rückfrage nach der Projektnummer
 * beantwortete am Ende das Modell statt der Monteur. Der Name bleibt mitgeschickt,
 * damit ein alter Server ihn weiterhin auswertet.
 */
export async function* sendMessageStream(text: string, project?: string | null, projectId?: string | null): AsyncGenerator<ChatStreamEvent, void, void> {
  const body: Record<string, string> = { text }
  if (project) body.project = project
  if (projectId) body.project_id = projectId
  for await (const raw of apiStreamFetch('/pwa/chat/message', body)) {
    const t = raw.type
    if (t === 'delta' && typeof raw.text === 'string') {
      yield { type: 'delta', text: raw.text }
    } else if (t === 'result' && raw.result && typeof raw.result === 'object') {
      yield { type: 'result', result: raw.result as ChatResponse }
    }
  }
}

export async function sendVoice(blob: Blob): Promise<ChatResponse> {
  const form = new FormData()
  form.append('audio', blob, 'recording.webm')
  return apiFormFetch<ChatResponse>('/pwa/chat/voice', form)
}

export type ZeitAction =
  | 'clock_in' | 'clock_out'
  | 'start_break' | 'end_break'
  | 'query_vacation' | 'query_overtime'

export interface ZeitActionOptions {
  date?: string
  recorded_at?: string
  art_der_arbeit?: string
}

export async function zeitAction(action: ZeitAction, opts: ZeitActionOptions = {}): Promise<ChatResponse> {
  return apiFetch<ChatResponse>(`/pwa/zeit/${action}`, {
    method: 'POST',
    body: JSON.stringify(opts),
    // Stempel haben eine Offline-Queue: lieber nach 15s abbrechen und queuen,
    // als im Funkloch minutenlang im Spinner zu hängen.
    timeoutMs: 15_000,
  })
}

// Stempel-Status inkl. der zuletzt abgeschlossenen Session. Letztere dient dem
// Korrekturformular als Vorlage — ohne sie müsste der Monteur seine Zeiten aus
// dem Kopf eintippen, und genau das ist heute die Hürde beim Widerlegen eines
// automatischen Pausenabzugs (docs/specs/automatische-pause.md §3.5).
export interface ZeitStatus {
  status: 'active' | 'inactive' | 'on_break'
  clock_in: string | null
  since_minutes: number
  last_session?: {
    date: string
    clock_in: string | null
    clock_out: string | null
    break_minutes: number
    auto_break_minutes: number
  } | null
}

export async function getZeitStatus(): Promise<ZeitStatus> {
  return apiFetch<ZeitStatus>('/pwa/status', { method: 'GET' })
}

export interface CorrectionPayload {
  date: string
  clock_in: string
  clock_out: string
  break_minutes: number
  reason: string
}

export async function submitCorrectionRequest(payload: CorrectionPayload): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/pwa/zeit/correction-request', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Stand eines Korrekturantrags — die PWA pollt ihn nach dem Absenden.
export interface CorrectionStatus {
  status: string
  review_note: string
  session_date: string
}

export async function getCorrectionStatus(correctionId: string): Promise<CorrectionStatus> {
  return apiFetch<CorrectionStatus>(`/pwa/zeit/correction-request/${correctionId}`, {
    method: 'GET',
  })
}

export interface ConfirmExtras {
  // Vor dem Speichern im Chat gesammelte Zusatz-Positionen.
  kleinmaterial?: { amount_chf: number | null; count: number; scope: string } | null
  ersatzteile?: { art_nr: string; amount: number }[]
  // Angekreuzte Leistungsart (reports.art_der_arbeit). undefined = nichts gesagt,
  // dann bleibt die Vorbelegung aus dem Projekt stehen; [] heisst "keine".
  art_der_arbeit?: string[]
  // Teilrapport statt Rapport mit Unterschrift: gleiche Erfassung, nur ohne
  // Unterschriftsschritt — die eine Unterschrift kommt am Schluss auf dem
  // Gesamtrapport (docs/specs/teilrapport.md §3.2).
  is_partial?: boolean
}

export async function confirmReport(extras: ConfirmExtras = {}): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/pwa/chat/confirm', {
    method: 'POST',
    body: JSON.stringify({
      kleinmaterial: extras.kleinmaterial ?? null,
      ersatzteile: extras.ersatzteile ?? [],
      art_der_arbeit: extras.art_der_arbeit ?? null,
      is_partial: extras.is_partial ?? false,
    }),
  })
}

export async function cancelReport(): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/pwa/chat/cancel', { method: 'POST' })
}

export async function signReport(reportId: number, signatureBase64: string): Promise<void> {
  await apiFetch(`/pwa/chat/sign/${reportId}`, {
    method: 'POST',
    body: JSON.stringify({ signature_base64: signatureBase64 }),
  })
}

// `awaitSignature`: wurde der Rapport GERADE unterschrieben? Dann rennt der Client
// gegen den Hintergrund-Task, der die Unterschrift persistiert — der Server wartet
// bis zu zehn Sekunden auf sie, statt ein Dokument ohne die eben geleistete
// Unterschrift zu liefern. Für einen pendenten Rapport ist dieselbe Warteschleife
// sinnlos: sein PDF (der Zwischenstand) liegt bereits, und der Monteur sähe nur
// zehn Sekunden «PDF wird erstellt…».
export async function downloadRapportPdf(
  reportId: number,
  awaitSignature = true,
): Promise<{ blob: Blob; filename: string }> {
  return apiBlobFetch(`/pwa/chat/report/${reportId}/pdf?await_signature=${awaitSignature}`)
}

// Selbstkorrektur: eigenen Rapport löschen (falscher Auftrag, doppelt erfasst).
// Server erlaubt nur eigene, unsignierte und unverrechnete Rapporte — Stunden,
// Material und Fotos gehen mit, das Material wird ins Lager zurückgebucht.
export async function deleteOwnRapport(reportId: number): Promise<void> {
  await apiFetch(`/pwa/chat/report/${reportId}`, { method: 'DELETE' })
}

// Rapporte eines Projekts (Mitarbeiter-PWA, Projekt-Detail) — auch die der Kollegen,
// sonst schreibt der zweite Mann denselben Tag nochmals. `is_own` trägt die
// Selbstkorrektur: nur eigene Rapporte sind löschbar (der Server prüft dieselbe
// Regel nochmals).
export interface ProjectReport {
  id: number
  report_date: string
  description: string | null
  created_by: string | null
  signature_timestamp: string | null
  invoice_id: number | null
  // Hängt der Rapport an einer Rechnung, die der Kunde bereits hat (gesendet/
  // bezahlt)? Nur dann ist die Unterschrift endgültig weg. Die blosse Verknüpfung
  // sperrt sie nicht mehr — die Rechnungsaggregation nimmt auch unsignierte
  // Rapporte mit, und die waren danach nie mehr nachsignierbar.
  invoice_locked?: boolean
  created_at: string
  source: string | null
  is_own: boolean
  // Teilrapport/Sammelrapport (docs/specs/teilrapport.md). Alle vier optional:
  // ein Alt-Server ohne die Spalten liefert sie nicht, dann verhält sich die Liste
  // wie vor dem Feature.
  is_partial?: boolean
  is_aggregate?: boolean
  merged_into_report_id?: number | null
  dissolved_at?: string | null
  // Vom Projektleiter ohne Kundenunterschrift abgeschlossen (20260824d).
  pl_accepted_at?: string | null
}

export async function fetchProjectReports(projectId: string): Promise<ProjectReport[]> {
  return apiFetch<ProjectReport[]>(`/pwa/projects/${projectId}/reports`)
}

// ─── Teilrapport → Gesamtrapport (docs/specs/teilrapport.md §5.5) ───

/**
 * Die bündelbaren Einsätze eines Projekts: ohne Rechnung, ohne bestehende Bündelung,
 * ohne Kundenunterschrift — freie Teilrapporte UND gewöhnliche Rapporte.
 *
 * Letztere sind der häufige Fall: dass eine Baustelle über mehrere Tage geht, merkt
 * der Monteur meist erst, wenn der erste Tag längst gespeichert ist. Das Bündeln
 * macht die Angehakten zu Teilrapporten. Der Pfad heisst weiterhin
 * `partial-reports` — er steht in ausgelieferten PWA-Versionen.
 */
export async function fetchBundleableReports(projectId: string): Promise<ProjectReport[]> {
  return apiFetch<ProjectReport[]>(`/pwa/projects/${projectId}/partial-reports`)
}

export async function createAggregateReport(
  projectId: string, reportIds: number[],
): Promise<{ status: string; report_id: number }> {
  return apiFetch(`/pwa/projects/${projectId}/aggregate-report`, {
    method: 'POST',
    body: JSON.stringify({ report_ids: reportIds }),
  })
}

export async function dissolveAggregateReport(
  projectId: string, reportId: number,
): Promise<{ status: string; released: number }> {
  return apiFetch(`/pwa/projects/${projectId}/aggregate-report/${reportId}/dissolve`, {
    method: 'POST',
  })
}

/**
 * Nimmt einen bereits gespeicherten Rapport nachträglich in die Teilrapport-Serie auf
 * — oder wieder heraus (`isPartial: false`).
 *
 * Der Weg rückwärts zur Abschluss-Wahl im Chat: dass eine Baustelle über mehrere Tage
 * geht, stellt sich oft erst am zweiten Tag heraus. Danach erscheint der Rapport in
 * «Gesamtrapport erstellen», und der nächste Einsatz ist im Chat automatisch als
 * Teilrapport vorausgewählt.
 *
 * `changed: false` heisst «stand schon so» — der Aufruf ist idempotent.
 */
export async function markReportPartial(
  projectId: string, reportId: number, isPartial = true,
): Promise<{ status: string; changed: boolean; is_partial: boolean }> {
  return apiFetch(`/pwa/projects/${projectId}/reports/${reportId}/partial`, {
    method: 'POST',
    body: JSON.stringify({ is_partial: isPartial }),
  })
}

// ─── Häufig benutzte Ersatzteile (Rapport-Abschluss) ─────────

export interface FrequentMaterialOption {
  id: string
  art_nr: string
  name: string
  unit: string
  calc_vk: number
}

export async function fetchFrequentMaterials(): Promise<FrequentMaterialOption[]> {
  return apiFetch<FrequentMaterialOption[]>('/pwa/chat/frequent-materials', { method: 'GET' })
}

// ─── Material-Picker / Artikel-Katalog (Rapport-Abschluss) ───

export interface GalleryMaterialOption {
  art_nr: string
  name: string
  unit: string
  category?: string | null
  calc_vk: number
  image_url?: string | null   // frisch signierte URL (privater Bucket); fehlt bei Artikeln ohne Bild → Platzhalter
}

// Alle aktiven Artikel (mit Bild zuerst, ohne Bild danach) — lazy beim Öffnen des Popups geladen.
export async function fetchMaterialGallery(): Promise<GalleryMaterialOption[]> {
  return apiFetch<GalleryMaterialOption[]>('/pwa/chat/material-gallery', { method: 'GET' })
}

// Billiges Gating (count-only): entscheidet, ob der Katalog-Button gezeigt wird.
export async function fetchMaterialGalleryCount(): Promise<number> {
  const res = await apiFetch('/pwa/chat/material-gallery/count', { method: 'GET' }) as { count: number }
  return res?.count ?? 0
}

export async function disambiguateMaterial(art_nr: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/pwa/chat/disambiguate', {
    method: 'POST',
    body: JSON.stringify({ art_nr }),
  })
}

/** Beantwortet die Projekt-Rückfrage bei gleichnamigen Projekten — über die id. */
export async function chooseProject(project_id: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/pwa/chat/project-choice', {
    method: 'POST',
    body: JSON.stringify({ project_id }),
  })
}

export async function uploadPhoto(file: File): Promise<ChatResponse> {
  const form = new FormData()
  form.append('photo', file, file.name)
  return apiFormFetch<ChatResponse>('/pwa/chat/photo', form)
}

export interface MonthlyReportData {
  type: 'monthly'
  staff_name: string
  monat_name: string
  jahr: number
  erstellt_am: string
  tage: { datum: string; datum_iso: string; wochentag: string; clock_in: string; clock_out: string; pause_min: number; auto_pause_min?: number; stunden_str: string }[]
  arbeitstage: number
  total_stunden_str: string
  soll_stunden_str: string
  ueberstunden_min: number
  ueberstunden_str: string
}

export interface WeeklyReportData {
  type: 'weekly'
  period_label: string
  period_start: string
  period_end: string
  staff_name: string
  days: { date: string; date_iso: string; weekday: string; clock_in: string; clock_out: string; break_min: number; auto_break_min?: number; net_hours: number; projects: string; absence: string }[]
  total_net_hours: number
  soll_hours: number
  saldo: number
}

export type ReportData = MonthlyReportData | WeeklyReportData

export async function fetchMonthlyData(): Promise<MonthlyReportData> {
  return apiFetch<MonthlyReportData>('/pwa/report/monthly-data', { method: 'GET' })
}

export async function fetchWeeklyData(period: 'this_week' | 'last_week'): Promise<WeeklyReportData> {
  return apiFetch<WeeklyReportData>(`/pwa/report/weekly-data?period=${period}`, { method: 'GET' })
}

// ─── Absenzen ──────────────────────────────────────────────

export interface UserAbsence {
  id: string
  staff_name: string
  type: string
  date_start: string
  date_end: string
  status: string
  comment: string | null
}

export interface AbsenceCreatePayload {
  absence_type: 'vacation' | 'sick' | 'military' | 'other'
  date_start: string
  date_end: string
  comment?: string
}

export async function fetchMyAbsences(): Promise<UserAbsence[]> {
  return apiFetch<UserAbsence[]>('/pwa/absences', { method: 'GET' })
}

export async function createAbsenceRequest(payload: AbsenceCreatePayload): Promise<UserAbsence> {
  return apiFetch<UserAbsence>('/pwa/absences', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface VacationEntitlement {
  entitlement: number
  used: number
  taken: number
  planned: number
  remaining: number
  source: string
}

export async function fetchVacationEntitlement(): Promise<VacationEntitlement> {
  return apiFetch<VacationEntitlement>('/pwa/vacation-entitlement', { method: 'GET' })
}

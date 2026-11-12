// Mail-Eingang des Büros — docs/specs/mail-eingang-triage.md (§4, §6.3, §10).
//
// Mails, die der Betrieb an sein Triage-Postfach weiterleitet, ordnet der Server
// ein. Hier kommen sie als **Vorschläge** an: nichts ist geschrieben, bevor im
// Büro jemand «Übernehmen» klickt. Der Originaltext liegt nie bei uns — die
// Karte holt ihn beim Öffnen frisch aus dem Postfach (`getMailEingangText`).

import { apiFetch } from '../client'

/** Ein Projekt in der schmalen Form der Projektwahl. */
export interface EingangProjekt {
  project_id: string
  number: string
  name: string
  customer: string
  locality: string
}

export type EingangKategorie = 'neue_anfrage' | 'laufendes_projekt'
export type EingangStatus = 'offen' | 'erledigt' | 'verworfen'
export type VorschlagStatus = 'offen' | 'uebernommen' | 'verworfen'
/** Die Ansichten der Liste — `erledigt` umfasst serverseitig auch Verworfenes. */
export type EingangAnsicht = 'offen' | 'erledigt'

export interface ProjektEntwurfPayload {
  title: string
  customer_name: string
  customer_phone: string
  customer_email: string
  customer_address: string
  object_name: string
  object_address: string
  description: string
}

export interface ProjektnotizPayload {
  /** `null` = der Server konnte kein Projekt zuordnen; das Büro **muss** wählen. */
  project_id: string | null
  /** Kandidaten für die Wahl. */
  projects: EingangProjekt[]
  text: string
}

export interface KundennotizPayload {
  customer_id: string | number
  customer_name: string
  text: string
}

export interface KontaktErgaenzenPayload {
  customer_id: string | number
  customer_name: string
  feld: 'email' | 'phone' | 'phone_landline'
  feld_label: string
  wert: string
}

/** Ein Anhang der Mail als Vorschlag: «bei den Projektdokumenten ablegen». */
export interface ProjektdokumentPayload {
  /** `null` = kein Projekt zugeordnet; das Büro **muss** wählen. */
  project_id: string | null
  projects: EingangProjekt[]
  attachment_id: string
  /** Fremdtext aus der Mail — nur als Text anzeigen. */
  filename: string
  mime_type: string
  size: number
}

interface VorschlagBasis {
  id: string
  status: VorschlagStatus
  /** Was beim Übernehmen entstanden ist. */
  created: { type: string; id: string } | null
  decided_by_name: string | null
  decided_at: string | null
}

export type EingangVorschlag =
  | (VorschlagBasis & { typ: 'projekt_entwurf'; payload: ProjektEntwurfPayload })
  | (VorschlagBasis & { typ: 'projektnotiz'; payload: ProjektnotizPayload })
  | (VorschlagBasis & { typ: 'kundennotiz'; payload: KundennotizPayload })
  | (VorschlagBasis & { typ: 'kontakt_ergaenzen'; payload: KontaktErgaenzenPayload })
  | (VorschlagBasis & { typ: 'projektdokument'; payload: ProjektdokumentPayload })

export type VorschlagTyp = EingangVorschlag['typ']

/** Ein Anhang der Mail, wie die Karte ihn nennt. Kopiert wird er erst beim Übernehmen. */
export interface EingangAnhang {
  /** Dateiname aus der Mail — Fremdtext. */
  name: string
  /** Grösse in Bytes. */
  size: number
  /** Der Text des Anhangs ist in die Vorschläge eingeflossen. */
  gelesen: boolean
}

export interface EingangItem {
  id: string
  received_at: string
  subject: string | null
  kategorie: EingangKategorie
  /** `null`, sobald die Mail als «Nicht für Werkora» verworfen wurde. */
  summary: string | null
  /** Wer im Betrieb zugeleitet hat — bei einer Regel die Funktionsadresse. */
  weitergeleitet_von: { name: string | null; email: string }
  /** Aus der weitergeleiteten Nachricht gelesen, **nicht** geprüft (Spec §6.4). */
  absender: { name: string | null; email: string | null }
  customer: { id: string | number; name: string } | null
  /** Anhänge der Mail; fehlt bei einem Server, der das Feld noch nicht führt. */
  anhaenge?: EingangAnhang[]
  status: EingangStatus
  decided_at: string | null
  suggestions: EingangVorschlag[]
}

/** Zähler je Grund — über Abgewiesenes speichert der Server sonst nichts. */
export interface EingangAbgewiesen {
  grund: string
  anzahl: number
}

export interface EingangListe {
  items: EingangItem[]
  abgewiesen: EingangAbgewiesen[]
  abgewiesen_tage: number
}

export async function listMailEingang(status: EingangAnsicht): Promise<EingangListe> {
  const res = await apiFetch<Partial<EingangListe>>(`/pwa/admin/eingang?status=${status}`)
  return {
    items: res.items ?? [],
    abgewiesen: res.abgewiesen ?? [],
    abgewiesen_tage: res.abgewiesen_tage ?? 0,
  }
}

export async function searchMailEingangProjekte(q: string): Promise<EingangProjekt[]> {
  const res = await apiFetch<{ projects: EingangProjekt[] }>(
    `/pwa/admin/eingang/projects?q=${encodeURIComponent(q)}`,
  )
  return res.projects ?? []
}

export interface EingangOriginal {
  /** `false` = die Mail liegt nicht mehr im Postfach (Spec §6.3 — gewollt). */
  vorhanden: boolean
  text: string | null
}

export function getMailEingangText(itemId: string): Promise<EingangOriginal> {
  return apiFetch<EingangOriginal>(`/pwa/admin/eingang/${encodeURIComponent(itemId)}/text`)
}

export interface VorschlagEntscheid {
  suggestion: EingangVorschlag
  item_status: EingangStatus
}

const vorschlagPfad = (itemId: string, suggestionId: string) =>
  `/pwa/admin/eingang/${encodeURIComponent(itemId)}/suggestions/${encodeURIComponent(suggestionId)}`

/**
 * Übernehmen. `payload` trägt nur, was das Büro am Vorschlag geändert hat — der
 * Server lässt je Typ nur bestimmte Felder zu. 409 = nicht mehr offen.
 *
 * Zwei Typen laufen anders als «Vorschlag wird zum Objekt»:
 * - `projektdokument` holt den Anhang erst jetzt aus dem Postfach (dauert, kann
 *   mit 404/400 und einem Satz scheitern).
 * - `kontakt_ergaenzen` schreibt nichts mehr: gespeichert wird im Kundenformular,
 *   dieser Aufruf bestätigt danach nur (409 mit Satz, solange das Feld leer ist).
 */
export function acceptMailVorschlag(
  itemId: string, suggestionId: string, payload?: Record<string, unknown>,
): Promise<VorschlagEntscheid> {
  return apiFetch<VorschlagEntscheid>(`${vorschlagPfad(itemId, suggestionId)}/accept`, {
    method: 'POST',
    body: JSON.stringify(payload ? { payload } : {}),
  })
}

export function rejectMailVorschlag(itemId: string, suggestionId: string): Promise<VorschlagEntscheid> {
  return apiFetch<VorschlagEntscheid>(`${vorschlagPfad(itemId, suggestionId)}/reject`, { method: 'POST' })
}

/** «Nicht für Werkora»: verwirft alles zu dieser Mail, die Zusammenfassung wird gelöscht. */
export async function dismissMailEingang(itemId: string): Promise<void> {
  await apiFetch(`/pwa/admin/eingang/${encodeURIComponent(itemId)}/dismiss`, { method: 'POST' })
}

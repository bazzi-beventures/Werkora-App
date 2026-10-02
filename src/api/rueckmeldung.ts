/**
 * Kunden-Rückmeldung — einmalige Umfrage an offene Projekte eines Mandanten.
 *
 * Spec: docs/specs/kunden-rueckmeldung-kampagne.md §8.
 *
 * **Kein Schreiben am Inhalt**: Text, Auswahlregel und Fragen einer Kampagne
 * leben im Code (`services/rueckmeldung_kampagnen.py`), wie beim Newsletter.
 * Hier wird angesehen, probegelaufen und ausgelöst.
 *
 * Der Mandant kommt aus der Kampagne, nicht aus dem Wähler im Kopf — es gibt
 * deshalb keinen `tenantId`-Parameter.
 */
import { apiBlobFetch, apiFetch, apiTextFetch } from './client'

const BASE = '/pwa/superadmin/rueckmeldung/kampagnen'

export interface RueckmeldungOption {
  key: string
  label: string
  hinweis: string
}

export interface Kampagne {
  key: string
  titel: string
  tenant: { id: string; slug: string; name: string } | null
  name_muster: string
  nur_status: string[]
  gueltig_bis: string
  offen: boolean
  betreff: string
  mail_text: string
  pendent_frage: string
  mehrere_frage: string
  objekte_label: string
  anlagen_label: string
  produkte: RueckmeldungOption[]
  /** Reihenfolge der Kundenseite: am wenigsten dringend zuerst. */
  prioritaeten: RueckmeldungOption[]
  pause_s: number
  max_fotos: number
}

export interface PlanEintrag {
  project_id: string
  projekt_nr: string
  projekt_name: string
  kunde_name: string
  email: string
  objekt_adresse: string
  sent_at: string | null
  send_error: string | null
}

export interface Plan {
  treffer: number
  mails: number
  offene_projekte: number
  bereits_gesendet: number
  ohne_email: PlanEintrag[]
  gruppen: { email: string; kunde_name: string; projekte: PlanEintrag[] }[]
}

export interface Lauf {
  kampagne: string
  gestartet_at: string
  beendet_at: string | null
  mails_total: number
  mails_ok: number
  mails_fehler: number
  uebersprungen: number
  stopp: boolean
  letzter_fehler: string | null
  laeuft: boolean
}

export interface Stand {
  gesendet: number
  beantwortet: number
  /** Davon «hat sich erledigt» gemeldet — der Betrieb kann sie abschliessen. */
  erledigt: number
  fehler: number
  fotos: number
  je_prioritaet: { key: string; label: string; anzahl: number }[]
  lauf: Lauf | null
}

const k = (key: string) => `${BASE}/${encodeURIComponent(key)}`

export async function listKampagnen(): Promise<Kampagne[]> {
  const res = await apiFetch<{ kampagnen: Kampagne[] }>(BASE)
  return res.kampagnen ?? []
}

/** Ein Projekt in der Auswahlliste. `passt_regel` ist nur eine Spalte (die
 *  Namensregel der Kampagne als Vorschlag) — angeschrieben wird, was angehakt ist. */
export interface AuswahlProjekt {
  project_id: string
  projekt_nr: string
  projekt_name: string
  kunde_name: string
  /** Leer = keine brauchbare Adresse (Kundenkarte und Projekt geprüft). */
  email: string
  objekt_adresse: string
  passt_regel: boolean
  offerte: 'versendet' | 'entwurf' | 'keine'
  offerten: string[]
  /** '' = noch nicht angeschrieben. */
  umfrage: '' | 'gesendet' | 'beantwortet' | 'fehler'
}

export async function listProjekte(key: string): Promise<AuswahlProjekt[]> {
  const res = await apiFetch<{ projekte: AuswahlProjekt[] }>(`${k(key)}/projekte`)
  return res.projekte ?? []
}

/** Probelauf für die angehakten Projekte — genau das, was der Versand mit
 *  derselben Auswahl verschicken würde. */
export function probelauf(key: string, projectIds: string[]): Promise<{ plan: Plan; lauf: Lauf | null }> {
  return apiFetch(`${k(key)}/probelauf`, {
    method: 'POST',
    body: JSON.stringify({ project_ids: projectIds }),
  })
}

/** Mail- bzw. Seiten-HTML für `<iframe srcdoc>` — nicht `<iframe src>`: das
 *  Backend setzt `X-Frame-Options: DENY` (siehe `api/newsletter.ts`). */
export function vorschauMail(key: string): Promise<string> {
  return apiTextFetch(`${k(key)}/vorschau`)
}

export function vorschauSeite(key: string): Promise<string> {
  return apiTextFetch(`${k(key)}/seite`)
}

export function testmail(key: string, empfaenger?: string): Promise<{ ok: boolean; empfaenger: string }> {
  return apiFetch(`${k(key)}/testmail`, {
    method: 'POST',
    body: JSON.stringify({ empfaenger: empfaenger || null }),
  })
}

/**
 * Startet den Versand an die angehakten Projekte. `erwarteteMails` ist die Zahl, die der
 * Bestätigungsdialog genannt hat — stimmt sie serverseitig nicht mehr, kommt
 * 409 `plan_geaendert` statt eines Versands, den niemand so bestätigt hat.
 */
export function starteVersand(
  key: string, projectIds: string[], erwarteteMails: number,
): Promise<{ gestartet: boolean; mails: number; lauf: Lauf | null }> {
  return apiFetch(`${k(key)}/versand`, {
    method: 'POST',
    body: JSON.stringify({ project_ids: projectIds, erwartete_mails: erwarteteMails }),
  })
}

export function stoppeVersand(key: string): Promise<{ angehalten: boolean; lauf: Lauf | null }> {
  return apiFetch(`${k(key)}/stopp`, { method: 'POST' })
}

export function stand(key: string): Promise<Stand> {
  return apiFetch(`${k(key)}/stand`)
}

export async function downloadExport(key: string): Promise<void> {
  const { blob, filename } = await apiBlobFetch(`${k(key)}/export.csv`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : 'Rueckmeldungen.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

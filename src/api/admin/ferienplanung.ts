// Ferienplanung (Modul `ferienplanung`, docs/specs/ferienplanung.md §6–§7).
// Typen aus dem API-Vertrag (agents/routers/antworten/ferienplanung.py).
import { apiFetch, apiStreamFetch } from '../client'
import type { Antwort } from '../generated'

export type Befund = Antwort<'Befund'>
export type FerienStammdaten = Antwort<'FerienStammdaten'>
export type FerienGruppe = Antwort<'FerienGruppe'>
export type Sperrfrist = Antwort<'Sperrfrist'>
export type FerienRegel = Antwort<'FerienRegel'>
export type FerienPerson = Antwort<'FerienPerson'>
export type Vorlage = Antwort<'Vorlage'>
export type FerienPlaner = Antwort<'FerienPlaner'>
export type PlanerAbsenz = Antwort<'PlanerAbsenz'>
export type PlanerSperrfrist = Antwort<'PlanerSperrfrist'>
export type FerienGespeichert = Antwort<'FerienGespeichert'>

/** Welche Stammdaten-Tabelle: Gruppen, Sperrfristen oder Regeln. */
export type FerienArt = 'gruppen' | 'sperrfristen' | 'regeln'

export function getStammdaten(): Promise<FerienStammdaten> {
  return apiFetch<FerienStammdaten>('/pwa/admin/ferienplanung/stammdaten')
}

export function getPlaner(von: string, bis: string): Promise<FerienPlaner> {
  return apiFetch<FerienPlaner>(`/pwa/admin/ferienplanung/planer?von=${von}&bis=${bis}`)
}

/** Anlegen (ohne `id`) oder ändern. `mitglieder` nur bei manuellen Gruppen. */
export function speichereZeile(
  art: FerienArt, daten: Record<string, unknown>, id?: string, mitglieder?: string[],
): Promise<FerienGespeichert> {
  const pfad = id ? `/pwa/admin/ferienplanung/${art}/${encodeURIComponent(id)}` : `/pwa/admin/ferienplanung/${art}`
  return apiFetch<FerienGespeichert>(pfad, {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify({ daten, ...(mitglieder ? { mitglieder } : {}) }),
  })
}

export function loescheZeile(art: FerienArt, id: string): Promise<FerienGespeichert> {
  return apiFetch<FerienGespeichert>(`/pwa/admin/ferienplanung/${art}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/** Fehlercodes der Validierung (services/ferien_regeln.py) als Klartext. */
export const FEHLER_TEXT: Record<string, string> = {
  unter_zwei_wochen: 'Mindestens 10 Arbeitstage am Stück müssen möglich bleiben (OR 329c: zwei Wochen am Stück).',
  kein_zwei_wochen_fenster: 'Mit dieser harten Sperre bliebe jemandem im Jahr kein Fenster für zwei Wochen Ferien am Stück (OR 329c).',
  eine_schranke: 'Entweder «höchstens n weg» oder «mindestens n da» — genau eines.',
  invalid_schranke: 'Die Anzahl muss mindestens 1 sein.',
  missing_ziel: 'Bitte eine Gruppe oder Personen wählen.',
  ziel_zu_klein: 'Bitte mindestens zwei Personen wählen.',
  invalid_vorlauf: 'Vorlauf: 0 bis 365 Tage.',
  missing_titel: 'Bitte einen Titel eingeben.',
  missing_name: 'Bitte einen Namen eingeben.',
  bis_vor_von: '«Bis» liegt vor «Von».',
  zu_lang: 'Eine jährliche Sperrfrist darf höchstens 300 Tage lang sein.',
  invalid_gruppe: 'Diese Gruppe gibt es nicht (mehr).',
  invalid_mitglied: 'Eine gewählte Person gibt es nicht (mehr).',
  invalid_datum: 'Bitte gültige Daten eingeben.',
}

export function fehlerText(err: unknown): string {
  const code = err instanceof Error ? err.message : ''
  return FEHLER_TEXT[code] ?? 'Speichern hat nicht geklappt — bitte nochmals versuchen.'
}

// ── Ferien-Assistent (Zusatzmodul `ferienplanung_assistent`, Spec §11) ────────
export type AssistentStand = Antwort<'AssistentStand'>
export type AssistentThema = Antwort<'AssistentThema'>

export interface AssistentEreignis {
  type: 'tool' | 'delta' | 'vorschlag' | 'done' | 'error'
  label?: string
  text?: string
  message?: string
}

export function getAssistentStand(): Promise<AssistentStand> {
  return apiFetch<AssistentStand>('/pwa/admin/ferienplanung/assistent/stand')
}

/** SSE-Chat; `history` = bisherige Nachrichten (nur im Client gehalten). */
export async function* frageAssistent(
  question: string, history: { role: 'user' | 'assistant'; text: string }[],
): AsyncGenerator<AssistentEreignis> {
  for await (const ev of apiStreamFetch('/pwa/admin/ferienplanung/assistent/frage', { question, history })) {
    yield ev as unknown as AssistentEreignis
  }
}

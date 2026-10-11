// Hagelschaden-Disposition — Tourenplanung, Vormerkung, Freigabe (Phasen 2, 2b, 3).
// Spec: docs/specs/hagelschaden-disposition.md §7–§11.
//
// Alles hinter dem Feature `hagelschaden_disposition`; der Server prüft es
// pro Konto. Nichts hier schreibt ohne Klick einen Termin: berechnen speichert
// nur einen Plan, vormerken legt Vormerkungen an (für Monteure unsichtbar), erst
// `freigebenVormerkungen` erzeugt Termine.

import { apiBlobFetch, apiFetch } from '../client'
import type { HagelDispoInfo, HagelEinsatzart } from './hagelschaden'

const BASE = '/pwa/admin/hagelschaden/dispo'

function q(kampagne?: string, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams()
  if (kampagne) p.set('kampagne', kampagne)
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export interface DispoStopp {
  project_id: string
  projekt_nr: string
  projekt_name: string
  kunde: string
  adresse: string
  lat: number
  lon: number
  einsatzart: HagelEinsatzart
  kategorie: string | null
  dringlichkeit: string
  prioritaet: string
  /** 'HH:MM' */
  start: string
  ende: string | null
  /** >1: mehrtägiger Block */
  tage: number
  end_datum: string | null
  dauer_min: number
  personen: number
  fahrt_min: number
  km: number
  zu_spaet: boolean
  zeitfenster: string | null
}

export interface DispoTour {
  equipe_id: string
  equipe_name: string
  farbe: string
  monteur_ids: string[]
  fahrt_min: number
  km: number
  start: string
  ende: string
  kapazitaet_min: number
  auslastung_pct: number
  stopps: DispoStopp[]
}

export interface DispoTag {
  /** 'JJJJ-MM-TT' */
  datum: string
  wochentag: string
  touren: DispoTour[]
}

export interface DispoHinweis {
  typ: 'daten' | 'kapazitaet' | 'frist' | 'buendel' | 'auslastung' | 'ausreisser'
  text: string
  gewicht: number
  project_ids: string[]
}

export interface DispoKennzahlen {
  faelle: number
  geplant: number
  ungeplant: number
  km: number
  fahrt_min: number
  arbeit_min: number
  fahranteil_pct: number
  letzter_tag: number
  zu_spaet: number
  fertig_am: string | null
  ohne_koordinaten: number
  budget_erreicht: boolean
}

export interface DispoPlan {
  id: number
  created_at?: string
  created_by_name?: string
  parameter?: { stufe: string; ab: string }
  tage: DispoTag[]
  ungeplant: { project_id: string; projekt_nr: string; projekt_name: string; einsatzart: string; grund: string }[]
  ohne_koordinaten: { project_id: string; projekt_nr: string; projekt_name: string; adresse: string }[]
  kennzahlen: DispoKennzahlen
  horizont: { von: string | null; bis: string | null }
  depot: { adresse: string; lat: number; lon: number } | null
  hinweise: DispoHinweis[]
}

export interface DispoUebersicht {
  dispo: HagelDispoInfo
  plan: DispoPlan | null
  vormerkungen_offen: number
}

export type VormerkungStatus = 'vorgeschlagen' | 'angefragt' | 'bestaetigt' | 'abgelehnt' | 'freigegeben'

export interface Vormerkung {
  id: number
  project_id: string
  plan_id: number | null
  einsatzart: HagelEinsatzart
  datum: string
  end_datum: string | null
  start_time: string | null
  end_time: string | null
  equipe: { id: string; name: string; monteur_ids: string[]; farbe?: string }
  reihenfolge: number
  status: VormerkungStatus
  appointment_id: string | null
  notiz: string | null
  updated_by_name: string | null
  projekt_nr: string
  projekt_name: string
  adresse: string
  lat: number | null
  lon: number | null
  kunde: string
  telefon: string[]
  kontakt_vor_ort: string
  /** nur in der Ebene der Einsatzplanung: Monteur am Tag anderweitig belegt */
  konflikt?: boolean
}

export interface DispoVariante {
  name: string
  equipen: number
  samstag: boolean
  gewichtung: number
  fertig_am: string | null
  arbeitstage: number
  km: number
  fahrt_min: number
  zu_spaet: number
  ungeplant: number
  ohne_koordinaten: number
}

export interface DispoKalibrierung {
  produkt: string
  einsaetze: number
  faktor: number
  min_faktor: number
  max_faktor: number
  aktuell_min: number
  vorschlag_min: number
}

export interface FreigabeErgebnis {
  ergebnisse: { id: number; ok: boolean; appointment_id?: string; project_id?: string; fehler?: string; konflikt?: string }[]
  freigegeben: number
}

export async function getDispo(kampagne?: string): Promise<DispoUebersicht> {
  return apiFetch(`${BASE}${q(kampagne)}`)
}

export async function planBerechnen(body: { stufe: string; ab?: string }, kampagne?: string): Promise<DispoPlan> {
  return apiFetch(`${BASE}/plaene${q(kampagne)}`, { method: 'POST', body: JSON.stringify(body) })
}

export async function variantenRechnen(body: { stufe: string; ab?: string }, kampagne?: string): Promise<{ varianten: DispoVariante[] }> {
  return apiFetch(`${BASE}/varianten${q(kampagne)}`, { method: 'POST', body: JSON.stringify(body) })
}

export async function getKalibrierung(kampagne?: string): Promise<{ vorschlaege: DispoKalibrierung[] }> {
  return apiFetch(`${BASE}/kalibrierung${q(kampagne)}`)
}

export async function depotSuchen(adresse: string): Promise<{ adresse: string; lat: number; lon: number }> {
  return apiFetch(`${BASE}/depot`, { method: 'POST', body: JSON.stringify({ adresse }) })
}

export async function planVormerken(planId: number, tage: string[] | null, kampagne?: string): Promise<{ vorgemerkt: number }> {
  return apiFetch(`${BASE}/plaene/${planId}/vormerken${q(kampagne)}`, {
    method: 'POST', body: JSON.stringify({ tage }),
  })
}

export async function getVormerkungen(
  opts: { status?: VormerkungStatus[]; von?: string; bis?: string } = {}, kampagne?: string,
): Promise<{ vormerkungen: Vormerkung[] }> {
  return apiFetch(`${BASE}/vormerkungen${q(kampagne, { status: opts.status?.join(','), von: opts.von, bis: opts.bis })}`)
}

export type VormerkungPatch = Partial<{
  status: Exclude<VormerkungStatus, 'freigegeben'>
  datum: string
  start_time: string | null
  end_time: string | null
  equipe_id: string
  notiz: string
  nicht_vor: string | null
}>

export async function patchVormerkung(id: number, felder: VormerkungPatch, kampagne?: string): Promise<Vormerkung> {
  return apiFetch(`${BASE}/vormerkungen/${id}${q(kampagne)}`, { method: 'PATCH', body: JSON.stringify(felder) })
}

export async function verwerfeVormerkung(id: number, kampagne?: string): Promise<void> {
  await apiFetch(`${BASE}/vormerkungen/${id}${q(kampagne)}`, { method: 'DELETE' })
}

export async function freigebenVormerkungen(
  ids: number[], ignoreAbsence = false, kampagne?: string,
): Promise<FreigabeErgebnis> {
  return apiFetch(`${BASE}/vormerkungen/freigeben${q(kampagne)}`, {
    method: 'POST', body: JSON.stringify({ ids, ignore_absence_conflicts: ignoreAbsence }),
  })
}

/** Die gestrichelte Ebene der Einsatzplanung (Phase 2b). */
export async function getVorschlaege(dateFrom: string, dateTo: string): Promise<{ vorschlaege: Vormerkung[] }> {
  return apiFetch(`${BASE}/vorschlaege${q(undefined, { date_from: dateFrom, date_to: dateTo })}`)
}

export async function downloadTourenblatt(planId: number, datum: string, equipe: string, kampagne?: string): Promise<void> {
  const { blob, filename } = await apiBlobFetch(
    `${BASE}/plaene/${planId}/tourenblatt.pdf${q(kampagne, { datum, equipe })}`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'Tourenblatt.pdf'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

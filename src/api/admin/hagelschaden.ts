// Hagelschaden — Arbeitsliste der Kunden-Rückmeldung, Modul `hagelschaden`.
// Spec: docs/specs/hagelschaden-dashboard.md.
//
// Ein GET liefert alles (Kampagne, Kacheln, Zeilen) — gefiltert wird im
// Browser. Der PATCH schickt nur die geänderten Felder: zwei Leute, die
// gleichzeitig verschiedene Schalter umlegen, überschreiben einander nicht.

import { apiBlobFetch, apiFetch } from '../client'

export interface HagelOption { key: string; label: string; hinweis?: string; rang?: number }

export interface HagelKampagne {
  key: string
  titel: string
  kurzname: string
  gueltig_bis: string
  prioritaeten: HagelOption[]
  produkte: HagelOption[]
}

export interface HagelTermin {
  id?: string
  /** 'JJJJ-MM-TT' */
  datum: string
  bis: string | null
  zeit: string | null
  art: string
}

/** Die Bearbeitungsfelder einer Zeile — auch die Antwort des PATCH. */
export interface HagelBearbeitung {
  /** Der Betrieb bearbeitet den Fall gerade. Reiner Schalter, nie aus der Kundenantwort abgeleitet. */
  aktiv: boolean
  kontaktiert: boolean
  /** wirksam: offener Termin ODER Schalter */
  einsatz_geplant: boolean
  einsatz_geplant_manuell: boolean
  termin: HagelTermin | null
  /** false = Einsatzplanung war nicht lesbar («Termin unbekannt») */
  termine_bekannt: boolean
  notiz: string
  bearbeitet_von: string
  bearbeitet_am: string | null
}

export type HagelEinsatzart = 'sicherung' | 'aufnahme' | 'reparatur'
export type HagelKategorie = 'glas' | 'dach' | 'gross' | 'klein' | 'storen_markise'
export type HagelZeitfenster = 'vormittag' | 'nachmittag'

/**
 * Disposition eines Falls — docs/specs/hagelschaden-disposition.md §4, §5.
 * Nur mit Feature `hagelschaden_disposition`; ohne Antwort des Kunden `null`.
 * `*_regel` ist, was ohne Überschreibung gälte.
 */
export interface HagelDispo {
  einsatzart: HagelEinsatzart
  einsatzart_regel: HagelEinsatzart
  kategorie: HagelKategorie
  kategorie_regel: HagelKategorie
  /** Dauer des nächsten Einsatzes in Minuten */
  dauer_min: number
  dauer_regel_min: number
  dauer_ueberschrieben: boolean
  /** Restarbeit über alle noch offenen Stufen (Minuten) */
  rest_min: number
  stufen_min: Partial<Record<HagelEinsatzart, number>>
  elemente: number
  umfang_geschaetzt: boolean
  personen: number
  personen_regel: number
  nicht_vor: string | null
  zeitfenster: HagelZeitfenster | null
  ueberschrieben: string[]
}

export interface HagelEquipe {
  id: string
  name: string
  monteur_ids: string[]
  faehigkeiten: string[]
  farbe: string
  kapazitaet_min?: number
}

/** Planungs-Parameter der Tourenplanung (Spec §6, §7). */
export interface HagelPlanParameter {
  depot: { adresse: string; lat: number; lon: number } | null
  equipen: HagelEquipe[]
  tempo_kmh: number
  umwegfaktor_pct: number
  parkzeit_min: number
  tagesbeginn: string
  samstag: boolean
  samstag_min: number
  horizont_tage: number
  budget_s: number
  /** 0 = kurze Wege, 100 = Dringendes zuerst */
  gewichtung: number
  stabil: 'aus' | 'normal' | 'stark'
  lieferfrist_arbeitstage: number
  nur_bestaetigte_freigeben: boolean
  fristen: Record<string, number>
}

export interface HagelDispoParameter {
  plan: HagelPlanParameter
  grundzeit_min: number
  min_je_element: Record<string, number>
  zuschlag_zusatzprodukt_min: number
  elemente_ohne_angabe: number
  elemente_je_objekt: number
  sicherung_min: number
  aufnahme_grund_min: number
  aufnahme_je_element_min: number
  tageskapazitaet_min: number
}

export interface HagelDispoInfo {
  parameter: HagelDispoParameter
  defaults: HagelDispoParameter
  einsatzarten: { key: HagelEinsatzart; label: string }[]
  kategorien: { key: HagelKategorie; label: string }[]
}

/** Eine Nummer aus der Kundenkarte — `art` z. B. «Mobil», «Vor Ort · Hans Muster». */
export interface HagelTelefon { art: string; nummer: string }

export interface HagelZeile extends HagelBearbeitung {
  project_id: string
  /** 0 beantwortet/pendent · 1 erledigt gemeldet · 2 ohne Antwort · 3 nicht angeschrieben · 4 keine E-Mail */
  status_key: number
  status: string
  projekt_nr: string
  projekt_name: string
  projekt_offen: boolean
  kunde: string
  email: string
  /** Aus der Kundenkarte, wichtigste zuerst; leer ohne Kunde oder ohne Nummer */
  telefon?: HagelTelefon[]
  objekt_adresse: string
  gesendet_am: string
  beantwortet_am: string
  noch_pendent: string
  prioritaet: string
  dringlichkeit: string
  produkt: string
  art: string
  mehrere_objekte: string
  anzahl_objekte: number | ''
  anzahl_anlagen: number | ''
  fotos: number
  antworten: number
  bemerkung_kunde: string
  versandfehler: string
  /** nur mit Feature `hagelschaden_disposition` */
  dispo?: HagelDispo | null
}

export interface HagelKennzahlen {
  projekte: number
  gesendet: number
  beantwortet: number
  erledigt: number
  fotos: number
  je_prioritaet: { key: string; label: string; anzahl: number }[]
  aktiv: number
  aktiv_ohne_einsatz: number
  einsatz_geplant: number
  kontaktiert: number
  /** Kunde meldet «pendent», beim Betrieb weder aktiv noch eingeplant */
  pendent_unbearbeitet: number
}

export interface HagelListe {
  kampagnen: { key: string; titel: string; kurzname: string }[]
  kampagne: HagelKampagne | null
  kennzahlen: HagelKennzahlen | null
  zeilen: HagelZeile[]
  termine_bekannt?: boolean
  /** nur mit Feature `hagelschaden_disposition` — der Server entscheidet */
  dispo?: HagelDispoInfo
}

/** Dispo-Überschreibungen: `null` heisst «zurück zur Regel». */
export type HagelDispoPatch = Partial<{
  einsatzart: HagelEinsatzart | null
  kategorie: HagelKategorie | null
  dauer_min: number | null
  personen: number | null
  nicht_vor: string | null
  zeitfenster: HagelZeitfenster | null
}>

export type HagelPatch = Partial<{
  aktiv: boolean
  kontaktiert: boolean
  einsatz_geplant_manuell: boolean
  notiz: string
}> & HagelDispoPatch

const BASE = '/pwa/admin/hagelschaden'

function query(kampagne?: string): string {
  return kampagne ? `?kampagne=${encodeURIComponent(kampagne)}` : ''
}

export async function getHagelschaden(kampagne?: string): Promise<HagelListe> {
  return apiFetch<HagelListe>(`${BASE}${query(kampagne)}`)
}

export async function patchHagelschaden(
  projectId: string, felder: HagelPatch, kampagne?: string,
): Promise<HagelBearbeitung & { project_id: string; dispo?: HagelDispo | null }> {
  return apiFetch(`${BASE}/projekte/${encodeURIComponent(projectId)}${query(kampagne)}`, {
    method: 'PATCH',
    body: JSON.stringify(felder),
  })
}

/** Speichert die Dauer-Matrix der Disposition (Spec §5.1); Antwort: die wirksamen Parameter. */
export async function putHagelDispoParameter(
  parameter: Partial<HagelDispoParameter>, kampagne?: string,
): Promise<HagelDispoInfo> {
  return apiFetch(`${BASE}/dispo/parameter${query(kampagne)}`, {
    method: 'PUT',
    body: JSON.stringify({ parameter }),
  })
}

/** Lädt die Excel-Liste herunter — dieselbe Datei wie im Superadmin, vollständig. */
export async function downloadHagelschadenExcel(kampagne?: string): Promise<void> {
  const { blob, filename } = await apiBlobFetch(`${BASE}/export.xlsx${query(kampagne)}`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xlsx') ? filename : 'Hagelschaden.xlsx'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

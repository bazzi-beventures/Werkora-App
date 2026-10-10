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
}

export type HagelPatch = Partial<{
  aktiv: boolean
  kontaktiert: boolean
  einsatz_geplant_manuell: boolean
  notiz: string
}>

const BASE = '/pwa/admin/hagelschaden'

function query(kampagne?: string): string {
  return kampagne ? `?kampagne=${encodeURIComponent(kampagne)}` : ''
}

export async function getHagelschaden(kampagne?: string): Promise<HagelListe> {
  return apiFetch<HagelListe>(`${BASE}${query(kampagne)}`)
}

export async function patchHagelschaden(
  projectId: string, felder: HagelPatch, kampagne?: string,
): Promise<HagelBearbeitung & { project_id: string }> {
  return apiFetch(`${BASE}/projekte/${encodeURIComponent(projectId)}${query(kampagne)}`, {
    method: 'PATCH',
    body: JSON.stringify(felder),
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

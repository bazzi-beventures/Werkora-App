// Hagelschaden-Disposition, Phase 1 — reine Anzeige-Helfer.
// Spec: docs/specs/hagelschaden-disposition.md §4, §5, §15.
//
// Die Ableitung (Einsatzart, Kategorie, Dauer) rechnet der Server
// (services/dispo_kategorien.py). Hier steht nur, was der Screen nach einem
// Umschalten neu zählen muss, ohne die Liste neu zu laden — dieselbe Regel wie
// `dispo_kategorien.offene_arbeit`.

import type { HagelEinsatzart, HagelZeile } from '../../../api/admin/hagelschaden'

export const EINSATZART_LABELS: Record<HagelEinsatzart, string> = {
  sicherung: 'Sicherung',
  aufnahme: 'Aufnahme',
  reparatur: 'Reparatur',
}

export interface OffeneArbeit {
  faelle: number
  minuten: number
  je: Record<HagelEinsatzart, number>
  equipentage: number
  geschaetzt: number
}

/**
 * Restarbeit der Fälle, die noch Arbeit sind: Kunde meldet pendent (nicht
 * «erledigt gemeldet») und noch kein Einsatz geplant. Ein eingeplanter Fall
 * steht schon in der Einsatzplanung und würde sonst doppelt gezählt.
 */
export function offeneArbeit(zeilen: HagelZeile[], tageskapazitaetMin: number): OffeneArbeit {
  const je: Record<HagelEinsatzart, number> = { sicherung: 0, aufnahme: 0, reparatur: 0 }
  let faelle = 0
  let geschaetzt = 0
  for (const z of zeilen) {
    const d = z.dispo
    if (!d || z.status_key === 1 || z.einsatz_geplant) continue
    faelle += 1
    if (d.umfang_geschaetzt) geschaetzt += 1
    for (const [art, min] of Object.entries(d.stufen_min) as [HagelEinsatzart, number][]) {
      je[art] = (je[art] ?? 0) + Number(min || 0)
    }
  }
  const minuten = je.sicherung + je.aufnahme + je.reparatur
  const kap = tageskapazitaetMin > 0 ? tageskapazitaetMin : 480
  return { faelle, minuten, je, equipentage: Math.round((minuten / kap) * 10) / 10, geschaetzt }
}

/** «45 min», «2 h», «2 h 15» — kurz genug für eine Tabellenzelle. */
export function dauerText(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min - h * 60)
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/** Stunden mit Tausendertrenner, ohne Nachkommastellen: «1'240 h».
 *  Unter zehn Stunden genauer («2 h 15», «35 min») — «1 h» für 35 Minuten
 *  wäre bei wenigen Fällen schlicht falsch. */
export function stundenText(min: number): string {
  if (min < 600) return dauerText(min)
  return `${Math.round(min / 60).toLocaleString('de-CH')} h`
}

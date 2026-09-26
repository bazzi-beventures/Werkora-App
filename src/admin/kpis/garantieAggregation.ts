// Kennzahlen des KPI-Tabs «Garantie» (docs/specs/garantiefall.md §6.4) — rein,
// damit sie ohne React testbar sind. Die Rohzeilen kommen aus vw_kpi_garantie
// (eine Zeile je Fall, Kosten aus dem Reparatur-Projekt).

import type { KpiGarantieRow } from './types'

/** Fälle, an denen noch jemand arbeiten muss. */
export const OFFENE_STATUS: ReadonlySet<KpiGarantieRow['status']> = new Set([
  'gemeldet', 'in_pruefung', 'entschieden', 'in_arbeit',
])

export const URSACHE_LABEL: Record<NonNullable<KpiGarantieRow['cause']>, string> = {
  eigener_fehler: 'Eigener Fehler',
  material: 'Material',
  fremdverschulden: 'Fremdverschulden',
  verschleiss: 'Verschleiss',
  unklar: 'Unklar',
}

export const ENTSCHEID_LABEL: Record<NonNullable<KpiGarantieRow['decision']>, string> = {
  anerkannt: 'Anerkannt',
  kulanz: 'Kulanz',
  abgelehnt: 'Abgelehnt',
}

export const STATUS_LABEL: Record<KpiGarantieRow['status'], string> = {
  gemeldet: 'Gemeldet',
  in_pruefung: 'In Prüfung',
  entschieden: 'Entschieden',
  in_arbeit: 'In Arbeit',
  behoben: 'Behoben',
  abgeschlossen: 'Abgeschlossen',
}

function zahl(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Kosten einer Gruppe von Fällen. `unvollstaendig` zählt die Fälle MIT
 * Reparatur-Projekt, deren Kosten die View nicht beziffern kann (fehlender
 * interner Satz oder EK, archiviertes Projekt). Ohne diesen Zähler sähe eine
 * Summe über teils unbewertete Fälle aus wie die ganze Wahrheit.
 */
export function kosten(rows: KpiGarantieRow[]): { summe: number; unvollstaendig: number } {
  let summe = 0
  let unvollstaendig = 0
  for (const r of rows) {
    if (!r.repair_project_id) continue
    const k = zahl(r.kosten)
    if (k === null) unvollstaendig += 1
    else summe += k
  }
  return { summe: Math.round(summe * 100) / 100, unvollstaendig }
}

export interface GarantieKennzahlen {
  offen: number
  faelleJahr: number
  kostenJahr: { summe: number; unvollstaendig: number }
  /** Anteil «anerkannt» an den entschiedenen Fällen des Jahres; null ohne Entscheide. */
  anteilAnerkannt: number | null
  kulanzJahr: number
}

export function garantieKennzahlen(rows: KpiGarantieRow[], jahr: number): GarantieKennzahlen {
  const imJahr = rows.filter(r => Number(r.jahr) === jahr)
  const entschieden = imJahr.filter(r => r.decision)
  const anerkannt = entschieden.filter(r => r.decision === 'anerkannt').length
  return {
    offen: rows.filter(r => OFFENE_STATUS.has(r.status)).length,
    faelleJahr: imJahr.length,
    kostenJahr: kosten(imJahr),
    anteilAnerkannt: entschieden.length ? anerkannt / entschieden.length : null,
    kulanzJahr: entschieden.filter(r => r.decision === 'kulanz').length,
  }
}

export interface GruppenZeile {
  schluessel: string
  label: string
  faelle: number
  kosten: number
  unvollstaendig: number
}

/** Fälle und Kosten je Gruppe, grösste Gruppe zuerst. */
export function gruppiere(
  rows: KpiGarantieRow[],
  schluessel: (r: KpiGarantieRow) => { key: string; label: string } | null,
): GruppenZeile[] {
  const gruppen = new Map<string, { label: string; rows: KpiGarantieRow[] }>()
  for (const r of rows) {
    const g = schluessel(r)
    if (!g) continue
    const eintrag = gruppen.get(g.key) ?? { label: g.label, rows: [] }
    eintrag.rows.push(r)
    gruppen.set(g.key, eintrag)
  }
  return [...gruppen.entries()]
    .map(([key, { label, rows: rs }]) => {
      const k = kosten(rs)
      return { schluessel: key, label, faelle: rs.length, kosten: k.summe, unvollstaendig: k.unvollstaendig }
    })
    .sort((a, b) => b.faelle - a.faelle || b.kosten - a.kosten || a.label.localeCompare(b.label))
}

export const nachUrsache = (r: KpiGarantieRow) =>
  ({ key: r.cause ?? 'offen', label: r.cause ? URSACHE_LABEL[r.cause] : 'Nicht erfasst' })

/** Nur Fälle mit Lieferant — der Regress ist die Ausnahme (Spec §3.6). */
export const nachLieferant = (r: KpiGarantieRow) =>
  r.supplier_id ? { key: r.supplier_id, label: r.supplier_name || 'Unbekannter Lieferant' } : null

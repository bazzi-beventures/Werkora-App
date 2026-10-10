// Hagelschaden — Filter, Kacheln und Kennzahlen als reine Funktionen.
// Spec: docs/specs/hagelschaden-dashboard.md §7.
//
// Gefiltert wird im Browser: gut 500 Zeilen, und jeder Filterwechsel soll
// sofort wirken. Die Reihenfolge kommt vom Server (dieselbe wie in der
// Excel-Planungsliste: dringendste zuerst) und wird hier nie umsortiert.
//
// Die Kennzahlen rechnet der Screen aus den Zeilen nach, statt die des Servers
// zu zeigen: nach jedem Umschalten («Einsatz geplant: ja») müssen die Kacheln
// stimmen, ohne die ganze Liste neu zu laden. Gleiche Regeln wie
// services/hagelschaden_service.kennzahlen.

import type { HagelKampagne, HagelZeile } from '../../../api/admin/hagelschaden'

export type UmfrageStatus =
  | 'alle' | 'angeschrieben' | 'beantwortet' | 'pendent' | 'erledigt'
  | 'ohne_antwort' | 'nicht_angeschrieben' | 'keine_email'

export type JaNeinAlle = 'alle' | 'ja' | 'nein'

export interface HagelFilter {
  suche: string
  status: UmfrageStatus
  /** leer = alle */
  prioritaeten: string[]
  /** leer = alle */
  produkte: string[]
  aktiv: JaNeinAlle
  einsatz: JaNeinAlle
  kontaktiert: JaNeinAlle
  nurFotos: boolean
}

/** Standard: die Planungsliste — beantwortet und aktiv. */
export const STANDARD_FILTER: HagelFilter = {
  suche: '',
  status: 'beantwortet',
  prioritaeten: [],
  produkte: [],
  aktiv: 'ja',
  einsatz: 'alle',
  kontaktiert: 'alle',
  nurFotos: false,
}

export const STATUS_LABELS: Record<UmfrageStatus, string> = {
  alle: 'Alle Projekte',
  angeschrieben: 'Angeschrieben',
  beantwortet: 'Beantwortet',
  pendent: 'Beantwortet, pendent',
  erledigt: 'Erledigt gemeldet',
  ohne_antwort: 'Angeschrieben, keine Antwort',
  nicht_angeschrieben: 'Nicht angeschrieben',
  keine_email: 'Keine E-Mail-Adresse',
}

// status_key aus services/rueckmeldung_service._export_rang
const STATUS_KEYS: Record<UmfrageStatus, number[] | null> = {
  alle: null,
  angeschrieben: [0, 1, 2],
  beantwortet: [0, 1],
  pendent: [0],
  erledigt: [1],
  ohne_antwort: [2],
  nicht_angeschrieben: [3],
  keine_email: [4],
}

function passtJaNein(wert: boolean, filter: JaNeinAlle): boolean {
  return filter === 'alle' || (filter === 'ja') === wert
}

function suchtext(z: HagelZeile): string {
  return [
    z.projekt_nr, z.projekt_name, z.kunde, z.objekt_adresse, z.email,
    z.bemerkung_kunde, z.notiz,
  ].join(' ').toLowerCase()
}

export function filtereZeilen(zeilen: HagelZeile[], f: HagelFilter): HagelZeile[] {
  const keys = STATUS_KEYS[f.status]
  const worte = f.suche.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return zeilen.filter(z => {
    if (keys && !keys.includes(z.status_key)) return false
    if (f.prioritaeten.length && !f.prioritaeten.includes(z.prioritaet)) return false
    if (f.produkte.length) {
      const eigene = (z.produkt || '').split(',').filter(Boolean)
      if (!f.produkte.some(p => eigene.includes(p))) return false
    }
    if (!passtJaNein(z.aktiv, f.aktiv)) return false
    if (!passtJaNein(z.einsatz_geplant, f.einsatz)) return false
    if (!passtJaNein(z.kontaktiert, f.kontaktiert)) return false
    if (f.nurFotos && !(z.fotos > 0)) return false
    if (worte.length) {
      const text = suchtext(z)
      if (!worte.every(w => text.includes(w))) return false
    }
    return true
  })
}

export function istStandard(f: HagelFilter): boolean {
  return JSON.stringify({ ...f, suche: '' }) === JSON.stringify(STANDARD_FILTER)
}

// ─── Kacheln ──────────────────────────────────────────────────────

export interface Kachel {
  key: string
  wert: number
  label: string
  /** Dringlichkeits-Rang (0 = dringendste) für die Farbe, sonst undefined */
  rang?: number
  filter: HagelFilter
}

export interface HagelZahlen {
  gesendet: number
  beantwortet: number
  erledigt: number
  fotos: number
  jePrioritaet: { key: string; label: string; rang: number; anzahl: number }[]
  aktiv: number
  aktivOhneEinsatz: number
  einsatzGeplant: number
  kontaktiert: number
}

export function kennzahlen(zeilen: HagelZeile[], kampagne: HagelKampagne): HagelZahlen {
  const beantwortet = zeilen.filter(z => z.antworten > 0)
  const pendent = beantwortet.filter(z => z.status_key !== 1)
  const aktiv = zeilen.filter(z => z.aktiv)
  const stufen = [...kampagne.prioritaeten].sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0))
  return {
    gesendet: zeilen.filter(z => !!z.gesendet_am).length,
    beantwortet: beantwortet.length,
    erledigt: beantwortet.length - pendent.length,
    fotos: zeilen.reduce((s, z) => s + (Number(z.fotos) || 0), 0),
    jePrioritaet: stufen.map(o => ({
      key: o.key, label: o.label, rang: o.rang ?? 0,
      anzahl: pendent.filter(z => z.prioritaet === o.key).length,
    })),
    aktiv: aktiv.length,
    aktivOhneEinsatz: aktiv.filter(z => !z.einsatz_geplant).length,
    einsatzGeplant: zeilen.filter(z => z.einsatz_geplant).length,
    kontaktiert: zeilen.filter(z => z.kontaktiert).length,
  }
}

/** Jede Kachel ist ein Filter: Klick auf «12 Dringend» zeigt genau diese zwölf. */
export function kacheln(z: HagelZahlen): Kachel[] {
  const basis: HagelFilter = { ...STANDARD_FILTER, status: 'alle', aktiv: 'alle' }
  return [
    { key: 'gesendet', wert: z.gesendet, label: 'Projekte angeschrieben',
      filter: { ...basis, status: 'angeschrieben' } },
    { key: 'beantwortet', wert: z.beantwortet, label: 'beantwortet',
      filter: { ...basis, status: 'beantwortet' } },
    { key: 'erledigt', wert: z.erledigt, label: 'davon erledigt gemeldet',
      filter: { ...basis, status: 'erledigt' } },
    { key: 'fotos', wert: z.fotos, label: 'Fotos erhalten',
      filter: { ...basis, nurFotos: true } },
    ...z.jePrioritaet.map(p => ({
      key: `prio:${p.key}`, wert: p.anzahl, label: p.label, rang: p.rang,
      filter: { ...basis, status: 'pendent' as UmfrageStatus, prioritaeten: [p.key] },
    })),
    { key: 'aktiv', wert: z.aktiv, label: 'aktiv',
      filter: { ...basis, aktiv: 'ja' } },
    { key: 'ohne_einsatz', wert: z.aktivOhneEinsatz, label: 'aktiv ohne Einsatz',
      filter: { ...basis, aktiv: 'ja', einsatz: 'nein' } },
    { key: 'einsatz', wert: z.einsatzGeplant, label: 'Einsatz geplant',
      filter: { ...basis, einsatz: 'ja' } },
  ]
}

export function kachelAktiv(k: Kachel, f: HagelFilter): boolean {
  return JSON.stringify({ ...f, suche: '' }) === JSON.stringify({ ...k.filter, suche: '' })
}

// ─── Anzeige ──────────────────────────────────────────────────────

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

/** «Mo 14.10.» — der Termin aus der Einsatzplanung, kurz. */
export function terminKurz(datum: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(datum || '')
  if (!m) return datum || ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${WOCHENTAGE[d.getDay()]} ${m[3]}.${m[2]}.`
}

/** «3 Objekte» bzw. «4 Elemente» — wie die Weiche auf der Kundenseite. */
export function umfang(z: HagelZeile): string {
  if (z.mehrere_objekte === 'ja' && z.anzahl_objekte) return `${z.anzahl_objekte} Objekte`
  if (z.anzahl_anlagen) return `${z.anzahl_anlagen} ${Number(z.anzahl_anlagen) === 1 ? 'Element' : 'Elemente'}`
  return ''
}

/** Farbklasse der Dringlichkeit: Rang 0 (dringendste) rot … 3 grün, erledigt grau. */
export function prioKlasse(z: HagelZeile, kampagne: HagelKampagne): string {
  if (z.status_key === 1) return 'hagel-prio-erledigt'
  const rang = kampagne.prioritaeten.find(o => o.key === z.prioritaet)?.rang
  return rang === undefined ? '' : `hagel-prio-${Math.min(rang, 3)}`
}

// ─── Gemerkter Filter (Komfort, je Konto) ─────────────────────────

const speicherKey = (userId: string) => `hagelschaden-filter:${userId}`

export function ladeFilter(userId: string): HagelFilter {
  try {
    const raw = localStorage.getItem(speicherKey(userId))
    if (!raw) return STANDARD_FILTER
    return { ...STANDARD_FILTER, ...JSON.parse(raw), suche: '' }
  } catch {
    return STANDARD_FILTER
  }
}

export function speichereFilter(userId: string, f: HagelFilter): void {
  try {
    localStorage.setItem(speicherKey(userId), JSON.stringify({ ...f, suche: '' }))
  } catch { /* privates Fenster o. ä. — der Filter gilt dann nur für diese Sitzung */ }
}

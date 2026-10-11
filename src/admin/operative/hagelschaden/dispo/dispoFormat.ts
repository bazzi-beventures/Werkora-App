// Hagelschaden-Disposition — kleine Anzeige-Helfer (rein).
// Spec: docs/specs/hagelschaden-disposition.md §10.

import type { VormerkungStatus } from '../../../../api/admin/hagelschadenDispo'

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

/** «Do 15.10.» */
export function tagKurz(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return iso || ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${WOCHENTAGE[d.getDay()]} ${m[3]}.${m[2]}.`
}

/** «07:10» aus «07:10:00» */
export function zeitKurz(t: string | null | undefined): string {
  return (t || '').slice(0, 5)
}

/** «1 h 35» bzw. «35 min» */
export function minuten(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '0 min'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min - h * 60)
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

export const STATUS_LABELS: Record<VormerkungStatus, string> = {
  vorgeschlagen: 'vorgeschlagen',
  angefragt: 'angefragt',
  bestaetigt: 'bestätigt',
  abgelehnt: 'passt nicht',
  freigegeben: 'freigegeben',
}

/** Equipenfarbe — gespeichert oder aus einer festen Palette nach Reihenfolge. */
export const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#4f46e5', '#65a30d']

/** Name zur Palettenfarbe, für die Auswahl im Dialog (ein Hex sagt dem Disponenten nichts). */
export const FARBNAMEN: Record<string, string> = {
  '#2563eb': 'Blau', '#16a34a': 'Grün', '#d97706': 'Orange', '#9333ea': 'Violett',
  '#dc2626': 'Rot', '#0891b2': 'Türkis', '#4f46e5': 'Indigo', '#65a30d': 'Oliv',
}

export function equipenFarbe(farbe: string | undefined, index: number): string {
  return farbe && /^#[0-9a-fA-F]{6}$/.test(farbe) ? farbe : PALETTE[index % PALETTE.length]
}

/** Nur Ziffern und «+» — für tel:-Links. */
export function telLink(nummer: string): string {
  return `tel:${nummer.replace(/[^\d+]/g, '')}`
}

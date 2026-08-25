// Rasterlogik des Tagesplans (Gantt) der Einsatzplanung: Mitarbeiter als Zeilen,
// Uhrzeit als waagrechte Achse über einen oder mehrere Tage.
//
// Gegenstück zu weekGrid.ts (dort läuft die Zeit senkrecht) — bewusst ohne
// React-Komponenten, damit Positionen, Lanes und Auslastung direkt unit-testbar
// sind.

import { hhmmToMin, minToHHMM, addDays } from './calendarHelpers'

export interface TimedEntry {
  id: string
  start_time: string | null
  end_time: string | null
}

// ─── Zoom (Breite einer Stunde) ──────────────────────────────────────────────
// Bei 5 sichtbaren Tagen × 11 Stunden bringt schon die kleinste Stufe rund
// 1300 px Raster — der Tagesplan scrollt darum waagrecht.

export const GANTT_ZOOM_LEVELS = [24, 36, 54, 80, 120] as const
export const GANTT_ZOOM_LABELS = ['Sehr kompakt', 'Kompakt', 'Mittel', 'Gross', 'Sehr gross'] as const
export const GANTT_ZOOM_DEFAULT = 2

// ─── Sichtbarer Zeitraum ─────────────────────────────────────────────────────

// Wählbare Anzahl Tage auf der Achse (wie im Screenshot: Tag / 3 Tage / 5 Tage).
export const GANTT_SPANS = [1, 3, 5] as const
export const GANTT_SPAN_LABELS: Record<number, string> = { 1: 'Tag', 3: '3 Tage', 5: '5 Tage' }
export const GANTT_SPAN_DEFAULT = 5

export function ganttDays(start: Date, span: number): Date[] {
  const out: Date[] = []
  for (let i = 0; i < span; i++) out.push(addDays(start, i))
  return out
}

// ─── Balken-Geometrie ────────────────────────────────────────────────────────

// Schmalster darstellbarer Balken (px) — auch ein 15-Minuten-Einsatz muss
// greif- und klickbar bleiben.
export const GANTT_MIN_BAR_PX = 14
// Höhe eines Balkens und Abstand zwischen zwei Lanes derselben Zeile.
// Der Balken trägt zwei Zeilen (Kürzel + Titel, darunter die Ortschaft); die
// Höhe ist fix, damit alle Zeilen gleich hoch bleiben, auch wenn eine Adresse
// fehlt. Wird die Höhe hier geändert, muss die CSS-Zeilenhöhe von
// .project-cal-gantt-bar mitziehen.
export const GANTT_BAR_H = 34
export const GANTT_LANE_GAP = 2
export const GANTT_ROW_PAD = 3
// Ab dieser Lückenbreite (px) zwischen zwei Balken passt das Distanz-Etikett
// ("→ 4.2 km") dazwischen. Darunter wird es weggelassen statt über die Balken
// gelegt.
export const GANTT_DIST_MIN_GAP_PX = 44

// Waagrechter Abstand einer Uhrzeit von der Tages-Rasterkante (startHour).
export function timeOffsetX(t: string, startHour: number, hourWidth: number): number {
  return Math.max(0, ((hhmmToMin(t) - startHour * 60) / 60) * hourWidth)
}

export function dayWidthPx(startHour: number, endHour: number, hourWidth: number): number {
  return (endHour - startHour) * hourWidth
}

// Position und Breite eines getakteten Einsatzes innerhalb der gesamten Achse.
// dayIndex = Spalte des Tages, auf dem der Balken liegt. Ohne Endzeit gilt eine
// Stunde; der Balken wird am Tagesende abgeschnitten statt in den Folgetag zu
// laufen.
export function barMetrics(
  p: TimedEntry,
  dayIndex: number,
  startHour: number,
  endHour: number,
  hourWidth: number,
): { leftPx: number; widthPx: number } {
  const dayW = dayWidthPx(startHour, endHour, hourWidth)
  const startMin = hhmmToMin(p.start_time!)
  const endMin = p.end_time ? hhmmToMin(p.end_time) : startMin + 60
  const left = Math.min(dayW, timeOffsetX(p.start_time!, startHour, hourWidth))
  const rawRight = ((Math.max(endMin, startMin) - startHour * 60) / 60) * hourWidth
  const right = Math.max(left, Math.min(dayW, rawRight))
  return {
    leftPx: dayIndex * dayW + left,
    widthPx: Math.max(GANTT_MIN_BAR_PX, right - left),
  }
}

// ─── Drop-Positionen ─────────────────────────────────────────────────────────

export const GANTT_SNAP_MIN = 15

// Achsen-X (px ab Rasteranfang) → Tages-Spalte. Auf den sichtbaren Bereich begrenzt.
export function xToDayIndex(x: number, dayCount: number, startHour: number, endHour: number, hourWidth: number): number {
  const dayW = dayWidthPx(startHour, endHour, hourWidth)
  if (dayW <= 0) return 0
  return Math.max(0, Math.min(dayCount - 1, Math.floor(x / dayW)))
}

// Achsen-X → auf 15 Minuten gerundete Uhrzeit innerhalb des getroffenen Tages.
// Links des Rasters (negatives x) gilt der Tagesanfang; rechts davon zählt die
// Position im getroffenen Tag — die Tages-Spalte selbst liefert xToDayIndex.
export function xToSnappedTime(x: number, startHour: number, endHour: number, hourWidth: number): string {
  const dayW = dayWidthPx(startHour, endHour, hourWidth)
  const inDay = dayW > 0 ? Math.max(0, x) % dayW : 0
  const abs = startHour * 60 + (inDay / hourWidth) * 60
  const snapped = Math.round(abs / GANTT_SNAP_MIN) * GANTT_SNAP_MIN
  return minToHHMM(Math.max(startHour * 60, Math.min(endHour * 60, snapped)))
}

// ─── Lanes (übereinander gestapelte Balken einer Zeile) ──────────────────────

// Überschneiden sich zwei Einsätze desselben Mitarbeiters zeitlich, liegen sie
// in derselben Zeile untereinander statt übereinander. Anders als im
// Wochenraster wird nichts geteilt — die Zeile wächst.
export function computeGanttLanes(entries: TimedEntry[]): Map<string, number> {
  const result = new Map<string, number>()
  const sorted = [...entries]
    .filter(p => p.start_time)
    .sort((a, b) => hhmmToMin(a.start_time!) - hhmmToMin(b.start_time!))
  const laneEnds: number[] = []
  for (const p of sorted) {
    const s = hhmmToMin(p.start_time!)
    const e = p.end_time ? Math.max(hhmmToMin(p.end_time), s + 1) : s + 60
    let lane = laneEnds.findIndex(end => end <= s)
    if (lane === -1) { laneEnds.push(e); lane = laneEnds.length - 1 }
    else laneEnds[lane] = e
    result.set(p.id, lane)
  }
  return result
}

export function laneCount(lanes: Map<string, number>): number {
  let max = 0
  for (const lane of lanes.values()) max = Math.max(max, lane + 1)
  return max
}

export function rowHeightPx(lanes: number): number {
  const n = Math.max(1, lanes)
  return n * GANTT_BAR_H + (n - 1) * GANTT_LANE_GAP + 2 * GANTT_ROW_PAD
}

// ─── Auslastung ──────────────────────────────────────────────────────────────

// Bezugsgrösse des Auslastungsgrads, falls der Mandant keine eigene
// Tages-Kapazität gesetzt hat (scheduling_config.day_capacity_hours).
export const GANTT_DAY_CAPACITY_FALLBACK_H = 8

// Geplante Minuten einer Zeile. Ganztägige Einsätze zählen als voller Arbeitstag
// (sie belegen den Mitarbeiter, haben aber keine Uhrzeit), getaktete mit ihrer
// Dauer; ohne Endzeit gilt eine Stunde.
export function plannedMinutes(entries: TimedEntry[], dayCapacityMin: number): number {
  let total = 0
  for (const p of entries) {
    if (!p.start_time) { total += dayCapacityMin; continue }
    const s = hhmmToMin(p.start_time)
    total += p.end_time ? Math.max(0, hhmmToMin(p.end_time) - s) : 60
  }
  return total
}

// Auslastungsgrad in Prozent (gerundet). Ohne Kapazität (nur Wochenende/Feiertage
// sichtbar) gibt es keine sinnvolle Bezugsgrösse → null.
export function utilizationPct(plannedMin: number, capacityMin: number): number | null {
  if (capacityMin <= 0) return null
  return Math.round((plannedMin / capacityMin) * 100)
}

// Ampel für das Auslastungs-Badge: bis 50 % ist der Tag offen (grün), danach
// wird die Farbe wärmer, über 100 % ist überbucht (rot).
export type UtilTone = 'idle' | 'low' | 'mid' | 'high' | 'over'

export function utilizationTone(pct: number | null): UtilTone {
  if (pct === null || pct <= 0) return 'idle'
  if (pct > 100) return 'over'
  if (pct >= 85) return 'high'
  if (pct >= 50) return 'mid'
  return 'low'
}

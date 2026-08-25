// Rasterlogik des Wochen-Zeitrasters der Einsatzplanung (Ansichten «Woche» und
// «Mitarbeiter»): sichtbarer Zeitbereich, Zoom-Stufen, Kachelhöhen, Lane-Layout
// für parallele Einsätze und das Zeilen-Budget einer Kachel.
//
// Bewusst ohne React-Komponenten — reine Funktionen, direkt unit-testbar.

import type { CSSProperties } from 'react'
import { hhmmToMin, minToHHMM } from './calendarHelpers'

// Nur die Felder, die das Raster braucht. Hält den Helfer unabhängig von der
// Projekt-Typdefinition aus dem Screen (Project passt strukturell hinein).
export interface TimedEntry {
  id: string
  start_time: string | null
  end_time: string | null
}

// ─── Sichtbarer Zeitbereich ──────────────────────────────────────────────────
// Das Raster zeigt immer mindestens 07:00–18:00 und wächst nur so weit, wie die
// angezeigte Woche es braucht. Vorher war es fix 06:00–20:00 — bei einer Woche
// von 07:30 bis 17:00 ging ein Drittel der Höhe an leere Randstunden, und ein
// Termin ausserhalb wurde an den Rand gequetscht. Die harten Grenzen fangen
// kaputte Zeiten (z.B. 00:00 aus einem Import) ab, statt das Raster auf 24
// Stunden aufzublähen.

const WEEK_HOURS_DEFAULT_START = 7
const WEEK_HOURS_DEFAULT_END = 18
const WEEK_HOURS_MIN = 4
const WEEK_HOURS_MAX = 23

// Ganztägige Einträge zählen nicht mit — die liegen im eigenen Strip über dem Raster.
export function computeWeekHours(entries: TimedEntry[]): { startHour: number; endHour: number } {
  let first = WEEK_HOURS_DEFAULT_START * 60
  let last = WEEK_HOURS_DEFAULT_END * 60
  for (const p of entries) {
    if (!p.start_time) continue
    const s = hhmmToMin(p.start_time)
    const e = p.end_time ? hhmmToMin(p.end_time) : s + 60
    if (s < first) first = s
    if (e > last) last = e
  }
  return {
    startHour: Math.max(WEEK_HOURS_MIN, Math.floor(first / 60)),
    endHour: Math.min(WEEK_HOURS_MAX, Math.ceil(last / 60)),
  }
}

// ─── Zoom ────────────────────────────────────────────────────────────────────
// Zeilenhöhe pro Stunde, vom Nutzer wählbar. Vorher fix 38 px: ein
// 30-Minuten-Termin bekam 19 px für Uhrzeit + Name + Zusatzfelder, alles
// Weitere wurde mitten in der Zeile abgeschnitten.

export const WEEK_ZOOM_LEVELS = [34, 44, 58, 76, 100] as const
export const WEEK_ZOOM_LABELS = ['Sehr kompakt', 'Kompakt', 'Mittel', 'Gross', 'Sehr gross'] as const
export const WEEK_ZOOM_DEFAULT = 2

// ─── Kachelhöhen ─────────────────────────────────────────────────────────────

// Kürzeste darstellbare Kachel bzw. Kachel ohne Endzeit (px).
const MIN_BLOCK_PX = 20
const OPEN_END_BLOCK_PX = 44

export function timeOffsetPx(t: string, startHour: number, hourHeight: number): number {
  const mins = hhmmToMin(t) - startHour * 60
  return Math.max(0, (mins / 60) * hourHeight)
}

// Gerenderte Höhe eines getakteten Blocks. Ohne Endzeit eine Stunde (mind. 44 px),
// sonst die Dauer mit einem Mindestmass, damit auch ein 15-Minuten-Termin
// klickbar bleibt.
export function timedBlockHeightPx(p: TimedEntry, hourHeight: number): number {
  if (!p.end_time) return Math.max(hourHeight, OPEN_END_BLOCK_PX)
  const mins = hhmmToMin(p.end_time) - hhmmToMin(p.start_time!)
  return Math.max(MIN_BLOCK_PX, (mins / 60) * hourHeight)
}

// ─── Drop-Uhrzeiten ──────────────────────────────────────────────────────────

// Raster für Drop-Uhrzeiten: auf 15-Minuten runden.
export const WEEK_SNAP_MIN = 15

// Wandelt eine spaltenrelative Y-Position (px ab Rasteroberkante = startHour) in
// eine gerundete, auf das sichtbare Raster begrenzte Startzeit 'HH:MM'.
export function yToSnappedTime(topPx: number, startHour: number, endHour: number, hourHeight: number): string {
  const abs = startHour * 60 + (topPx / hourHeight) * 60
  const snapped = Math.round(abs / WEEK_SNAP_MIN) * WEEK_SNAP_MIN
  return minToHHMM(Math.max(startHour * 60, Math.min(endHour * 60, snapped)))
}

// ─── Lane-Layout für parallele Einsätze ──────────────────────────────────────

// Effektive Block-Unterkante in Minuten für die Overlap-Erkennung. Ein kurzer
// Termin wird höher gerendert als seine Dauer (Mindesthöhe); diese Höhe rechnen
// wir in Minuten zurück, damit zeitlich knappe, aber visuell überlappende Blöcke
// getrennte Lanes bekommen statt sich zu überlagern.
function effectiveEndMin(ev: TimedEntry, hourHeight: number): number {
  const s = hhmmToMin(ev.start_time!)
  const actualEnd = ev.end_time ? hhmmToMin(ev.end_time) : s + 60
  return Math.max(actualEnd, s + (timedBlockHeightPx(ev, hourHeight) / hourHeight) * 60)
}

// Spalten-Layout für überlappende Events (Cluster-basiert, wie Google Calendar):
// Events, die sich zeitlich ODER visuell (Mindesthöhe) überlappen, kommen auf
// parallele Lanes. Overlap-Ende = effectiveEndMin (nicht die reine Endzeit).
export function computeLanes(events: TimedEntry[], hourHeight: number): Map<string, { col: number; total: number }> {
  const result = new Map<string, { col: number; total: number }>()
  const sorted = [...events].sort((a, b) => hhmmToMin(a.start_time!) - hhmmToMin(b.start_time!))

  let cluster: TimedEntry[] = []
  let clusterEnd = -1

  function flush() {
    if (cluster.length === 0) return
    const colEnds: number[] = []
    const assigns: number[] = []
    for (const ev of cluster) {
      const s = hhmmToMin(ev.start_time!)
      const e = effectiveEndMin(ev, hourHeight)
      let placed = -1
      for (let i = 0; i < colEnds.length; i++) {
        if (colEnds[i] <= s) { colEnds[i] = e; placed = i; break }
      }
      if (placed === -1) { colEnds.push(e); placed = colEnds.length - 1 }
      assigns.push(placed)
    }
    const total = colEnds.length
    cluster.forEach((ev, i) => result.set(ev.id, { col: assigns[i], total }))
    cluster = []
    clusterEnd = -1
  }

  for (const ev of sorted) {
    const s = hhmmToMin(ev.start_time!)
    const e = effectiveEndMin(ev, hourHeight)
    if (cluster.length === 0 || s >= clusterEnd) {
      flush()
      cluster.push(ev)
      clusterEnd = e
    } else {
      cluster.push(ev)
      clusterEnd = Math.max(clusterEnd, e)
    }
  }
  flush()
  return result
}

// Parallele Einsätze gestaffelt statt gleichmässig geteilt: bei drei
// Gleichzeitigen wäre jede Spalte nur ~55 px breit und der Projektname auf
// «261125 Heller…» gekürzt. Die Kacheln überlappen sich daher leicht (wie in
// Google Calendar) — jede bekommt gut die Hälfte mehr Breite, der Zeilenanfang
// bleibt sichtbar, und beim Überfahren kommt sie per z-index nach vorn.
const LANE_OVERLAP = 1.6

export function laneStyle(lane?: { col: number; total: number }): CSSProperties {
  if (!lane || lane.total <= 1) return {}
  const unit = 100 / lane.total
  const left = lane.col * unit
  const width = Math.min(unit * LANE_OVERLAP, 100 - left)
  // Prozente auf 3 Nachkommastellen — 33.33333333333333 % im style-Attribut
  // liest sich nur schlecht, sichtbar ist der Unterschied nicht.
  const pct = (n: number) => Number(n.toFixed(3))
  // Stapelreihenfolge als CSS-Variable, nicht als inline z-index: sonst gewinnt
  // der Inline-Wert gegen die :hover-Regel, und die verdeckte Kachel käme beim
  // Überfahren nicht nach vorn.
  return {
    left: `calc(${pct(left)}% + 2px)`,
    width: `calc(${pct(width)}% - 4px)`,
    right: 'auto',
    ['--lane-z' as string]: String(2 + lane.col),
  } as CSSProperties
}

// ─── Kachel-Budget ───────────────────────────────────────────────────────────
// Gerendert wird nur, was VOLLSTÄNDIG in die Kachel passt — lieber eine Zeile
// weniger als eine halb abgeschnittene. Die Zeilenhöhen entsprechen den
// Schriftgrössen in admin.css (.project-cal-week-event-*).

const TILE_PAD_Y = 9
const TILE_LINE_TIME = 13
const TILE_LINE_NAME = 14
const TILE_LINE_EXTRA = 13

export interface TileLayout {
  // true = Uhrzeit und Name teilen sich EINE Zeile; die Kachel ist zu flach für mehr.
  inline: boolean
  nameLines: number
  extraLines: number
}

export function tileLayout(heightPx: number, extraCount: number, laneTotal = 1): TileLayout {
  let rest = heightPx - TILE_PAD_Y
  if (rest < TILE_LINE_TIME + TILE_LINE_NAME) {
    return { inline: true, nameLines: 1, extraLines: 0 }
  }
  // Reihenfolge des Budgets: Uhrzeit, erste Namenszeile, Zusatzfelder, zweite
  // Namenszeile. Adresse/Kunde sind für die Disposition wichtiger als der
  // zweite Teil eines langen Projektnamens — der steht in der Hover-Karte.
  rest -= TILE_LINE_TIME + TILE_LINE_NAME
  // Drei oder mehr parallele Einsätze lassen kaum Textbreite übrig; dort
  // höchstens eine Zusatzzeile.
  const cap = laneTotal >= 3 ? Math.min(1, extraCount) : extraCount
  const extraLines = Math.max(0, Math.min(cap, Math.floor(rest / TILE_LINE_EXTRA)))
  rest -= extraLines * TILE_LINE_EXTRA
  return { inline: false, nameLines: rest >= TILE_LINE_NAME ? 2 : 1, extraLines }
}

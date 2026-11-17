// Ziel-Fläche beim Verschieben per Drag & Drop (Wunsch Betreiber 2026-11-17): wie in
// Google Kalender zeigt das Raster während des Ziehens eine hellblaue Fläche über
// die ganze Dauer, mit «08:00–10:00» — vorher war es nur eine Linie mit der
// Startzeit, und wie weit der Einsatz reicht, sah man erst nach dem Loslassen.
// Wochen-/Mitarbeiter-Ansicht (senkrecht) und Tagesplan (waagrecht) nutzen dieselbe
// Rechnung; die Fläche liegt schon auf dem 15-Minuten-Raster, wo der Drop landet.
import { hhmmToMin, minToHHMM } from '../utils/calendarHelpers'
import './dropGhost.css'

/** Dauer eines Einsatzes in Minuten; null = ganztägig oder ohne Endzeit. */
export function dragDauerMin(p: { start_time?: string | null; end_time?: string | null }): number | null {
  if (!p.start_time || !p.end_time) return null
  const d = hhmmToMin(p.end_time.slice(0, 5)) - hhmmToMin(p.start_time.slice(0, 5))
  return d > 0 ? d : null
}

/** «08:00–10:00», ohne bekannte Dauer nur die Startzeit. */
export function ghostLabel(start: string, dauerMin: number | null): string {
  return dauerMin ? `${start}–${minToHHMM(hhmmToMin(start) + dauerMin)}` : start
}

/** Ohne Dauer zeigt die Fläche eine halbe Stunde — sichtbar, aber nicht anmassend. */
export const GHOST_MIN_DAUER = 30

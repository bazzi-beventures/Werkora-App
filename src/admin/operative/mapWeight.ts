// Gewichtung und GeoJSON-Aufbereitung der Auftragskarte (Einsatzplanung).
//
// Reine Funktionen, kein React, kein MapLibre — damit die Rechnung ohne
// gerendertes Pixel prüfbar ist (mapWeight.test.ts).
//
// Spec: docs/specs/einsatzplanung-auftragskarte.md §3.3, §6

import { countWorkdays, diffDays } from '../utils/calendarHelpers'
import { hhmmToMin } from '../utils/calendarHelpers'
import type { CalendarEntry } from './scheduleShared'

// Minimale GeoJSON-Typen. Bewusst lokal statt @types/geojson: es sind sechs
// Zeilen, und die Datei soll ohne Kartenbibliothek testbar bleiben.
export interface MapFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { entryId: string; weight: number }
}

export interface MapFeatureCollection {
  type: 'FeatureCollection'
  features: MapFeature[]
}

export interface MapPoints {
  geojson: MapFeatureCollection
  /** Einträge im Zeitraum insgesamt — mit und ohne Koordinaten. */
  total: number
  /** Einträge ohne Punkt. Gehört in die Anzeige, nicht ins Log (§7.3). */
  ohneKoordinaten: number
  /** Nachschlagewerk für den Hover: entryId → Eintrag. */
  byId: Map<string, CalendarEntry>
}

/**
 * Aufwand eines Termins in **Personentagen** — das Gewicht eines Punktes auf
 * der Heatmap.
 *
 * Nicht «ein Termin = 1»: das ist der Unterschied zwischen «dort sind drei
 * Termine» und «dort hängt drei Wochen lang das halbe Team». Bei den paar
 * Dutzend Aufträgen einer Dreiwochen-Planung ist das der ganze Aussagewert der
 * Karte — eine reine Punktdichte zeigte nur, wo die Agglomeration liegt.
 *
 * @param dayCapacityHours Planbare Einsatzstunden pro Werktag
 *   (`scheduling_config.day_capacity_hours`, Default 8). Bezugsgrösse für
 *   Termine mit Zeitfenster, damit ein Zweistünder nicht wie ein ganzer Tag
 *   zählt.
 */
export function personentage(
  entry: CalendarEntry, canton: string, dayCapacityHours = 8,
): number {
  if (!entry.start_date) return 0
  const startISO = entry.start_date.slice(0, 10)
  const endISO = (entry.end_date ?? entry.start_date).slice(0, 10)

  // Ein Einsatz ohne zugewiesenen Monteur ist trotzdem geplante Arbeit an
  // einem Ort — er zählt als eine Person. Mit 0 verschwände er vollständig
  // von der Karte, und gerade die noch unbesetzten Aufträge will die
  // Disposition sehen.
  const crew = Math.max(1, entry.monteur_ids?.length ?? 0)

  const workdays = countWorkdays(startISO, endISO, canton)
  // Samstagseinsatz oder Arbeit am Feiertag: countWorkdays zählt 0, der Einsatz
  // existiert aber. Rückfall auf die Kalendertage, sonst fiele er aus der Karte.
  const days = workdays || diffDays(startISO, endISO) + 1

  // Zeitfenster nur dann als Bruchteil rechnen, wenn der Termin an einem Tag
  // liegt. Bei einem mehrtägigen Einsatz sind start_time/end_time die täglichen
  // Arbeitszeiten, nicht die Gesamtdauer — sie durch die Tageskapazität zu
  // teilen ergäbe dort einen Bruchteil statt mehrerer Tage.
  if (entry.start_time && entry.end_time && days <= 1) {
    const minutes = hhmmToMin(entry.end_time.slice(0, 5)) - hhmmToMin(entry.start_time.slice(0, 5))
    if (minutes > 0) {
      const capacity = dayCapacityHours > 0 ? dayCapacityHours : 8
      return crew * (minutes / 60 / capacity)
    }
  }
  return crew * days
}

function hasPoint(entry: CalendarEntry): boolean {
  return Number.isFinite(entry.object_lat) && Number.isFinite(entry.object_lon)
}

/**
 * Baut die Punktwolke der Karte aus den Kalender-Einträgen eines Zeitraums.
 *
 * Einträge ohne Koordinaten werden **gezählt, nicht verschwiegen**: eine Karte,
 * die drei Aufträge stillschweigend weglässt, ist als Planungsgrundlage
 * gefährlicher als gar keine (§7.3).
 */
export function buildMapPoints(
  entries: CalendarEntry[], canton: string, dayCapacityHours = 8,
): MapPoints {
  const features: MapFeature[] = []
  const byId = new Map<string, CalendarEntry>()
  let ohneKoordinaten = 0

  for (const entry of entries) {
    if (!hasPoint(entry)) {
      ohneKoordinaten++
      continue
    }
    byId.set(entry.id, entry)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [entry.object_lon as number, entry.object_lat as number] },
      // MapLibre reicht nur Primitive durch die Layer-Ausdrücke. Der ganze
      // Eintrag liegt deshalb in `byId`; das Feature trägt nur den Schlüssel.
      properties: { entryId: entry.id, weight: personentage(entry, canton, dayCapacityHours) },
    })
  }

  return {
    geojson: { type: 'FeatureCollection', features },
    total: entries.length,
    ohneKoordinaten,
    byId,
  }
}

/** Summe der Personentage einer Auswahl — für die Aggregat-Karte im Hover (§7.4). */
export function summeGewichte(features: MapFeature[]): number {
  return features.reduce((sum, f) => sum + f.properties.weight, 0)
}

/**
 * Bounding-Box über alle Punkte: `[[west, süd], [ost, nord]]`.
 * `null` bei keinem Punkt — die Karte zeigt dann die ganze Schweiz.
 */
export function boundsOf(
  features: MapFeature[],
): [[number, number], [number, number]] | null {
  if (!features.length) return null
  let west = Infinity, sued = Infinity, ost = -Infinity, nord = -Infinity
  for (const f of features) {
    const [lon, lat] = f.geometry.coordinates
    if (lon < west) west = lon
    if (lon > ost) ost = lon
    if (lat < sued) sued = lat
    if (lat > nord) nord = lat
  }
  return [[west, sued], [ost, nord]]
}

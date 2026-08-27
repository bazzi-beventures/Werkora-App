// Tests der Gewichtung und GeoJSON-Aufbereitung der Auftragskarte.
//
// Der Kern ist `personentage`: die Zahl entscheidet, wie heiss ein Ort auf der
// Karte wird. Eine falsche Rechnung fällt niemandem auf — ein Farbverlauf sieht
// immer plausibel aus. Deshalb steht hier jeder Fall einzeln.
//
// Spec: docs/specs/einsatzplanung-auftragskarte.md §3.3

import { describe, expect, it } from 'vitest'
import { boundsOf, buildMapPoints, personentage, summeGewichte } from './mapWeight'
import type { CalendarEntry } from './scheduleShared'

// Minimaler Eintrag — die Felder, die keine Rolle spielen, interessieren die
// gepruefte Funktion nicht.
function entry(over: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: 'a1',
    name: 'Sanierung Bad',
    kind: 'project',
    monteur_ids: [],
    start_date: '2026-09-07',   // Montag
    end_date: '2026-09-07',
    start_time: null,
    end_time: null,
    object_lat: 47.3769,
    object_lon: 8.5417,
    ...over,
  } as unknown as CalendarEntry
}

describe('personentage', () => {
  it('ganztaegiger Einsatz mit drei Monteuren zaehlt drei Personentage', () => {
    expect(personentage(entry({ monteur_ids: ['a', 'b', 'c'] }), 'ZH')).toBe(3)
  })

  it('mehrtaegig ueber ein Wochenende zaehlt nur die Werktage', () => {
    // Fr 04.09. bis Mo 07.09. — Sa/So fallen raus, bleiben zwei Werktage.
    const e = entry({ start_date: '2026-09-04', end_date: '2026-09-07', monteur_ids: ['a', 'b'] })
    expect(personentage(e, 'ZH')).toBe(4)
  })

  it('ein Feiertag im Zeitraum zaehlt nicht mit — und zwar kantonal', () => {
    // Fronleichnam 2026 = 04.06. Katholischer Kanton: der Tag faellt weg;
    // in Zuerich ist es ein normaler Donnerstag. Genau dafuer haengt der
    // Kanton am Mandanten.
    const e = entry({ start_date: '2026-06-01', end_date: '2026-06-05' })  // Mo–Fr
    expect(personentage(e, 'ZH')).toBe(5)
    expect(personentage(e, 'LU')).toBe(4)
  })

  it('Termin mit Zeitfenster zaehlt anteilig zur Tageskapazitaet', () => {
    // 08:00–12:00 = 4 h von 8 h => ein halber Personentag.
    const e = entry({ start_time: '08:00', end_time: '12:00' })
    expect(personentage(e, 'ZH')).toBeCloseTo(0.5)
  })

  it('abweichende Tageskapazitaet des Mandanten wird verwendet', () => {
    const e = entry({ start_time: '08:00', end_time: '12:00' })
    expect(personentage(e, 'ZH', 4)).toBeCloseTo(1)
  })

  it('bei mehrtaegigem Einsatz sind Uhrzeiten Tageszeiten, keine Gesamtdauer', () => {
    // Mo–Mi je 08:00–17:00: drei Tage, nicht ein Bruchteil eines Tages.
    const e = entry({ start_date: '2026-09-07', end_date: '2026-09-09', start_time: '08:00', end_time: '17:00' })
    expect(personentage(e, 'ZH')).toBe(3)
  })

  it('Samstagseinsatz faellt nicht aus der Karte', () => {
    // countWorkdays zaehlt hier 0 — der Einsatz existiert trotzdem und muss
    // ein Gewicht bekommen, sonst waere er unsichtbar.
    const e = entry({ start_date: '2026-09-05', end_date: '2026-09-05' })  // Samstag
    expect(personentage(e, 'ZH')).toBe(1)
  })

  it('Einsatz ohne zugewiesenen Monteur zaehlt als eine Person', () => {
    // Gerade die unbesetzten Auftraege will die Disposition sehen.
    expect(personentage(entry({ monteur_ids: [] }), 'ZH')).toBe(1)
  })

  it('ohne Startdatum kein Gewicht', () => {
    expect(personentage(entry({ start_date: null }), 'ZH')).toBe(0)
  })

  it('end_date fehlt => eintaegig', () => {
    expect(personentage(entry({ end_date: null }), 'ZH')).toBe(1)
  })

  it('unsinniges Zeitfenster (Ende vor Beginn) faellt auf ganzen Tag zurueck', () => {
    const e = entry({ start_time: '17:00', end_time: '08:00' })
    expect(personentage(e, 'ZH')).toBe(1)
  })
})

describe('buildMapPoints', () => {
  it('macht aus jedem Eintrag mit Koordinaten ein Feature', () => {
    const points = buildMapPoints([entry({ id: 'a1' }), entry({ id: 'a2' })], 'ZH')
    expect(points.geojson.features).toHaveLength(2)
    expect(points.geojson.features[0].geometry.coordinates).toEqual([8.5417, 47.3769])
    expect(points.ohneKoordinaten).toBe(0)
  })

  it('GeoJSON-Reihenfolge ist [lon, lat], nicht [lat, lon]', () => {
    // Die haeufigste Verwechslung ueberhaupt — vertauscht laege Zuerich im Sudan.
    const [lon, lat] = buildMapPoints([entry()], 'ZH').geojson.features[0].geometry.coordinates
    expect(lon).toBeCloseTo(8.5417)
    expect(lat).toBeCloseTo(47.3769)
  })

  it('zaehlt Eintraege ohne Koordinaten, statt sie zu verschweigen', () => {
    const points = buildMapPoints([
      entry({ id: 'a1' }),
      entry({ id: 'a2', object_lat: null, object_lon: null }),
      entry({ id: 'a3', object_lat: undefined, object_lon: undefined }),
    ], 'ZH')
    expect(points.total).toBe(3)
    expect(points.geojson.features).toHaveLength(1)
    expect(points.ohneKoordinaten).toBe(2)
  })

  it('byId erlaubt den Ruecksprung vom Feature auf den Eintrag (Hover)', () => {
    const points = buildMapPoints([entry({ id: 'termin-7', name: 'Dachfenster' })], 'ZH')
    const featureId = points.geojson.features[0].properties.entryId
    expect(points.byId.get(featureId)?.name).toBe('Dachfenster')
  })

  it('leere Liste ergibt eine leere FeatureCollection, keinen Fehler', () => {
    const points = buildMapPoints([], 'ZH')
    expect(points.geojson.features).toEqual([])
    expect(points.total).toBe(0)
  })
})

describe('summeGewichte / boundsOf', () => {
  it('summiert die Personentage der Auswahl', () => {
    const points = buildMapPoints([
      entry({ id: 'a1', monteur_ids: ['a', 'b'] }),
      entry({ id: 'a2', monteur_ids: ['c'] }),
    ], 'ZH')
    expect(summeGewichte(points.geojson.features)).toBe(3)
  })

  it('spannt die Bounding-Box ueber alle Punkte', () => {
    const points = buildMapPoints([
      entry({ id: 'a1', object_lat: 47.0, object_lon: 8.0 }),
      entry({ id: 'a2', object_lat: 46.5, object_lon: 9.5 }),
    ], 'ZH')
    expect(boundsOf(points.geojson.features)).toEqual([[8.0, 46.5], [9.5, 47.0]])
  })

  it('ohne Punkte gibt es keine Box — die Karte zeigt dann die ganze Schweiz', () => {
    expect(boundsOf([])).toBeNull()
  })
})

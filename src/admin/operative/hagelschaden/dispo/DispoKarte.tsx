// Hagelschaden-Disposition — Touren auf der Karte.
// Spec: docs/specs/hagelschaden-disposition.md §10.1.
//
// Per React.lazy nachgeladen (PlanAnsicht) — maplibre-gl wiegt rund 250 KB gzip
// und gehört nicht in das Bundle jedes Admin-Screens; dieselbe Regel wie
// ProjectScheduleMap. Linien folgen der Luftlinie zwischen den Stopps: die
// Karte zeigt Reihenfolge und Gegend, keine Strassenroute.

import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { DispoPlan, DispoTour } from '../../../../api/admin/hagelschadenDispo'

const SWISSTOPO_STYLE =
  'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte-grey.vt/style.json'
const ATTRIBUTION = '© swisstopo'
const SCHWEIZ: [[number, number], [number, number]] = [[5.9, 45.8], [10.5, 47.8]]

type Feature = {
  type: 'Feature'
  properties: Record<string, string | number>
  geometry: { type: 'LineString'; coordinates: [number, number][] } | { type: 'Point'; coordinates: [number, number] }
}

export function kartenDaten(plan: DispoPlan, tag: string, farbe: (t: DispoTour) => string): { linien: Feature[]; punkte: Feature[] } {
  const linien: Feature[] = []
  const punkte: Feature[] = []
  const depot: [number, number] | null = plan.depot ? [plan.depot.lon, plan.depot.lat] : null
  for (const t of plan.tage) {
    if (tag !== 'alle' && t.datum !== tag) continue
    for (const tour of t.touren) {
      const f = farbe(tour)
      const coords: [number, number][] = tour.stopps.map(s => [s.lon, s.lat])
      linien.push({
        type: 'Feature', properties: { farbe: f },
        geometry: { type: 'LineString', coordinates: depot ? [depot, ...coords, depot] : coords },
      })
      tour.stopps.forEach((s, i) => punkte.push({
        type: 'Feature',
        properties: { farbe: f, nr: String(i + 1), titel: `${s.start} ${s.projekt_nr} ${s.projekt_name}` },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      }))
    }
  }
  return { linien, punkte }
}

export default function DispoKarte({ plan, tag, farbe }: {
  plan: DispoPlan
  tag: string
  farbe: (t: DispoTour) => string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [bereit, setBereit] = useState(false)
  const [fehler, setFehler] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    let map: MapLibreMap
    try {
      map = new maplibregl.Map({
        container: ref.current, style: SWISSTOPO_STYLE, bounds: SCHWEIZ,
        attributionControl: { customAttribution: ATTRIBUTION },
      })
    } catch {
      setFehler(true)
      return
    }
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('error', () => setFehler(true))
    map.on('load', () => {
      // Der Rand folgt dem Token wie in ProjectScheduleMap (Canvas kennt kein CSS);
      // die Nummer steht auf der Equipen-Farbe, die in beiden Themes gleich ist.
      const rand = getComputedStyle(document.documentElement).getPropertyValue('--map-point-stroke').trim() || 'white'
      map.addSource('touren', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('stopps', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'touren-linie', type: 'line', source: 'touren',
        paint: { 'line-color': ['get', 'farbe'], 'line-width': 3, 'line-opacity': 0.75 } })
      map.addLayer({ id: 'stopps-kreis', type: 'circle', source: 'stopps',
        paint: { 'circle-radius': 10, 'circle-color': ['get', 'farbe'], 'circle-stroke-color': rand,
          'circle-stroke-width': 2 } })
      map.addLayer({ id: 'stopps-nr', type: 'symbol', source: 'stopps',
        layout: { 'text-field': ['get', 'nr'], 'text-size': 11, 'text-allow-overlap': true },
        paint: { 'text-color': 'white' } })
      setBereit(true)
    })
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !bereit) return
    const { linien, punkte } = kartenDaten(plan, tag, farbe)
    ;(map.getSource('touren') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: linien } as never)
    ;(map.getSource('stopps') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: punkte } as never)
    const pts = punkte.map(p => p.geometry.coordinates as [number, number])
    if (plan.depot) pts.push([plan.depot.lon, plan.depot.lat])
    if (pts.length) {
      const lons = pts.map(p => p[0]); const lats = pts.map(p => p[1])
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 40, maxZoom: 13, duration: 300 })
    }
  }, [plan, tag, farbe, bereit])

  if (fehler) return <div className="admin-table-empty">Die Karte lässt sich auf diesem Gerät nicht anzeigen.</div>
  return <div ref={ref} className="dispo-karte" role="img" aria-label="Karte der Touren" />
}

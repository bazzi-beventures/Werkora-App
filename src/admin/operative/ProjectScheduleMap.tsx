// Auftragskarte der Einsatzplanung — Dichte-Heatmap auf Schweizer Karte.
//
// Diese Datei wird per React.lazy nachgeladen (siehe ProjectScheduleCalendar).
// Das ist load-bearing: der Chunk wiegt gebaut 250 KB gzip (maplibre-gl) plus
// 11 KB CSS und braucht WebGL. Ein statischer Import hier zöge das in das
// Bundle JEDES Admin-Screens und damit über die Leitung jedes Monteurs, der
// nie eine Karte sieht.
//
// Spec: docs/specs/einsatzplanung-auftragskarte.md §7

import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import EventHoverCard from './EventHoverCard'
import { boundsOf, buildMapPoints, summeGewichte, type MapFeature } from './mapWeight'
import { shiftISO, toDateStr } from '../utils/calendarHelpers'
import { useTheme } from '../../theme'
import type { CalendarEntry, HoverState, StaffLite } from './scheduleShared'

// Leichte Basiskarte von swisstopo, graue Variante: die Heat-Farben müssen sich
// vom Untergrund abheben. Auf der bunten Landeskarte konkurrieren Kartenfarben
// und Heat-Rampe, und die Verdichtung ist nicht mehr ablesbar.
const SWISSTOPO_STYLE =
  'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte-grey.vt/style.json'

// Quellenangabe ist Auflage der swisstopo-Nutzungsbedingungen, nicht Kür.
const ATTRIBUTION = '© swisstopo'

// Ganze Schweiz — Startausschnitt, wenn es keinen einzigen Punkt gibt.
const SCHWEIZ_BOUNDS: [[number, number], [number, number]] = [[5.9, 45.8], [10.5, 47.8]]

const SOURCE_ID = 'auftraege'
const HEAT_LAYER = 'auftraege-heat'
const POINT_LAYER = 'auftraege-punkte'

// Ab hier werden die Punkte sichtbar. Darunter bleiben sie transparent, aber
// treffbar — sonst müsste der Planer auf gut Glück über die Fläche wischen.
const PUNKTE_SICHTBAR_AB_ZOOM = 13

// Gleiche Verzögerung wie die Kalender-Kacheln (scheduleShared HOVER_DELAY_MS):
// beim Überstreichen mehrerer Punkte sollen keine Karten aufblitzen.
const HOVER_DELAY_MS = 220

// Die Farben kommen aus den Design-Tokens (admin/tokens.css), nicht als
// Literale hierher: MapLibre braucht konkrete Farbwerte, und ein Hex im
// Kartencode bliebe hell, wenn der Nutzer auf dunkel schaltet. Gelesen wird
// beim Aufbau und erneut bei jedem Theme-Wechsel.
const FARB_TOKENS = [
  '--map-heat-1', '--map-heat-2', '--map-heat-3', '--map-heat-4',
  '--map-point', '--map-point-stroke',
] as const

type Farben = Record<(typeof FARB_TOKENS)[number], string>

// Rueckfall, falls ein Token fehlt. MapLibre wirft bei einem leeren Farbwert
// und riss damit die ganze Karte mit — ein fehlendes Token darf hoechstens
// die Farbe kosten, nicht die Ansicht. Bewusst rgba() statt Hex: ein
// Hex-Literal im TSX zaehlt gegen das Budget in scripts/token-gate.mjs, und
// zu Recht — es waere hier aber die Notbremse und nicht der Regelfall.
const FARB_FALLBACK: Farben = {
  '--map-heat-1': 'rgba(254, 240, 138, 0.55)',
  '--map-heat-2': 'rgba(251, 176, 59, 0.68)',
  '--map-heat-3': 'rgba(240, 118, 42, 0.80)',
  '--map-heat-4': 'rgba(203, 45, 40, 0.88)',
  '--map-point': 'rgba(203, 45, 40, 1)',
  '--map-point-stroke': 'rgba(255, 255, 255, 1)',
}

function leseFarben(): Farben {
  const stil = getComputedStyle(document.documentElement)
  const out = {} as Farben
  for (const token of FARB_TOKENS) {
    out[token] = stil.getPropertyValue(token).trim() || FARB_FALLBACK[token]
  }
  return out
}

function heatmapFarbe(f: Farben) {
  return [
    'interpolate', ['linear'], ['heatmap-density'],
    0,    'rgba(0,0,0,0)',
    0.2,  f['--map-heat-1'],
    0.45, f['--map-heat-2'],
    0.7,  f['--map-heat-3'],
    1,    f['--map-heat-4'],
  ]
}

const PERIODEN = [
  { wochen: 1, label: '1 Woche' },
  { wochen: 3, label: '3 Wochen' },
  { wochen: 6, label: '6 Wochen' },
] as const

const PERIOD_KEY = 'schedule-map-period'
const PERIOD_DEFAULT = 3

function readPeriod(): number {
  try {
    const raw = window.localStorage.getItem(PERIOD_KEY)
    const n = raw === null ? NaN : parseInt(raw, 10)
    return PERIODEN.some(p => p.wochen === n) ? n : PERIOD_DEFAULT
  } catch {
    // Private-Mode oder voller Storage darf die Karte nicht blockieren.
    return PERIOD_DEFAULT
  }
}

/** Mehrere Aufträge unter dem Zeiger — dann sagt die Karte, wie viele. */
interface AggregatState {
  anzahl: number
  personentage: number
  von: string
  bis: string
  x: number
  y: number
}

export default function ProjectScheduleMap({
  projects, staff, canton, dayCapacityHours, onOpenProject,
}: {
  /** Kalender-Einträge (ein Eintrag je Termin), bereits nach Monteur gefiltert. */
  projects: CalendarEntry[]
  staff: StaffLite[]
  canton: string
  dayCapacityHours: number
  onOpenProject?: (entry: CalendarEntry) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const hoverTimerRef = useRef<number | null>(null)
  // Der jeweils aktuelle Punktbestand für die Event-Handler. Die Handler werden
  // einmal registriert und dürfen deshalb nicht auf einen Render-Wert schliessen.
  const pointsRef = useRef<{ byId: Map<string, CalendarEntry> }>({ byId: new Map() })

  const theme = useTheme()
  const [wochen, setWochen] = useState(readPeriod)
  const [ready, setReady] = useState(false)
  const [ladefehler, setLadefehler] = useState(false)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [aggregat, setAggregat] = useState<AggregatState | null>(null)

  // Heute einmal beim Mounten festhalten. Gleiches Muster wie `currentDate` im
  // Kalender — und die Karte lebt nie über Mitternacht hinaus offen.
  const [heute] = useState(() => toDateStr(new Date()))
  const bis = shiftISO(heute, wochen * 7 - 1)

  // Einträge des Zeitraums: alles, was sich mit [heute, bis] überschneidet —
  // nicht nur, was darin beginnt. Ein Einsatz, der letzte Woche angefangen hat
  // und noch läuft, bindet diese Woche Leute und gehört auf die Karte.
  const imZeitraum = useMemo(
    () => projects.filter(p => {
      if (!p.start_date) return false
      const von = p.start_date.slice(0, 10)
      const endet = (p.end_date ?? p.start_date).slice(0, 10)
      return von <= bis && endet >= heute
    }),
    [projects, heute, bis],
  )

  const points = useMemo(
    () => buildMapPoints(imZeitraum, canton, dayCapacityHours),
    [imZeitraum, canton, dayCapacityHours],
  )

  function changePeriod(next: number) {
    setWochen(next)
    setHover(null)
    setAggregat(null)
    try { window.localStorage.setItem(PERIOD_KEY, String(next)) } catch { /* egal */ }
  }

  // ── Karte aufbauen (einmal) ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    let map: MapLibreMap
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: SWISSTOPO_STYLE,
        bounds: SCHWEIZ_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        attributionControl: { customAttribution: ATTRIBUTION },
      })
    } catch {
      // Kein WebGL (alte Maschine, abgeschaltete Hardwarebeschleunigung).
      setLadefehler(true)
      return
    }
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('error', () => setLadefehler(true))

    map.on('load', () => {
      map.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

      map.addLayer({
        id: HEAT_LAYER,
        type: 'heatmap',
        source: SOURCE_ID,
        paint: {
          // Gewicht = Personentage (mapWeight). Bei 20 Personentagen ist der
          // Deckel erreicht — darüber wird ein Ort nicht noch röter, sonst
          // erschlüge ein Grossprojekt die ganze übrige Karte.
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 20, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 3],
          // Zoomabhängiger Radius: ohne ihn ist bei Kantonszoom alles ein
          // Fleck und bei Strassenzoom nichts mehr zu sehen.
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 6, 12, 10, 26, 14, 48],
          'heatmap-color': heatmapFarbe(leseFarben()) as never,
          // Beim Hineinzoomen tritt die Fläche zurück und die Punkte übernehmen.
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'],
            PUNKTE_SICHTBAR_AB_ZOOM, 0.85, 16, 0.35],
        },
      })

      map.addLayer({
        id: POINT_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          // Grosszügiger als der sichtbare Punkt: das hier ist die
          // Trefferfläche für Hover und Tap.
          'circle-radius': 10,
          'circle-color': leseFarben()['--map-point'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': leseFarben()['--map-point-stroke'],
          // Unsichtbar, aber weiterhin per queryRenderedFeatures treffbar —
          // Deckkraft 0 schliesst ein Feature nicht von der Abfrage aus.
          'circle-opacity': ['interpolate', ['linear'], ['zoom'],
            PUNKTE_SICHTBAR_AB_ZOOM - 0.5, 0, PUNKTE_SICHTBAR_AB_ZOOM + 0.5, 0.9],
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'],
            PUNKTE_SICHTBAR_AB_ZOOM - 0.5, 0, PUNKTE_SICHTBAR_AB_ZOOM + 0.5, 1],
        },
      })
      setReady(true)
    })

    return () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Punkte einspielen und Ausschnitt setzen ───────────────────────────────
  useEffect(() => {
    pointsRef.current = { byId: points.byId }
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
    if (!source) return
    source.setData(points.geojson)

    const box = boundsOf(points.geojson.features)
    map.fitBounds(box ?? SCHWEIZ_BOUNDS, { padding: 48, maxZoom: 12, duration: 400 })
    setHover(null)
    setAggregat(null)
  }, [points, ready])

  // ── Farben beim Theme-Wechsel nachziehen ──────────────────────────────────
  // MapLibre rendert auf ein Canvas: die Layer-Farben sind zur Zeichenzeit
  // eingefroren und folgen keinem CSS. Ohne diesen Effekt bliebe die Karte in
  // den Farben stehen, die beim Aufbau galten.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const farben = leseFarben()
    map.setPaintProperty(HEAT_LAYER, 'heatmap-color', heatmapFarbe(farben) as never)
    map.setPaintProperty(POINT_LAYER, 'circle-color', farben['--map-point'])
    map.setPaintProperty(POINT_LAYER, 'circle-stroke-color', farben['--map-point-stroke'])
  }, [theme, ready])

  // ── Hover, Tap und Doppelklick ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const cancelTimer = () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
    }

    /** Baut aus der Pixelposition des Punktes ein DOMRect für die Hover-Karte.
     *  EventHoverCard positioniert sich daraus wie über einer Kalender-Kachel —
     *  auf dem Canvas gibt es kein Element mit getBoundingClientRect(). */
    const rectAt = (clientX: number, clientY: number): DOMRect => {
      return new DOMRect(clientX - 6, clientY - 6, 12, 12)
    }

    const zeige = (features: MapGeoJSONFeature[], clientX: number, clientY: number) => {
      if (!features.length) return
      if (features.length > 1) {
        // Mehrere Aufträge auf demselben Pixel: eine willkürlich
        // herausgegriffene Einzelkarte wäre irreführend.
        const alsMapFeatures = features.map(f => ({
          properties: { weight: Number(f.properties?.weight) || 0 },
        })) as MapFeature[]
        const eintraege = features
          .map(f => pointsRef.current.byId.get(String(f.properties?.entryId)))
          .filter((e): e is CalendarEntry => !!e)
        const daten = eintraege
          .map(e => (e.start_date ?? '').slice(0, 10))
          .filter(Boolean)
          .sort()
        setHover(null)
        setAggregat({
          anzahl: features.length,
          personentage: summeGewichte(alsMapFeatures),
          von: daten[0] ?? '',
          bis: daten[daten.length - 1] ?? '',
          x: clientX,
          y: clientY,
        })
        return
      }
      const entry = pointsRef.current.byId.get(String(features[0].properties?.entryId))
      if (!entry) return
      setAggregat(null)
      setHover({ entry, rect: rectAt(clientX, clientY) })
    }

    const onMove = (e: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer'
      cancelTimer()
      const { x, y } = e.originalEvent
      const features = map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER] })
      hoverTimerRef.current = window.setTimeout(() => zeige(features, x, y), HOVER_DELAY_MS)
    }

    const onLeave = () => {
      map.getCanvas().style.cursor = ''
      cancelTimer()
      setHover(null)
      setAggregat(null)
    }

    // Auf dem Tablet gibt es kein Hover — dort ist der Tap der Auslöser für
    // denselben Inhalt. Ein Tap daneben schliesst wieder.
    const onClick = (e: maplibregl.MapMouseEvent) => {
      cancelTimer()
      const features = map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER] })
      if (!features.length) {
        setHover(null)
        setAggregat(null)
        return
      }
      zeige(features, e.originalEvent.x, e.originalEvent.y)
    }

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER] })
      if (features.length !== 1) return
      const entry = pointsRef.current.byId.get(String(features[0].properties?.entryId))
      // Der ganze Eintrag, nicht seine id: die ist die TERMIN-ID. Der Screen
      // loest sie ueber resolveEntryProject aufs Projekt auf — genau wie bei
      // einem Doppelklick auf eine Kalender-Kachel.
      if (entry) onOpenProject?.(entry)
    }

    map.on('mousemove', POINT_LAYER, onMove)
    map.on('mouseleave', POINT_LAYER, onLeave)
    map.on('click', onClick)
    map.on('dblclick', POINT_LAYER, onDblClick)
    return () => {
      map.off('mousemove', POINT_LAYER, onMove)
      map.off('mouseleave', POINT_LAYER, onLeave)
      map.off('click', onClick)
      map.off('dblclick', POINT_LAYER, onDblClick)
      cancelTimer()
    }
  }, [ready, onOpenProject])

  const fmt = (iso: string) =>
    iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' }) : ''

  return (
    <div className="project-map">
      <div className="project-map-toolbar">
        <div className="project-map-periods">
          {PERIODEN.map(p => (
            <button
              key={p.wochen}
              className={`admin-btn admin-btn-sm ${wochen === p.wochen ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
              onClick={() => changePeriod(p.wochen)}
            >{p.label}</button>
          ))}
        </div>
        <div className="project-map-counts">
          <strong>{points.total}</strong> {points.total === 1 ? 'Einsatz' : 'Einsätze'} ab {fmt(heute)}
          {points.ohneKoordinaten > 0 && (
            <span className="project-map-warn" title="Adresse nicht gefunden oder ausserhalb der Schweiz">
              {' · '}{points.ohneKoordinaten} ohne Standort
            </span>
          )}
        </div>
      </div>

      {ladefehler ? (
        <div className="admin-empty">
          Karte konnte nicht geladen werden. Die Einsätze stehen unverändert in den
          übrigen Ansichten.
        </div>
      ) : (
        <div className="project-map-canvas-wrap">
          <div ref={containerRef} className="project-map-canvas" />
          {ready && points.total === 0 && (
            <div className="project-map-overlay">Keine Einsätze in diesem Zeitraum.</div>
          )}
          {ready && points.total > 0 && points.geojson.features.length === 0 && (
            <div className="project-map-overlay">
              Kein Einsatz dieses Zeitraums hat eine gefundene Adresse.
            </div>
          )}
        </div>
      )}

      <div className="project-map-legend">
        <span className="project-map-scale" aria-hidden="true" />
        <span>wenig gebundene Mannschaft</span>
        <span className="project-map-legend-sep">→</span>
        <span>viel</span>
        <span className="project-map-legend-hint">
          Gewichtet nach Personentagen (Monteure × Werktage). Ab Zoomstufe {PUNKTE_SICHTBAR_AB_ZOOM} erscheinen
          die einzelnen Einsätze — Doppelklick öffnet das Projekt.
        </span>
      </div>

      {hover && <EventHoverCard hover={hover} staff={staff} />}
      {aggregat && (
        <div
          className="project-cal-hovercard project-map-aggregat"
          role="tooltip"
          style={{ left: Math.max(8, aggregat.x + 12), top: Math.max(8, aggregat.y - 8) }}
        >
          <div className="project-cal-hovercard-head">
            <strong>{aggregat.anzahl} Einsätze</strong>
          </div>
          <div className="project-cal-hovercard-row">
            <span className="project-cal-hovercard-label">Aufwand</span>
            <span>{Math.round(aggregat.personentage * 10) / 10} Personentage</span>
          </div>
          {aggregat.von && (
            <div className="project-cal-hovercard-row">
              <span className="project-cal-hovercard-label">Zeitraum</span>
              <span>{fmt(aggregat.von)} – {fmt(aggregat.bis)}</span>
            </div>
          )}
          <div className="project-map-aggregat-hint">Zum Aufschlüsseln hineinzoomen</div>
        </div>
      )}
    </div>
  )
}

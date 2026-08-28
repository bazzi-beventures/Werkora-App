// Auftragskarte der Einsatzplanung — Einsätze als Cluster mit Anzahl.
//
// Diese Datei wird per React.lazy nachgeladen (siehe ProjectScheduleCalendar).
// Das ist load-bearing: maplibre-gl wiegt rund 250 KB gzip und braucht WebGL.
// Ein statischer Import hier zöge es in das Bundle JEDES Admin-Screens und
// damit über die Leitung jedes Monteurs, der nie eine Karte sieht.
//
// Warum Cluster und nicht die frühere Dichte-Heatmap: ein Farbverlauf über die
// paar Dutzend Aufträge einer Dreiwochen-Planung zeigt vor allem, wo die
// Agglomeration liegt — das weiss die Disposition. Eine Zahl im Kreis
// beantwortet die eigentliche Frage («wie viele hängen dort?») direkt, und
// Hineinzoomen löst sie in die einzelnen Einsätze auf.
//
// Spec: docs/specs/einsatzplanung-auftragskarte.md §7

import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import EventHoverCard from './EventHoverCard'
import { boundsOf, buildMapPoints, summeGewichte, type MapFeature } from './mapWeight'
import { shiftISO, toDateStr } from '../utils/calendarHelpers'
import { useTheme } from '../../theme'
import type { CalendarEntry, HoverState, StaffLite } from './scheduleShared'

// Leichte Basiskarte von swisstopo, graue Variante: die Marker müssen sich vom
// Untergrund abheben. Auf der bunten Landeskarte konkurrieren Kartenfarben und
// Cluster-Farben, und die Zahlen werden unlesbar.
const SWISSTOPO_STYLE =
  'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte-grey.vt/style.json'

// Quellenangabe ist Auflage der swisstopo-Nutzungsbedingungen, nicht Kür.
const ATTRIBUTION = '© swisstopo'

// Ganze Schweiz — Startausschnitt, wenn es keinen einzigen Punkt gibt.
const SCHWEIZ_BOUNDS: [[number, number], [number, number]] = [[5.9, 45.8], [10.5, 47.8]]

const SOURCE_ID = 'auftraege'
const POINT_LAYER = 'auftraege-punkt'

// Ab dieser Zoomstufe wird nicht mehr gruppiert: jeder Einsatz steht für sich
// und ist einzeln ansprechbar. Das ist die Auflösung, die «reinzoomen bis man
// den einzelnen Auftrag sieht» überhaupt erst garantiert.
const CLUSTER_MAX_ZOOM = 14

// Radius in Pixeln, innerhalb dessen zusammengefasst wird. Grosszügig, damit
// eine Gemeinde eine Zahl ergibt und nicht fünf sich überlappende Kreise.
const CLUSTER_RADIUS = 50

// Grössenstufen der Cluster-Marker (CSS in admin.css). Die Schwellen sind
// bewusst niedrig: bei einer Dreiwochen-Planung sind zehn Einsätze an einem
// Ort schon viel.
const CLUSTER_GROSS_AB = 15
const CLUSTER_MITTEL_AB = 5

// Gleiche Verzögerung wie die Kalender-Kacheln (scheduleShared HOVER_DELAY_MS):
// beim Überstreichen mehrerer Marker sollen keine Karten aufblitzen.
const HOVER_DELAY_MS = 220

// Die Farben der Einzelpunkte kommen aus den Design-Tokens (admin/tokens.css),
// nicht als Literale hierher: MapLibre zeichnet auf ein Canvas und folgt keinem
// CSS, ein Hex im Kartencode bliebe hell, wenn der Nutzer dunkel schaltet.
// Die Cluster sind HTML-Marker und holen sich ihre Farben direkt per CSS.
const FARB_TOKENS = ['--map-point', '--map-point-stroke'] as const

type Farben = Record<(typeof FARB_TOKENS)[number], string>

function leseFarben(): Farben {
  const stil = getComputedStyle(document.documentElement)
  const out = {} as Farben
  for (const token of FARB_TOKENS) out[token] = stil.getPropertyValue(token).trim()
  return out
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

/** Ein Cluster oder mehrere Einsätze auf demselben Pixel — dann sagt die
 *  Karte, wie viele es sind, statt einen davon willkürlich herauszugreifen. */
interface AggregatState {
  anzahl: number
  personentage: number
  x: number
  y: number
  /** true = echtes Cluster (aufzoombar), false = Überlappung im Maximalzoom. */
  aufzoombar: boolean
}

function clusterKlasse(anzahl: number): string {
  if (anzahl >= CLUSTER_GROSS_AB) return 'gross'
  if (anzahl >= CLUSTER_MITTEL_AB) return 'mittel'
  return 'klein'
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
  // Cluster-Marker, die gerade auf der Karte hängen — Schlüssel ist die
  // cluster_id. MapLibre liefert bei jedem Rendern neue Feature-Objekte; ohne
  // diesen Bestand würde jeder Frame alle Marker neu aufbauen und das Hovern
  // wäre unmöglich.
  const markerRef = useRef<Map<string, Marker>>(new Map())

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
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: CLUSTER_RADIUS,
        // Die Personentage werden über das Cluster mitsummiert. MapLibre kann
        // das serverlos beim Clustern; ohne clusterProperties müssten wir die
        // Einzelpunkte eines Clusters nachschlagen, was die Bibliothek nicht
        // ohne Weiteres hergibt.
        clusterProperties: { personentage: ['+', ['get', 'weight']] },
      })

      // EINZIGER Kartenlayer: die nicht gruppierten Einsätze. Die Cluster sind
      // HTML-Marker (siehe updateMarkers) — eine Zahl im Kreis bräuchte sonst
      // einen symbol-Layer, und der hängt an den Schriftglyphen des fremden
      // swisstopo-Styles. Fehlt dort der Font-Stack, bleibt die Zahl unsichtbar
      // und niemand merkt es. HTML rendert immer.
      map.addLayer({
        id: POINT_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          // Grosszügiger als der Punkt aussieht: das ist die Trefferfläche
          // für Hover und Tap.
          'circle-radius': 9,
          'circle-color': leseFarben()['--map-point'],
          'circle-stroke-width': 2,
          'circle-stroke-color': leseFarben()['--map-point-stroke'],
        },
      })
      setReady(true)
    })

    const markers = markerRef.current
    return () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current)
      for (const marker of markers.values()) marker.remove()
      markers.clear()
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

    // Marker abräumen, BEVOR die neuen Daten gerendert sind. MapLibre vergibt
    // cluster_ids je Clusterlauf; nach einem Zeitraumwechsel kann dieselbe id
    // eine andere Anzahl bezeichnen. Ein zwischengespeicherter Marker trüge
    // dann die alte Zahl — plausibel aussehend und falsch. Der render-Handler
    // baut sie im nächsten Frame neu auf.
    for (const marker of markerRef.current.values()) marker.remove()
    markerRef.current.clear()

    const box = boundsOf(points.geojson.features)
    map.fitBounds(box ?? SCHWEIZ_BOUNDS, { padding: 48, maxZoom: 12, duration: 400 })
    setHover(null)
    setAggregat(null)
  }, [points, ready])

  // ── Farbe der Einzelpunkte beim Theme-Wechsel nachziehen ──────────────────
  // Nur der Canvas-Layer braucht das; die Cluster-Marker sind HTML und folgen
  // dem Theme von selbst.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const farben = leseFarben()
    map.setPaintProperty(POINT_LAYER, 'circle-color', farben['--map-point'])
    map.setPaintProperty(POINT_LAYER, 'circle-stroke-color', farben['--map-point-stroke'])
  }, [theme, ready])

  // ── Cluster-Marker pflegen ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const markers = markerRef.current

    const cancelTimer = () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
    }

    const bauMarkerElement = (clusterId: number, anzahl: number, personentage: number) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `project-map-cluster project-map-cluster-${clusterKlasse(anzahl)}`
      el.textContent = String(anzahl)
      el.setAttribute('aria-label', `${anzahl} Einsätze — zum Aufschlüsseln hineinzoomen`)

      el.addEventListener('mouseenter', () => {
        cancelTimer()
        const box = el.getBoundingClientRect()
        hoverTimerRef.current = window.setTimeout(() => {
          setHover(null)
          setAggregat({
            anzahl,
            personentage,
            x: box.right,
            y: box.top,
            aufzoombar: true,
          })
        }, HOVER_DELAY_MS)
      })
      el.addEventListener('mouseleave', () => {
        cancelTimer()
        setAggregat(null)
      })
      // Klick löst das Cluster auf: MapLibre rechnet aus, ab welcher Zoomstufe
      // es auseinanderfällt. Genau der Weg vom «wie viele» zum «welche».
      el.addEventListener('click', () => {
        const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
        if (!source) return
        void source.getClusterExpansionZoom(clusterId).then(zoom => {
          const marker = markers.get(String(clusterId))
          if (!marker) return
          setAggregat(null)
          map.easeTo({ center: marker.getLngLat(), zoom, duration: 500 })
        }).catch(() => { /* Cluster inzwischen weg — dann passiert nichts. */ })
      })
      return el
    }

    const updateMarkers = () => {
      const sichtbar = new Set<string>()
      for (const feature of map.querySourceFeatures(SOURCE_ID)) {
        const props = feature.properties
        if (!props?.cluster) continue
        const key = String(props.cluster_id)
        const anzahl = Number(props.point_count) || 0
        const personentage = Number(props.personentage) || 0
        sichtbar.add(key)

        let marker = markers.get(key)
        if (!marker) {
          const coords = (feature.geometry as { coordinates: [number, number] }).coordinates
          marker = new maplibregl.Marker({
            element: bauMarkerElement(Number(props.cluster_id), anzahl, personentage),
          }).setLngLat(coords)
          markers.set(key, marker)
          marker.addTo(map)
        }
      }
      // Was nicht mehr im Bild ist, muss weg — sonst bleiben Marker als
      // Geisterkreise am Rand hängen, wenn man verschiebt.
      for (const [key, marker] of markers) {
        if (!sichtbar.has(key)) {
          marker.remove()
          markers.delete(key)
        }
      }
    }

    const onRender = () => {
      if (map.isSourceLoaded(SOURCE_ID)) updateMarkers()
    }
    map.on('render', onRender)
    return () => {
      map.off('render', onRender)
      cancelTimer()
    }
  }, [ready])

  // ── Hover, Tap und Doppelklick auf einzelne Einsätze ──────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const cancelTimer = () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
    }

    /** Baut aus der Zeigerposition ein DOMRect für die Hover-Karte.
     *  EventHoverCard positioniert sich daraus wie über einer Kalender-Kachel —
     *  auf dem Canvas gibt es kein Element mit getBoundingClientRect(). */
    const rectAt = (clientX: number, clientY: number): DOMRect =>
      new DOMRect(clientX - 6, clientY - 6, 12, 12)

    const zeige = (features: MapGeoJSONFeature[], clientX: number, clientY: number) => {
      if (!features.length) return
      if (features.length > 1) {
        // Im Maximalzoom wird nicht mehr gruppiert; zwei Einsätze an derselben
        // Adresse liegen dann exakt übereinander. Eine willkürlich
        // herausgegriffene Einzelkarte wäre irreführend — also auch hier die
        // Anzahl, aber ohne «hineinzoomen»: weiter geht es nicht.
        const alsMapFeatures = features.map(f => ({
          properties: { weight: Number(f.properties?.weight) || 0 },
        })) as MapFeature[]
        setHover(null)
        setAggregat({
          anzahl: features.length,
          personentage: summeGewichte(alsMapFeatures),
          x: clientX,
          y: clientY,
          aufzoombar: false,
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

    // Doppelklick öffnet das Projekt — dieselbe Geste wie auf einer
    // Kalender-Kachel (openBinding in ProjectScheduleCalendar).
    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER] })
      if (features.length !== 1) return
      const entry = pointsRef.current.byId.get(String(features[0].properties?.entryId))
      // Der ganze Eintrag, nicht seine id: die ist die TERMIN-ID. Der Screen
      // löst sie über resolveEntryProject aufs Projekt auf.
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
        <span className="project-map-cluster project-map-cluster-klein project-map-legend-chip" aria-hidden="true">3</span>
        <span className="project-map-cluster project-map-cluster-mittel project-map-legend-chip" aria-hidden="true">8</span>
        <span className="project-map-cluster project-map-cluster-gross project-map-legend-chip" aria-hidden="true">20</span>
        <span>Einsätze in der Umgebung — Klick zoomt hinein</span>
        <span className="project-map-legend-hint">
          Ab Zoomstufe {CLUSTER_MAX_ZOOM + 1} steht jeder Einsatz einzeln: Zeiger darauf zeigt die Details,
          Doppelklick öffnet das Projekt.
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
          <div className="project-map-aggregat-hint">
            {aggregat.aufzoombar ? 'Klick zoomt hinein' : 'Gleiche Adresse'}
          </div>
        </div>
      )}
    </div>
  )
}

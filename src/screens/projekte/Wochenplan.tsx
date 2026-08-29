import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ScheduleEntry, ScheduleWeek,
  fetchScheduleWeek, mondayOfISO, shiftDayISO, todayISO,
} from '../../api/schedule'
import { ApiError, isNetworkError } from '../../api/client'
import { loadOfflinePackage, rememberScheduleWeek } from '../../api/offlineStore'
import { OfflineStandBadge } from '../../shared/OfflineStandBadge'
import { useOnline } from '../../shared/useOnline'
import { PROJECT_KIND_LABELS } from '../../shared/projectDetail/types'
import type { ProjectKind } from '../../shared/projectDetail/types'
import { mapsUrl } from '../../shared/mapsLink'
import { useSwipe } from '../../shared/swipe'
import { kindColor } from '../kindColors'

// Der Wochenplan des Monteurs — zweite Ansicht in «Meine Projekte», neben den
// Kacheln. Form: EIN Tag pro Bildschirm, gewischt wird die Woche.
//
// Warum hier und nicht als eigener Bildschirm: die Kachelansicht beantwortet
// «welche Aufträge habe ich», der Wochenplan «was steht wann an» — zwei Sichten
// auf dieselben Einsätze. Als eigener Punkt in der Navigationsleiste stand er
// daneben statt daran, und die Leiste war mit fünf Einträgen zu voll.
//
// Der Kalender der Verwaltung (admin/operative/ProjectScheduleCalendar) zeigt eine
// ganze Woche im Raster nebeneinander; das ist auf einem Handy unlesbar und
// beantwortet auch die falsche Frage. Der Monteur will wissen, wo er heute
// hinmuss — die übrigen Tage sind einen Wisch entfernt.
//
// Aufbereitet wird serverseitig (services/schedule_export.py::build_monteur_week),
// mit denselben Funktionen wie das Wochenplan-PDF: Zeitangabe, Termin-Typ und
// Adresse stehen in der App wörtlich so wie auf dem ausgedruckten Plan.

// Nur die id wird gebraucht: der Termin nennt sein Projekt, geöffnet wird die
// Zeile aus der Projektliste des Monteurs (dieselbe wie beim Kachel-Tippen).
interface WochenplanProject {
  id: string
}

interface Props<P extends WochenplanProject> {
  projects: P[]
  /** Mitarbeiter-id — Schlüssel des Offline-Lesepakets (api/offlineStore.ts).
   *  Leer, solange kein Nutzer feststeht; dann bleibt es beim Online-Verhalten. */
  userId: string
  /** Tippen auf einen Einsatz — dasselbe Verhalten wie das Tippen auf eine Kachel. */
  onSelect: (project: P) => void
  onLoggedOut: () => void
}

const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WEEKDAYS_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

/** '2026-08-25' → '25.08.2026'. Lokal formatiert statt über Date: das ISO-Datum
 *  ist tageweise gemeint, ein Umweg über die Zeitzone könnte es verschieben. */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function EntryCard({ entry, onOpen }: { entry: ScheduleEntry; onOpen?: () => void }) {
  const color = kindColor(entry.kind)
  const address = entry.object_address || entry.billing_address
  const maps = mapsUrl(address)
  const kindLabel = entry.is_internal
    ? (PROJECT_KIND_LABELS[(entry.kind || 'sonstiges') as ProjectKind] ?? 'Interner Einsatz')
    : ''

  // Adresse und Telefon führen aus der App heraus (Navigation, Anruf) — ihr Klick
  // darf nicht zusätzlich das Projekt öffnen.
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div
      className={`wplan-card${onOpen ? ' wplan-card--open' : ''}`}
      style={{ borderLeftColor: color }}
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }) : undefined}
    >
      <div className="wplan-card-time" style={{ color }}>{entry.time_label}</div>
      <div className="wplan-card-title">
        {entry.name}
        {onOpen && (
          <span className="wplan-card-arrow" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </span>
        )}
      </div>
      {kindLabel && <div className="wplan-card-kind" style={{ color }}>{kindLabel}</div>}
      {!entry.is_internal && entry.customer_name && (
        <div className="wplan-card-sub">{entry.customer_name}</div>
      )}
      {entry.art_der_arbeit && <div className="wplan-card-sub">{entry.art_der_arbeit}</div>}
      {address && (
        maps
          ? <a className="wplan-card-link" href={maps} target="_blank" rel="noopener noreferrer" onClick={stop}>📍 {address}</a>
          : <div className="wplan-card-sub">{address}</div>
      )}
      {entry.phone && (
        <a className="wplan-card-link" href={`tel:${entry.phone.replace(/\s/g, '')}`} onClick={stop}>
          📞 {entry.local_contact_name ? `${entry.local_contact_name} · ` : ''}{entry.phone}
        </a>
      )}
      {entry.monteur_names.length > 1 && (
        <div className="wplan-card-team">👥 {entry.monteur_names.join(', ')}</div>
      )}
      {entry.bemerkung && <div className="wplan-card-note">{entry.bemerkung}</div>}
    </div>
  )
}

export function Wochenplan<P extends WochenplanProject>({ projects, userId, onSelect, onLoggedOut }: Props<P>) {
  // Der ausgewählte TAG ist der ganze Navigationszustand — die Woche ergibt sich
  // aus ihm. Wer am Sonntag weiterwischt, landet am Montag der Folgewoche, ohne
  // dass Tag und Woche getrennt nachgeführt werden müssten.
  const [selectedIso, setSelectedIso] = useState(() => todayISO())
  // Geladene Wochen, nach Montag abgelegt. Vor- und Zurückwischen über eine
  // Wochengrenze soll nicht jedes Mal neu laden.
  const [weeks, setWeeks] = useState<Record<string, ScheduleWeek>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Wochen, die aus dem Offline-Lesepaket kommen statt vom Server — je Montag der
  // Stand-Zeitpunkt, für den Badge über der Tagesliste.
  const [snapshotAt, setSnapshotAt] = useState<Record<string, string>>({})
  const [reloadNonce, setReloadNonce] = useState(0)
  const online = useOnline()
  const loadedRef = useRef<Set<string>>(new Set())

  const monday = mondayOfISO(selectedIso)
  const week = weeks[monday]
  const day = week?.days.find(d => d.iso === selectedIso)
  const today = todayISO()

  useEffect(() => {
    if (loadedRef.current.has(monday)) return
    loadedRef.current.add(monday)
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchScheduleWeek(monday)
      .then(data => {
        if (cancelled) return
        setWeeks(prev => ({ ...prev, [monday]: data }))
        setSnapshotAt(prev => {
          if (!(monday in prev)) return prev
          const next = { ...prev }
          delete next[monday]
          return next
        })
        // Write-through ins Lesepaket (docs/specs/offline-modus.md §3.3).
        rememberScheduleWeek(userId, monday, data)
      })
      .catch(err => {
        if (cancelled) return
        // Beim Fehlschlag die Woche wieder freigeben, sonst bleibt sie für den
        // Rest der Sitzung leer — auch wenn das Netz gleich wieder da ist.
        loadedRef.current.delete(monday)
        if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
        // isNetworkError statt isOfflineError: auch «Empfangsbalken, aber kein
        // Durchkommen» soll den Snapshot zeigen — er ist rein lesend (Spec §8).
        const stored = isNetworkError(err) ? loadOfflinePackage(userId) : null
        const week = stored?.scheduleWeeks[monday]
        if (week) {
          setWeeks(prev => ({ ...prev, [monday]: week }))
          setSnapshotAt(prev => ({ ...prev, [monday]: stored?.savedAt ?? '' }))
          return
        }
        setError(isNetworkError(err)
          ? 'Offline — dieser Wochenplan liegt nicht auf dem Gerät.'
          : 'Der Wochenplan konnte nicht geladen werden.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [monday, userId, onLoggedOut, reloadNonce])

  // Netz zurück, die Ansicht zeigt noch den Snapshot oder eine Fehlermeldung →
  // frisch laden. Der Fehlschlag hat die Woche in loadedRef schon freigegeben;
  // der Nonce stösst nur den Effekt neu an. Feuert allein beim Umschalten von
  // offline auf online — kein Reload-Loop bei Dauerfehlern.
  useEffect(() => {
    if (!online) return
    if (monday in snapshotAt || error !== null) setReloadNonce(n => n + 1)
  }, [online])

  const goDay = useCallback((step: number) => {
    setSelectedIso(iso => shiftDayISO(iso, step))
  }, [])

  const swipe = useSwipe(() => goDay(1), () => goDay(-1))

  const weekLabel = week
    ? `KW ${week.week_number} · ${week.week_label}`
    : `${fmtDate(monday)} – ${fmtDate(shiftDayISO(monday, 6))}`
  const strip = Array.from({ length: 7 }, (_, i) => shiftDayISO(monday, i))
  // Position des gewählten Tages in der Leiste — Fallback für den Wochentagsnamen,
  // solange die Woche noch lädt.
  const selectedIndex = Math.max(0, strip.indexOf(selectedIso))
  const entries = day?.entries ?? []
  const showEmpty = !loading && !error && entries.length === 0

  // Termin → Projektzeile der Kachelansicht. Nicht jeder Einsatz hat eine: interne
  // Einsätze (Teamsitzung, Werkstatt) sind keine Projekte, und die Projektliste
  // blendet je nach Mandanten-Einstellung erledigte oder künftige Projekte aus.
  // Solche Karten bleiben lesbar, aber nicht antippbar — ein Tipp ins Leere wäre
  // schlimmer als gar kein Tipp.
  function projectFor(entry: ScheduleEntry): P | undefined {
    if (entry.is_internal) return undefined
    return projects.find(p => p.id === entry.id)
  }

  return (
    <>
      {/* Wochen-Navigation */}
      <div className="wplan-weekbar">
        <button
          className="wplan-nav-btn"
          aria-label="Vorherige Woche"
          onClick={() => setSelectedIso(shiftDayISO(monday, -7))}
        >
          <ChevronLeft />
        </button>
        <div className="wplan-week-label">{weekLabel}</div>
        <button
          className="wplan-nav-btn"
          aria-label="Nächste Woche"
          onClick={() => setSelectedIso(shiftDayISO(monday, 7))}
        >
          <ChevronRight />
        </button>
      </div>

      {/* Tagesleiste — Mo bis So, der gewählte Tag hervorgehoben */}
      <div className="wplan-strip" role="tablist" aria-label="Wochentage">
        {strip.map((iso, i) => {
          const dayData = week?.days.find(d => d.iso === iso)
          const count = dayData?.entries.length ?? 0
          const cls = [
            'wplan-strip-day',
            iso === selectedIso ? 'active' : '',
            iso === today ? 'today' : '',
            i >= 5 ? 'weekend' : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={iso}
              className={cls}
              role="tab"
              aria-selected={iso === selectedIso}
              aria-label={`${WEEKDAYS_LANG[i]}, ${fmtDate(iso)}`}
              onClick={() => setSelectedIso(iso)}
            >
              <span className="wplan-strip-dow">{DOW[i]}</span>
              <span className="wplan-strip-num">{iso.slice(8, 10)}</span>
              <span className={`wplan-strip-dot${count > 0 ? ' filled' : ''}`} />
            </button>
          )
        })}
      </div>

      {/* Tageskopf */}
      <div className="wplan-dayhead">
        <button className="wplan-nav-btn" aria-label="Vorheriger Tag" onClick={() => goDay(-1)}>
          <ChevronLeft />
        </button>
        <div className="wplan-dayhead-text">
          <div className="wplan-dayhead-weekday">
            {day?.weekday ?? WEEKDAYS_LANG[selectedIndex]}
            {selectedIso === today && <span className="wplan-today-badge">Heute</span>}
          </div>
          <div className="wplan-dayhead-date">{day?.date ?? fmtDate(selectedIso)}</div>
        </div>
        <button className="wplan-nav-btn" aria-label="Nächster Tag" onClick={() => goDay(1)}>
          <ChevronRight />
        </button>
      </div>

      {/* Tagesinhalt — hier wird gewischt */}
      <div className="wplan-scroll" {...swipe}>
        {!loading && monday in snapshotAt && <OfflineStandBadge savedAt={snapshotAt[monday]} />}
        {loading && <div className="bericht-loading">Laden…</div>}
        {error && (
          <div className="action-result action-result-error" style={{ margin: '8px 0' }}>{error}</div>
        )}
        {showEmpty && (
          <div className="projekte-empty">
            Kein Einsatz geplant.
            <div style={{ marginTop: 8, fontSize: 13 }}>Wischen blättert zum nächsten Tag.</div>
          </div>
        )}
        {!loading && !error && entries.length > 0 && (
          <div className="wplan-list">
            {entries.map((e, i) => {
              const project = projectFor(e)
              return (
                <EntryCard
                  key={`${e.appointment_id ?? e.id}-${i}`}
                  entry={e}
                  onOpen={project ? () => onSelect(project) : undefined}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Zurück zu heute — nur, wenn man weggeblättert ist */}
      {selectedIso !== today && (
        <div className="wplan-today-row">
          <button className="wplan-today-btn" onClick={() => setSelectedIso(today)}>Heute</button>
        </div>
      )}
    </>
  )
}

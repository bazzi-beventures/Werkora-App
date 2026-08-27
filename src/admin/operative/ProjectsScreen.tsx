import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getProject, listProjects, listProjectLocalities } from '../../api/admin/projects'
import { projectCustomerName } from '../utils/project'
import type { Project, ProjectLocality, ProjectsListResponse } from '../../api/admin/projects'
import { getAdminStaff } from '../../api/admin/staff'
import { getMe } from '../../api/auth'
import { isFeatureEnabled } from '../../api/modules'
import ProjectDetailScreen from './ProjectDetailScreen'
import type { ProjectTab } from './projectDetail/ProjectTabBar'
import { ProjectStatus, PROJECT_STATUS_LABELS, PROJECT_STATUS_BADGE, QUOTE_STATUS_LABELS, INVOICE_STATUS_LABELS } from '../constants/statuses'
import { BESCHAFFUNG_STEPS, beschaffungStep } from '../constants/beschaffungSteps'
import { AdminCardList } from '../components/AdminCardList'
import { ColumnFilter, rangeValue } from '../components/ColumnFilter'
import type { FilterOption, FilterSection, FilterValues } from '../components/ColumnFilter'
import { MobileFilterSheet } from '../components/MobileFilterSheet'
import { useListState } from '../hooks/useListState'
import { addressLocality } from './scheduleShared'
import { useIsMobile } from '../useIsMobile'

const DOC_STATUS_BADGE: Record<string, string> = {
  ausstehend: 'admin-badge-open',
  offen: 'admin-badge-open',
  gesendet: 'admin-badge-sent',
  bezahlt: 'admin-badge-paid',
  entwurf: 'admin-badge-draft',
  akzeptiert: 'admin-badge-approved',
  archiviert: 'admin-badge-closed',
}

// Sortierschluessel = Katalog des Endpoints (db.projects._ADMIN_PROJECTS_SORT_MAP).
// 'quote'/'invoice' sortieren nach dem Ablauf-Rang des Belegs, nicht alphabetisch
// nach dem Status: "akzeptiert, entwurf, gesendet" saehe sortiert aus, sagt aber nichts.
type ProjectSortKey = 'project_id_text' | 'name' | 'customer_name' | 'projektleiter'
  | 'quote' | 'invoice' | 'status' | 'workflow' | 'created_at'

const SORT_KEYS: ProjectSortKey[] = [
  'project_id_text', 'name', 'customer_name', 'projektleiter',
  'quote', 'invoice', 'status', 'workflow', 'created_at',
]

type SortDir = 'asc' | 'desc'

// Sonderwert der Mehrfachfilter — "kein Beleg", "nicht zugewiesen", "kein
// Vorgang". Er ist Pflicht, nicht Kuer: die wertvollste Frage der Projektliste
// ("fertig, aber noch nicht verrechnet") ist Status=abgeschlossen UND
// Rechnung=keine. Ein Filter, der nur vorhandene Belege anbietet, kann sie nicht
// stellen. Muss zum Sonderwert des Endpoints passen (db.projects._FILTER_NONE).
const NONE = 'none'

// Offerten mit 'abgelehnt'/'absage' und Rechnungen mit 'inaktiv' fuehrt der View
// gar nicht — sie stehen deshalb auch nicht zur Auswahl. Ein Filter, der
// garantiert nichts findet, ist schlimmer als kein Filter.
const QUOTE_FILTER_VALUES = ['entwurf', 'gesendet', 'akzeptiert', 'archiviert']
const INVOICE_FILTER_VALUES = ['ausstehend', 'offen', 'gesendet', 'bezahlt', 'archiviert']
const LIFECYCLE_VALUES: ProjectStatus[] = ['offen', 'abgeschlossen', 'archiviert']
const BESCHAFFUNG_KEYS = BESCHAFFUNG_STEPS.map(s => s.key)

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 11 }}>
      {active && dir === 'desc' ? '↓' : '↑'}
    </span>
  )
}

interface ProjectsScreenProps {
  openNew?: boolean
  onConsumedNew?: () => void
  // Direktsprung in ein Projekt (Projekt-id), z.B. per Doppelklick auf einen
  // Einsatz in der Einsatzplanung. Die Zeile wird einzeln nachgeladen — sie
  // muss auf der aktuellen Listenseite gar nicht vorkommen.
  openProjectId?: string
  onConsumedProjectId?: () => void
  // Reiter, auf dem die Maske aufgehen soll (Deep-Link aus einer Info-Mail:
  // «Rapport eingereicht» → 'reports'). Gilt nur fuer den Sprung oben.
  openProjectTab?: ProjectTab
}

const PAGE_SIZE = 50

// Persistierter Listenzustand (sessionStorage, siehe hooks/useListState).
interface ProjectsListState {
  search: string
  lifecycle: string[]
  projektleiterIds: string[]
  quoteStatus: string[]
  invoiceStatus: string[]
  beschaffung: string[]
  locality: string[]
  address: string
  phone: string
  createdFrom: string
  createdTo: string
  sortKey: ProjectSortKey
  sortDir: SortDir
  page: number
}

const DEFAULT_STATE: ProjectsListState = {
  search: '',
  // Vorgabe wie bisher: offene Projekte. Die Knoepfe "Archiv" und "Geschlossene
  // anzeigen" schreiben in dasselbe Feld wie der Status-Spaltenfilter (Spec
  // §10.1 (b)) — zwei Bedienwege, ein Zustand.
  lifecycle: ['offen'],
  projektleiterIds: [],
  quoteStatus: [],
  invoiceStatus: [],
  beschaffung: [],
  locality: [],
  address: '',
  phone: '',
  createdFrom: '',
  createdTo: '',
  sortKey: 'created_at',
  sortDir: 'desc',
  page: 1,
}

/**
 * Gespeicherten Zustand pruefen. Unbekannte Werte werden VERWORFEN, nicht
 * durchgereicht: ein abgeschalteter Beschaffungsschritt oder ein Status, den es
 * nicht mehr gibt, darf die Liste nicht leer machen — das ist die Sorte Fehler,
 * die als "meine Projekte sind weg" gemeldet wird.
 *
 * Projektleiter-ids und Ortschaften lassen sich hier noch nicht pruefen (Personal
 * und Ortsliste kommen erst spaeter vom Server); die ids werden nachtraeglich
 * gefiltert, sobald das Personal da ist, und eine verschwundene Ortschaft macht
 * sich als Chip mit null Treffern bemerkbar statt als leere Liste ohne Grund.
 */
function reviveState(stored: Partial<ProjectsListState>): Partial<ProjectsListState> {
  const keep = (values: string[] | undefined, allowed: string[], withNone = true) =>
    (values ?? []).filter(v => allowed.includes(v) || (withNone && v === NONE))
  return {
    ...stored,
    lifecycle: keep(stored.lifecycle, LIFECYCLE_VALUES, false),
    quoteStatus: keep(stored.quoteStatus, QUOTE_FILTER_VALUES),
    invoiceStatus: keep(stored.invoiceStatus, INVOICE_FILTER_VALUES),
    beschaffung: keep(stored.beschaffung, BESCHAFFUNG_KEYS),
    sortKey: SORT_KEYS.includes(stored.sortKey as ProjectSortKey) ? stored.sortKey : DEFAULT_STATE.sortKey,
    sortDir: stored.sortDir === 'asc' ? 'asc' : DEFAULT_STATE.sortDir,
    page: Math.max(1, Number(stored.page) || 1),
  }
}

/** Ortschaft der Zeile — dieselbe Reihenfolge wie die View-Spalte `locality`. */
function projectLocality(p: Project): string {
  return addressLocality(p.object_address || p.customer?.object_address || p.customer?.address)
}

function optionsWithNone(values: string[], labels: Record<string, string>, noneLabel: string): FilterOption[] {
  return [
    ...values.map(v => ({ value: v, label: labels[v] ?? v })),
    { value: NONE, label: noneLabel },
  ]
}

function formatDay(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-CH')
}

export default function ProjectsScreen({
  openNew, onConsumedNew, openProjectId, onConsumedProjectId, openProjectTab,
}: ProjectsScreenProps = {}) {
  const { state, patch, reset } = useListState<ProjectsListState>('admin-projects', DEFAULT_STATE, reviveState)
  const {
    lifecycle, projektleiterIds, quoteStatus, invoiceStatus, beschaffung,
    locality, address, phone, createdFrom, createdTo, sortKey, sortDir, page,
  } = state

  const [data, setData] = useState<ProjectsListResponse>({
    rows: [], total: 0, open_count: 0, closed_count: 0, archived_count: 0, page: 1, page_size: PAGE_SIZE,
  })
  const [loading, setLoading] = useState(true)
  // Tippstand des Suchfelds; `state.search` traegt den entprellten Wert, der die
  // Abfrage ausloest (und im sessionStorage landet).
  const [searchInput, setSearchInput] = useState(state.search)
  // Direkteingabe der Seitenzahl (Sprung). String, um Zwischenzustände beim Tippen zu erlauben.
  const [pageInput, setPageInput] = useState(String(state.page))
  const [selected, setSelected] = useState<Project | null>(null)
  const [showNew, setShowNew] = useState(false)
  // Reiter, auf dem die Maske aufgeht — nur beim Direktsprung gesetzt (Deep-Link
  // aus einer Info-Mail). Beim Schliessen wieder null, sonst oeffnete das
  // naechste, von Hand angetippte Projekt ebenfalls auf 'Rapporte'.
  const [initialTab, setInitialTab] = useState<ProjectTab | null>(null)
  const [showMobileFilter, setShowMobileFilter] = useState(false)
  const isMobile = useIsMobile()
  const [projektleiterOptions, setProjektleiterOptions] = useState<{ id: string; name: string }[]>([])
  // id → Name für ALLE Mitarbeiter (nicht nur Projektleiter-geflaggte): löst
  // projektleiter_id in der Spalte auf, auch wenn der PL kein PL-Flag (mehr) hat.
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({})
  // Ortschaften kommen erst, wenn jemand den Kundenfilter oeffnet — die
  // Aggregation laeuft ueber den ganzen Bestand und gehoert nicht in den
  // Ladeweg der Liste.
  const [localities, setLocalities] = useState<ProjectLocality[] | null>(null)
  // Tenant-spezifische Projektleiter-Spalte (Feature-Flag, Default aus).
  const [showProjektleiterCol, setShowProjektleiterCol] = useState(false)
  // Beschaffungs-Spalte (Feature `beschaffungsstatus`, Default aus).
  const [showBeschaffungCol, setShowBeschaffungCol] = useState(false)

  useEffect(() => {
    getAdminStaff()
      .then(staff => {
        setStaffNameById(Object.fromEntries(staff.map(s => [s.id, s.name])))
        setProjektleiterOptions(
          staff
            .filter(s => s.projektleiter)
            .map(s => ({ id: s.id, name: s.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
        // Gemerkter Filter auf einen geloeschten Mitarbeiter: die id fliegt raus,
        // sonst zeigt die Liste wortlos nichts an.
        const known = new Set(staff.map(s => s.id))
        patch(prev => {
          const kept = prev.projektleiterIds.filter(id => id === NONE || known.has(id))
          return kept.length === prev.projektleiterIds.length ? {} : { projektleiterIds: kept }
        })
      })
      .catch(() => { setProjektleiterOptions([]); setStaffNameById({}) })
  }, [patch])

  useEffect(() => {
    getMe()
      .then(me => {
        setShowProjektleiterCol(isFeatureEnabled(me, 'projektleiter_spalte'))
        setShowBeschaffungCol(isFeatureEnabled(me, 'beschaffungsstatus'))
      })
      .catch(() => {})
  }, [])

  // Der Ref (statt einer Pruefung auf `localities === null`) haelt den Fetch auch
  // dann bei einem, wenn der Filter zweimal schnell hintereinander geoeffnet wird
  // — und er macht den Aufruf frei von Seiteneffekten in einem State-Updater.
  const localitiesRequested = useRef(false)
  const loadLocalities = useCallback(() => {
    if (localitiesRequested.current) return
    localitiesRequested.current = true
    listProjectLocalities().then(setLocalities).catch(() => setLocalities([]))
  }, [])

  useEffect(() => {
    if (openNew) {
      setShowNew(true)
      onConsumedNew?.()
    }
  }, [openNew, onConsumedNew])

  // Direktsprung: Projekt einzeln nachladen und die Maske öffnen. Schlägt das
  // fehl (gelöscht, kein Zugriff), bleibt es bei der Übersicht — der Sprung ist
  // eine Abkürzung, kein Pflichtweg.
  //
  // Der Ref merkt sich die bereits angestossene id. Ohne ihn würde jedes
  // Neurendern während des laufenden Requests den Effect erneut auslösen: die
  // Consumed-Callbacks sind nicht memoisiert, ihre Identität wechselt ständig.
  //
  // `initialTab` wird im selben Zug gesetzt: die Maske liest ihn nur beim Mount,
  // und der Prop `openProjectTab` ist eine Zeile später schon wieder abgeräumt
  // (`onConsumedProjectId`). Als lokaler Zustand überlebt er den einen Render,
  // in dem die Maske aufgeht.
  const jumpedToRef = useRef<string | null>(null)
  useEffect(() => {
    // Zurückgesetzt, sobald der Sprung verbraucht ist — sonst liesse sich
    // dasselbe Projekt kein zweites Mal per Doppelklick öffnen.
    if (!openProjectId) { jumpedToRef.current = null; return }
    if (jumpedToRef.current === openProjectId) return
    jumpedToRef.current = openProjectId
    const tab = openProjectTab ?? null
    getProject(openProjectId)
      .then(p => { setShowNew(false); setInitialTab(tab); setSelected(p) })
      .catch(() => {})
      .finally(() => onConsumedProjectId?.())
  }, [openProjectId, openProjectTab, onConsumedProjectId])

  // Suche: 300ms Debounce, damit nicht jeder Tastendruck einen Roundtrip ausloest.
  useEffect(() => {
    const t = setTimeout(() => {
      patch(prev => prev.search === searchInput.trim() ? {} : { search: searchInput.trim(), page: 1 })
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput, patch])

  // Eingabefeld mit der aktiven Seite synchron halten (Pfeile, Filter-Reset, Sprung).
  useEffect(() => { setPageInput(String(page)) }, [page])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listProjects({
        // Alt-Parameter: der Lebenszyklus laeuft ueber `lifecycle`. 'all' ist der
        // Rueckfall fuer den Fall, dass die Auswahl leer ist (= alles ausser Archiv).
        status: 'all',
        lifecycle,
        sort: sortKey,
        dir: sortDir,
        page,
        pageSize: PAGE_SIZE,
        search: state.search,
        projektleiterIds,
        quoteStatus,
        invoiceStatus,
        beschaffung,
        locality,
        address,
        phone,
        createdFrom,
        createdTo,
      }))
    } finally {
      setLoading(false)
    }
  }, [lifecycle, sortKey, sortDir, page, state.search, projektleiterIds, quoteStatus,
      invoiceStatus, beschaffung, locality, address, phone, createdFrom, createdTo])

  useEffect(() => { load() }, [load])

  function toggleSort(key: ProjectSortKey) {
    // Sortieren wirft die Seite zurueck auf 1: Seite 7 einer anderen Reihenfolge
    // ist die Mitte von irgendwas, nicht der Anfang.
    patch(prev => prev.sortKey === key
      ? { sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc', page: 1 }
      : { sortKey: key, sortDir: 'asc', page: 1 })
  }

  /** Filterwerte uebernehmen — jede Aenderung beginnt wieder auf Seite 1. */
  const applyFilter = useCallback((values: FilterValues) => {
    const next: Partial<ProjectsListState> = { page: 1 }
    for (const [key, value] of Object.entries(values)) {
      if (key === 'created') {
        const r = rangeValue(values, 'created')
        next.createdFrom = r.from
        next.createdTo = r.to
      } else if (Array.isArray(value)) {
        next[key as 'locality'] = value
      } else if (typeof value === 'string') {
        next[key as 'address'] = value
      }
    }
    patch(next)
  }, [patch])

  const { rows, total, open_count, closed_count, archived_count } = data
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  // Seitensprung: Eingabe auf [1, totalPages] klemmen; Ungültiges auf aktuelle Seite zurücksetzen.
  function commitPageInput() {
    const n = parseInt(pageInput, 10)
    const clamped = Number.isNaN(n) ? page : Math.min(totalPages, Math.max(1, n))
    patch({ page: clamped })
    setPageInput(String(clamped))
  }

  // Gemerkte Seite gegen die Antwort klemmen: nach einem Filterwechsel kann die
  // Liste kuerzer sein als die Seite, auf der man zuletzt stand.
  useEffect(() => {
    if (!loading && page > totalPages) patch({ page: totalPages })
  }, [loading, page, totalPages, patch])

  const showArchived = lifecycle.length === 1 && lifecycle[0] === 'archiviert'
  const showClosed = lifecycle.includes('abgeschlossen')

  // ─── Filter-Abschnitte je Spalte ───────────────────────────────────────────
  const localityOptions: FilterOption[] = useMemo(() => [
    ...(localities ?? []).map(l => ({ value: l.locality, label: l.locality, badge: l.count })),
    { value: NONE, label: 'Keine Ortschaft erkennbar' },
  ], [localities])

  const kundeSections: FilterSection[] = useMemo(() => [
    // Ortschaft, Adresse und Telefon haben keine eigene Spalte — sie gehoeren zur
    // selben Frage ("welcher Kunde, wo, wie erreichbar") und haengen deshalb am
    // Kundenkopf. Die Ortschaft steht dafuer als zweite Zeile in der Zelle: ein
    // Filter, dessen Treffer man in der Zeile nicht nachvollziehen kann, ist der
    // schnellste Weg zu "die Liste zeigt Unsinn".
    { kind: 'multi', key: 'locality', title: 'Ortschaft', options: localityOptions, empty: 'Ortschaften werden geladen …' },
    { kind: 'text', key: 'address', title: 'Adresse enthält', placeholder: 'z.B. Musterstrasse' },
    { kind: 'text', key: 'phone', title: 'Telefon enthält', placeholder: 'z.B. 079 123 45 67' },
  ], [localityOptions])

  const projektleiterSections: FilterSection[] = useMemo(() => [{
    kind: 'multi', key: 'projektleiterIds',
    options: [
      ...projektleiterOptions.map(o => ({ value: o.id, label: o.name })),
      { value: NONE, label: 'Nicht zugewiesen' },
    ],
  }], [projektleiterOptions])

  const quoteSections: FilterSection[] = useMemo(() => [{
    kind: 'multi', key: 'quoteStatus',
    options: optionsWithNone(QUOTE_FILTER_VALUES, QUOTE_STATUS_LABELS, 'Keine Offerte'),
  }], [])

  const invoiceSections: FilterSection[] = useMemo(() => [{
    kind: 'multi', key: 'invoiceStatus',
    options: optionsWithNone(INVOICE_FILTER_VALUES, INVOICE_STATUS_LABELS, 'Keine Rechnung'),
  }], [])

  const beschaffungSections: FilterSection[] = useMemo(() => [{
    kind: 'multi', key: 'beschaffung',
    options: [
      ...BESCHAFFUNG_STEPS.map(s => ({ value: s.key, label: s.label })),
      { value: NONE, label: 'Kein Vorgang' },
    ],
  }], [])

  const statusSections: FilterSection[] = useMemo(() => [{
    kind: 'multi', key: 'lifecycle',
    options: LIFECYCLE_VALUES.map(v => ({ value: v, label: PROJECT_STATUS_LABELS[v] })),
  }], [])

  const createdSections: FilterSection[] = useMemo(() => [
    { kind: 'daterange', key: 'created' },
  ], [])

  const filterValues: FilterValues = useMemo(() => ({
    locality, address, phone, projektleiterIds, quoteStatus, invoiceStatus,
    beschaffung, lifecycle, created: { from: createdFrom, to: createdTo },
  }), [locality, address, phone, projektleiterIds, quoteStatus, invoiceStatus,
       beschaffung, lifecycle, createdFrom, createdTo])

  // Auf dem Handy gibt es keinen Spaltenkopf — dort stehen alle Abschnitte
  // untereinander in einem Sheet.
  const mobileSections: FilterSection[] = useMemo(() => [
    ...statusSections,
    ...(showProjektleiterCol ? projektleiterSections : []),
    ...quoteSections,
    ...invoiceSections,
    ...(showBeschaffungCol ? beschaffungSections : []),
    ...createdSections,
    ...kundeSections,
  ].map(s => s.title ? s : { ...s, title: MOBILE_TITLES[s.key] ?? s.key }),
  [statusSections, projektleiterSections, quoteSections, invoiceSections,
   beschaffungSections, createdSections, kundeSections, showProjektleiterCol, showBeschaffungCol])

  // ─── Chip-Zeile ────────────────────────────────────────────────────────────
  const chips = useMemo(() => {
    const out: { key: string; label: string; clear: Partial<ProjectsListState> }[] = []
    const labelList = (values: string[], labels: Record<string, string>, noneLabel: string) =>
      values.map(v => v === NONE ? noneLabel : (labels[v] ?? v)).join(', ')

    // Der Lebenszyklus bekommt nur dann einen Chip, wenn er von der Vorgabe
    // abweicht — "Offen" ist der Normalzustand, kein gesetzter Filter.
    if (lifecycle.join(',') !== DEFAULT_STATE.lifecycle.join(',')) {
      out.push({
        key: 'lifecycle',
        label: `Status: ${lifecycle.length ? labelList(lifecycle, PROJECT_STATUS_LABELS, '') : 'alle ausser Archiv'}`,
        clear: { lifecycle: DEFAULT_STATE.lifecycle },
      })
    }
    if (projektleiterIds.length) {
      out.push({
        key: 'projektleiterIds',
        label: `Projektleiter: ${labelList(projektleiterIds, staffNameById, 'Nicht zugewiesen')}`,
        clear: { projektleiterIds: [] },
      })
    }
    if (quoteStatus.length) {
      out.push({
        key: 'quoteStatus',
        label: `Offerte: ${labelList(quoteStatus, QUOTE_STATUS_LABELS, 'keine')}`,
        clear: { quoteStatus: [] },
      })
    }
    if (invoiceStatus.length) {
      out.push({
        key: 'invoiceStatus',
        label: `Rechnung: ${labelList(invoiceStatus, INVOICE_STATUS_LABELS, 'keine')}`,
        clear: { invoiceStatus: [] },
      })
    }
    if (beschaffung.length) {
      const labels = Object.fromEntries(BESCHAFFUNG_STEPS.map(s => [s.key, s.label]))
      out.push({
        key: 'beschaffung',
        label: `Beschaffung: ${labelList(beschaffung, labels, 'kein Vorgang')}`,
        clear: { beschaffung: [] },
      })
    }
    if (locality.length) {
      out.push({
        key: 'locality',
        label: `Ortschaft: ${labelList(locality, {}, 'keine erkennbar')}`,
        clear: { locality: [] },
      })
    }
    // Adresse und Telefon nennen den Suchbegriff im Klartext — sonst bleibt
    // unerklaerlich, warum eine Zeile da ist.
    if (address.trim()) out.push({ key: 'address', label: `Adresse enthält ${address.trim()}`, clear: { address: '' } })
    if (phone.trim()) out.push({ key: 'phone', label: `Telefon enthält ${phone.trim()}`, clear: { phone: '' } })
    if (createdFrom || createdTo) {
      const label = createdFrom && createdTo
        ? `${formatDay(createdFrom)} – ${formatDay(createdTo)}`
        : createdFrom ? `ab ${formatDay(createdFrom)}` : `bis ${formatDay(createdTo)}`
      out.push({ key: 'created', label: `Erstellt: ${label}`, clear: { createdFrom: '', createdTo: '' } })
    }
    return out
  }, [lifecycle, projektleiterIds, quoteStatus, invoiceStatus, beschaffung, locality,
      address, phone, createdFrom, createdTo, staffNameById])

  const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

  if (selected || showNew) {
    return (
      <ProjectDetailScreen
        // key erzwingt einen sauberen Neuaufbau beim Wechsel „Neu-Maske → angelegtes
        // Projekt": die Maske liest ihren Ausgangsstand nur beim Mount aus dem Prop.
        key={showNew ? 'new' : selected!.id}
        project={showNew ? null : selected}
        initialTab={initialTab ?? undefined}
        onClose={() => { setSelected(null); setShowNew(false); setInitialTab(null) }}
        onSaved={saved => {
          setShowNew(false)
          // Frisch angelegtes Projekt → direkt hineinspringen statt auf die Übersicht.
          setSelected(saved ?? null)
          load()
        }}
      />
    )
  }

  return (
    // admin-page-wide: die Tabelle hat bis zu 9 Spalten (mit Projektleiter und
    // Beschaffung). Bei den 1200px von .admin-page wird die letzte Spalte
    // ("Erstellt") rechts abgeschnitten und nur per Scrollbalken erreichbar.
    <div className="admin-page admin-page-wide">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Projekte</div>
          <div className="admin-page-subtitle">
            {open_count} offen, {closed_count} geschlossen{archived_count > 0 ? `, ${archived_count} archiviert` : ''}
            {/* Die Zaehler beschriften den Gesamtbestand. Bei gesetztem Filter waere
                das die falsche Zahl an der auffaelligsten Stelle — deshalb steht die
                Treffermenge daneben, statt die Zeile zu ersetzen (Spec §10.2). */}
            {chips.length > 0 && !loading && <> · <strong>{total} Treffer</strong></>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`admin-btn admin-btn-sm ${showArchived ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => patch({ lifecycle: showArchived ? DEFAULT_STATE.lifecycle : ['archiviert'], page: 1 })}
          >
            {showArchived ? 'Archiv ausblenden' : `Archiv${archived_count > 0 ? ` (${archived_count})` : ''}`}
          </button>
          <button
            className={`admin-btn admin-btn-sm ${showClosed ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            disabled={showArchived}
            onClick={() => patch({ lifecycle: showClosed ? ['offen'] : ['offen', 'abgeschlossen'], page: 1 })}
          >
            {showClosed ? 'Geschlossene ausblenden' : 'Geschlossene anzeigen'}
          </button>
          <button className="admin-btn admin-btn-primary" onClick={() => setShowNew(true)}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
            Neues Projekt
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Projekt, Kunde, Adresse, Telefon, Beleg-Nr. suchen…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          {isMobile && (
            <button
              className="admin-btn admin-btn-sm admin-btn-secondary"
              onClick={() => { loadLocalities(); setShowMobileFilter(true) }}
            >
              ⚑ Filter{chips.length > 0 ? ` (${chips.length})` : ''}
            </button>
          )}
        </div>

        {chips.length > 0 && (
          // Gegenmassnahme zur Persistenz: ein gemerkter Filter darf nie
          // unsichtbar Zeilen schlucken.
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '0 16px 12px' }}>
            {chips.map(chip => (
              <span
                key={chip.key}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
                  background: 'var(--primary-soft)', color: 'var(--primary)',
                  padding: '3px 8px', borderRadius: 12, fontWeight: 600,
                }}
              >
                {chip.label}
                <button
                  type="button"
                  aria-label={`${chip.label} entfernen`}
                  onClick={() => patch({ ...chip.clear, page: 1 })}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-secondary"
              style={{ marginLeft: 'auto' }}
              // Setzt Filter, Sortierung und Seite zurueck — die Suche bleibt
              // stehen: wer tippt, will das Getippte nicht verlieren.
              onClick={() => { reset(); patch({ search: state.search }) }}
            >
              alle zurücksetzen
            </button>
          </div>
        )}

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          <AdminCardList
            items={rows}
            keyFor={p => p.id}
            onItemClick={p => setSelected(p)}
            empty="Keine Projekte gefunden."
            renderCard={p => {
              const effectiveStatus: ProjectStatus = p.status ?? (p.is_closed ? 'abgeschlossen' : 'offen')
              const ort = projectLocality(p)
              return (
                <>
                  <div className="admin-card-head">
                    <span className="admin-card-title">{p.name}</span>
                    <span className={`admin-badge ${PROJECT_STATUS_BADGE[effectiveStatus]}`}>
                      {PROJECT_STATUS_LABELS[effectiveStatus]}
                    </span>
                  </div>
                  {/* Auf dem Handy gibt es keine Spalten — der Beschaffungsschritt kommt
                      als eigene Badge-Zeile, damit er nicht im Meta-Text untergeht. */}
                  {showBeschaffungCol && beschaffungStep(p.workflow_status) && (
                    <div style={{ marginTop: 4 }}>
                      <span className={`admin-badge ${beschaffungStep(p.workflow_status)!.badge}`}>
                        {beschaffungStep(p.workflow_status)!.label}
                      </span>
                    </div>
                  )}
                  <div className="admin-card-meta">
                    {p.project_id_text || '—'} · {projectCustomerName(p) || '—'}{ort ? ` · ${ort}` : ''}
                  </div>
                  <div className="admin-card-meta">
                    Offerte: {p.quote ? p.quote.status : '—'} · Rechnung: {p.invoice ? p.invoice.status : '—'} · {new Date(p.created_at).toLocaleDateString('de-CH')}
                  </div>
                </>
              )
            }}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th style={thStyle} onClick={() => toggleSort('project_id_text')}>
                  Projekt-ID <SortIcon active={sortKey === 'project_id_text'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('name')}>
                  Projektname <SortIcon active={sortKey === 'name'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('customer_name')}>
                  Kunde <SortIcon active={sortKey === 'customer_name'} dir={sortDir} />
                  <ColumnFilter label="Kunde" sections={kundeSections} values={filterValues} onChange={applyFilter} onOpen={loadLocalities} />
                </th>
                {showProjektleiterCol && (
                  <th style={thStyle} onClick={() => toggleSort('projektleiter')}>
                    Projektleiter <SortIcon active={sortKey === 'projektleiter'} dir={sortDir} />
                    <ColumnFilter label="Projektleiter" sections={projektleiterSections} values={filterValues} onChange={applyFilter} />
                  </th>
                )}
                {/* Offerte/Rechnung sortieren server-seitig ueber den ganzen Bestand:
                    der View bringt den Beleg an der Projektzeile mit, sortiert wird
                    nach seinem Ablauf-Rang. Projekte ohne Beleg haengen in beiden
                    Richtungen hinten — "kein Beleg" ist keine Stufe des Ablaufs. */}
                <th style={thStyle} onClick={() => toggleSort('quote')} title="Nach dem Stand der Offerte sortieren (Entwurf → gesendet → akzeptiert). Ohne Offerte zuletzt.">
                  Offerte <SortIcon active={sortKey === 'quote'} dir={sortDir} />
                  <ColumnFilter label="Offerte" sections={quoteSections} values={filterValues} onChange={applyFilter} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('invoice')} title="Nach dem Stand der Rechnung sortieren (offen → gesendet → bezahlt). Ohne Rechnung zuletzt.">
                  Rechnung <SortIcon active={sortKey === 'invoice'} dir={sortDir} />
                  <ColumnFilter label="Rechnung" sections={invoiceSections} values={filterValues} onChange={applyFilter} />
                </th>
                {showBeschaffungCol && (
                  <th style={thStyle} onClick={() => toggleSort('workflow')} title="Wo das Projekt im Beschaffungsablauf steht. Leer = nichts bestellt.">
                    Beschaffung <SortIcon active={sortKey === 'workflow'} dir={sortDir} />
                    <ColumnFilter label="Beschaffung" sections={beschaffungSections} values={filterValues} onChange={applyFilter} />
                  </th>
                )}
                <th style={thStyle} onClick={() => toggleSort('status')}>
                  Status <SortIcon active={sortKey === 'status'} dir={sortDir} />
                  <ColumnFilter label="Status" sections={statusSections} values={filterValues} onChange={applyFilter} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('created_at')}>
                  Erstellt <SortIcon active={sortKey === 'created_at'} dir={sortDir} />
                  <ColumnFilter label="Erstellt" sections={createdSections} values={filterValues} onChange={applyFilter} />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7 + (showProjektleiterCol ? 1 : 0) + (showBeschaffungCol ? 1 : 0)} className="admin-table-empty">Keine Projekte gefunden.</td></tr>
              ) : rows.map(p => {
                const effectiveStatus: ProjectStatus = p.status ?? (p.is_closed ? 'abgeschlossen' : 'offen')
                const ort = projectLocality(p)
                return (
                  <tr key={p.id} onClick={() => setSelected(p)}>
                    <td style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {p.project_id_text || '—'}
                    </td>
                    <td><strong>{p.name}</strong></td>
                    <td>
                      {projectCustomerName(p) || '—'}
                      {/* Zweite Zeile nur, wenn die Adresse etwas hergibt — sonst
                          stuende unter jedem Namen eine leere Zeile. */}
                      {ort && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{ort}</div>}
                    </td>
                    {showProjektleiterCol && (
                      <td>{p.projektleiter_id ? (staffNameById[p.projektleiter_id] || '—') : '—'}</td>
                    )}
                    <td>
                      {p.quote ? (
                        <span className={`admin-badge ${DOC_STATUS_BADGE[p.quote.status] || 'admin-badge-draft'}`}>
                          {p.quote.status}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      {p.invoice ? (
                        <span className={`admin-badge ${DOC_STATUS_BADGE[p.invoice.status] || 'admin-badge-draft'}`}>
                          {p.invoice.status}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    {showBeschaffungCol && (
                      <td>
                        {/* Leer statt "—": solange nichts bestellt ist, LÄUFT kein
                            Beschaffungsvorgang. Ein Platzhalter würde suggerieren, dass
                            hier etwas fehlt — bei einem Reparaturprojekt ohne Materialbezug
                            fehlt aber nichts. */}
                        {beschaffungStep(p.workflow_status) ? (
                          <span className={`admin-badge ${beschaffungStep(p.workflow_status)!.badge}`}>
                            {beschaffungStep(p.workflow_status)!.label}
                          </span>
                        ) : null}
                      </td>
                    )}
                    <td>
                      <span className={`admin-badge ${PROJECT_STATUS_BADGE[effectiveStatus]}`}>
                        {PROJECT_STATUS_LABELS[effectiveStatus]}
                      </span>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>
                      {new Date(p.created_at).toLocaleDateString('de-CH')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              {rangeStart}–{rangeEnd} von {total}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={page <= 1 || loading}
                onClick={() => patch(prev => ({ page: Math.max(1, prev.page - 1) }))}
              >
                ← Zurück
              </button>
              <span style={{ fontSize: 13, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Seite
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  disabled={loading}
                  onChange={e => setPageInput(e.target.value)}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitPageInput() } }}
                  onBlur={commitPageInput}
                  aria-label="Zur Seite springen"
                  style={{ width: 52, textAlign: 'center', padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit' }}
                />
                / {totalPages}
              </span>
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={page >= totalPages || loading}
                onClick={() => patch(prev => ({ page: Math.min(totalPages, prev.page + 1) }))}
              >
                Weiter →
              </button>
            </div>
          </div>
        )}
      </div>

      <MobileFilterSheet
        open={showMobileFilter}
        sections={mobileSections}
        values={filterValues}
        onApply={applyFilter}
        onClose={() => setShowMobileFilter(false)}
      />
    </div>
  )
}

// Ueberschriften der Abschnitte im Handy-Sheet: dort fehlt der Spaltenkopf, der
// auf dem Desktop sagt, worum es geht.
const MOBILE_TITLES: Record<string, string> = {
  lifecycle: 'Status',
  projektleiterIds: 'Projektleiter',
  quoteStatus: 'Offerte',
  invoiceStatus: 'Rechnung',
  beschaffung: 'Beschaffung',
  created: 'Erstellt',
}

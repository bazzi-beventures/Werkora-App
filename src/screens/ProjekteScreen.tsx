import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError, isNetworkError } from '../api/client'
import {
  listProjectFiles, projectFileUrl, renameProjectFile, uploadProjectFile,
} from '../api/projectFiles'
import {
  createAggregateReport, deleteOwnRapport, dissolveAggregateReport, downloadRapportPdf,
  fetchBundleableReports, fetchProjectReports, markReportPartial, ProjectReport,
} from '../api/chat'
import { ProjectTask, toggleProjectTaskDone } from '../api/projectTasks'
import {
  loadOfflinePackage, rememberProjectComments, rememberProjectTasks, rememberProjects,
} from '../api/offlineStore'
import { OfflineStandBadge } from '../shared/OfflineStandBadge'
import { useOnline } from '../shared/useOnline'
import SignaturePad from '../chat/SignaturePad'
import { useBackButton } from '../shared/backButton'
import { SK } from '../api/storageKeys'
import { Wochenplan } from './projekte/Wochenplan'
import {
  QueuedTaskToggle, enqueueTaskToggle, loadTaskQueue, reconcileTaskQueue, saveTaskQueue, taskKey,
} from './projekte/taskQueue'
import { sortProjectsNewestFirst } from './projekte/sortProjects'
import { filterProjectsBySearch } from './projekte/searchProjects'
import { PROJECT_FILE_ACCEPT, projectFileIcon } from '../shared/projectFileTypes'
import { mapsUrl } from '../shared/mapsLink'
import { hasModule, isFeatureEnabled } from '../api/modules'
import { looksLikeEmail, setCustomerEmail } from '../api/customerEmail'
import {
  RAPPORT_CLOCK_IN_HINT, RAPPORT_CLOCK_IN_TITLE, useRapportClockInBlocked,
} from '../shared/rapportClockIn'
import type { UserInfo } from '../api/auth'
import { DownloadIcon } from '../shared/DownloadIcon'
import { formatDateTime } from '../shared/datetime'
import { KIND_COLORS } from './kindColors'
import { CATEGORY_LABELS, PROJECT_KIND_LABELS } from '../shared/projectDetail/types'
import type {
  MonteurProject, ProjectComment, ProjectFile, ProjectFileCategory, ProjectKind,
} from '../shared/projectDetail/types'

// Alles, was der Monteur am Projekt sieht, teilt sich die Form mit der
// Verwaltungs-Ansicht (Charge H5): Kontakte, Kunden-Embed, Dateien, Kommentare
// und die Kategorie-Beschriftungen stehen in shared/projectDetail/types, die
// Datei-Aufrufe in api/projectFiles — dort mit `/pwa` statt `/pwa/admin` davor.
const SCOPE = '/pwa' as const

// Offline-Queue für abgehakte Aufgaben (Monteur ohne Netz auf der Baustelle):
// Persistenz, Versuchs-Deckel und Reconcile stehen in projekte/taskQueue.ts —
// hier bleibt nur der Drain-Loop, der die Server-Calls macht.

// Die Form steht in shared/projectDetail/types — das Offline-Lesepaket legt
// dieselben Zeilen ab, und ein Typ, den zwei Module brauchen, gehört keinem
// Screen mehr.
type Project = MonteurProject

// Kategorien, die ein Mitarbeiter im Feld vergeben darf — echte Teilmenge der
// Kategorien aus shared/projectDetail/types. Aus dem Reiter Lieferantendokumente
// ist nur "lieferschein" dabei; Angebot Lieferant, Bestellungen und
// Auftragsbestätigung bleiben dem Admin vorbehalten. `Extract` statt einer
// zweiten Aufzählung: eine hier erfundene Kategorie fällt sofort auf.
type FileCategory = Extract<ProjectFileCategory, 'fotos' | 'masse' | 'lieferschein' | 'rapport' | 'sonstiges'>

// Der Lieferschein fehlt hier bewusst: er hat eine eigene Karte mit eigenem
// Hochladen-Knopf (siehe LIEFERSCHEIN_CATEGORY), analog zum Teilordner
// "Lieferschein" im Reiter Lieferantendokumente der Admin-Ansicht.
const FILE_CATEGORIES: { key: FileCategory; label: string }[] = [
  { key: 'fotos', label: 'Fotos' },
  { key: 'masse', label: 'Masse' },
  // Ausgefülltes Papier-Rapport-Blatt direkt auf der Baustelle abfotografieren,
  // statt es zurückzutragen. Landet im Rapporte-Tab des Projektleiters.
  { key: 'rapport', label: 'Rapport' },
  { key: 'sonstiges', label: 'Sonstiges' },
]

// Einziger Teilordner der Lieferantendokumente, den der Monteur sieht: der
// Lieferschein. Angebot Lieferant / Bestellungen / Auftragsbestätigung bleiben
// der Verwaltung vorbehalten (Einkaufspreise) — der Server filtert sie schon aus
// der Liste (ADMIN_ONLY_FILE_CATEGORIES in agents/routers/_deps.py), diese Karte
// zeigt also nie mehr, als die API ohnehin liefert.
const LIEFERSCHEIN_CATEGORY: FileCategory = 'lieferschein'

// Deklaration statt Fehlversuch (docs/specs/offline-modus.md §4.1): was offline
// nicht geht, ist ausgegraut und sagt warum. Der teure Fall ist der Upload —
// ein offline aufgenommenes Foto ging bis hierher kommentarlos verloren (der
// Upload läuft sofort, ohne Puffer). Ein IndexedDB-Puffer ist Ausbaustufe 2;
// bis dahin beseitigt das Sperren den stillen Verlust sofort.
const OFFLINE_UPLOAD_HINT = 'Hochladen braucht eine Internetverbindung.'
const OFFLINE_DOWNLOAD_HINT = 'Herunterladen braucht eine Internetverbindung.'
const OFFLINE_EMAIL_HINT = 'Die Kunden-E-Mail lässt sich nur online erfassen.'
const OFFLINE_COMMENT_HINT = 'Kommentare schreiben braucht eine Internetverbindung.'

interface Props {
  logoUrl?: string
  // Für die Feature-Abfrage (heute: `teilrapport`). Nullable wie in App.tsx —
  // ohne User keine Bedienelemente, die an einem Flag hängen.
  user: UserInfo | null
  onNavHome: () => void
  onNavRapport: () => void
  // Projekt für «Rapport erstellen» — mit der id, nicht nur dem Namen: zwei
  // Liegenschaften desselben Kunden dürfen gleich heissen, und der Monteur hat hier
  // eine konkrete davon vor sich. Nur der Name liesse die Zuordnung wieder offen.
  onStartRapport: (project: { id: string; name: string }) => void
  onNavArbeitszeit: () => void
  onNavProfile: () => void
  onLoggedOut: () => void
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function formatTime(t: string | null): string {
  if (!t) return ''
  return t.slice(0, 5)
}

function formatTimeRange(p: { start_time: string | null; end_time: string | null }): string {
  const s = formatTime(p.start_time)
  const e = formatTime(p.end_time)
  if (s && e) return `${s}–${e}`
  return s || e
}

function formatDateRange(p: { start_date: string | null; end_date: string | null }): string {
  if (!p.start_date) return ''
  if (!p.end_date || p.end_date === p.start_date) return formatDate(p.start_date)
  return `${formatDate(p.start_date)} – ${formatDate(p.end_date)}`
}

// Adresse als Kartenlink. Fällt auf reinen Text zurück, wenn nichts Brauchbares
// drinsteht — ein toter Maps-Link wäre schlimmer als gar keiner.
function MapsAddress({ address }: { address: string }) {
  const href = mapsUrl(address)
  if (!href) return <>{address}</>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${address} in Google Maps öffnen`}
      style={{
        color: 'var(--accent)', textDecoration: 'none',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
      {address}
    </a>
  )
}

// Zustands-Etikett einer Rapportzeile. Rein, damit die Zustandslogik testbar ist —
// und weil sie in beiden Listen (PWA und Admin) dieselbe sein muss.
//
// Reihenfolge = Endgültigkeit: was verrechnet ist, ist verrechnet, egal wie es
// gebündelt war. Dann der Behälter, dann das gebündelte Kind, dann das freie —
// beim freien Teilrapport ist «offen» die Aussage, auf die es ankommt
// (docs/specs/teilrapport.md §3.5: der teure Fehler ist der vergessene Einsatz).
export function reportStatusLabel(
  r: Pick<ProjectReport, 'invoice_id' | 'signature_timestamp' | 'is_partial' | 'is_aggregate'
    | 'merged_into_report_id' | 'dissolved_at' | 'pl_accepted_at'>,
  invoiceLocked: boolean,
): { text: string; tone: 'neutral' | 'warn' } {
  if (r.invoice_id) {
    return { text: invoiceLocked ? 'abgerechnet' : 'auf offener Rechnung', tone: 'neutral' }
  }
  if (r.is_aggregate) {
    if (r.dissolved_at) return { text: 'Gesamtrapport – aufgelöst', tone: 'warn' }
    if (r.signature_timestamp) return { text: 'Gesamtrapport – unterschrieben', tone: 'neutral' }
    // Vom Büro ohne Kundenunterschrift abgeschlossen: zählt als Abnahme, ist aber
    // keine Unterschrift — der Monteur soll den Unterschied sehen.
    if (r.pl_accepted_at) return { text: 'Gesamtrapport – vom Büro abgeschlossen', tone: 'neutral' }
    return { text: 'Gesamtrapport – ohne Unterschrift', tone: 'warn' }
  }
  if (r.is_partial) {
    return r.merged_into_report_id
      ? { text: 'Teilrapport – im Gesamtrapport', tone: 'neutral' }
      : { text: 'Teilrapport – offen', tone: 'warn' }
  }
  return {
    text: r.signature_timestamp ? 'unterschrieben' : 'ohne Unterschrift',
    tone: 'neutral',
  }
}

// Zwei Sichten auf dieselben Einsätze: die Kacheln beantworten «welche Aufträge
// habe ich», der Wochenplan «was steht wann an». Der Wochenplan hat den früheren
// Zeitstrahl abgelöst — der zeigte dieselben Projekte als Balken über die Tage,
// ohne Uhrzeit, Termin-Art, Adresse oder Team, und beantwortete damit die Frage
// des Monteurs auf der Baustelle gerade nicht.
type ViewMode = 'grid' | 'wochenplan'

export default function ProjekteScreen({ logoUrl, user, onNavHome, onNavRapport, onStartRapport, onNavArbeitszeit, onNavProfile, onLoggedOut }: Props) {
  // Teilrapport (docs/specs/teilrapport.md §6.2): das Flag schaltet den
  // Bündeln-Knopf. Die Badges hängen NICHT daran — sie beschreiben den Zustand der
  // Daten, und ein abgeschaltetes Flag darf einen gebündelten Rapport nicht
  // aussehen lassen wie einen gewöhnlichen.
  const teilrapportEnabled = isFeatureEnabled(user, 'teilrapport')
  // Stempel-Pflicht (Feature `rapport_nur_eingestempelt`): ausgestempelt bleibt der
  // Rapport-Knopf grau. Anders als `rapport_blocked` hängt das nicht am Projekt,
  // sondern am Benutzer — dieselbe Sperre gilt deshalb für jedes Projekt.
  const stempelBlocked = useRapportClockInBlocked(user)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Project | null>(null)
  // Netzstatus als State, damit die Sperren aus §4.1 der Spec beim Wechsel
  // umschalten statt bis zum nächsten Render stehen zu bleiben.
  const online = useOnline()
  // Der Snapshot ist pro Mitarbeiter geschlüsselt. Die id kommt aus dem
  // localStorage statt aus `user`: der erste Render hat noch keinen User, die
  // Projektliste lädt aber sofort.
  const userId = user?.authorized_user_id ?? localStorage.getItem(SK.AUTHORIZED_USER_ID) ?? ''
  // Gesetzt, sobald die Liste bzw. das Detail aus dem Lesepaket kommt statt vom
  // Server — trägt den Stand-Badge (ISO-Zeitpunkt des Snapshots).
  const [listSnapshotAt, setListSnapshotAt] = useState<string | null>(null)
  const [detailSnapshotAt, setDetailSnapshotAt] = useState<string | null>(null)
  // Netzwerkfehler ist ein FEHLERzustand mit Retry, kein leerer Normalzustand.
  // Bis hierher schluckte der `catch` alles ausser 401 und die Liste rendert
  // «Du bist keinem Projekt zugewiesen» — die einzige Aussage, die sicher falsch war.
  const [listError, setListError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [detailReloadNonce, setDetailReloadNonce] = useState(0)
  // Zurück aus dem Projekt-Detail führt in die Liste, nicht aus dem Screen heraus.
  // Einmaliger Handler genügt: `setSelected(null)` schliesst das Detail immer, und
  // beim nächsten Öffnen registriert der Hook neu.
  useBackButton(selected !== null, () => setSelected(null))
  // Warum ist «Rapport erstellen» gesperrt? Zwei unabhängige Gründe, die
  // unterschiedliche Hinweise verdienen: 'offerte' hängt am Projekt (Feature
  // rapport_offerten_annahme_pflicht, vom Server als `rapport_blocked` geliefert),
  // 'stempel' am Benutzer (Feature rapport_nur_eingestempelt). Das Projekt gewinnt,
  // wenn beides zutrifft — es ist der speziellere Grund.
  const rapportBlockReason: 'offerte' | 'stempel' | null =
    selected?.rapport_blocked ? 'offerte' : stempelBlocked ? 'stempel' : null
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  // Suche über Name und Projektnummer — ohne Tenant-Feature, also bei jedem
  // Mandanten da (siehe projekte/searchProjects.ts). Nur die Kachel-Ansicht
  // filtert damit; der Wochenplan ist eine Kalender-Darstellung, in der eine
  // ausgedünnte Woche mehr verwirrt als hilft.
  const [search, setSearch] = useState('')
  // Tenant-Feature: die Liste zeigt alle offenen Projekte des Mandanten, nicht nur
  // die eigenen Einsätze (Server-seitig, agents/routers/admin_projects.py). Hier
  // hängt nur die Beschriftung daran — "Meine Projekte" und "Du bist keinem Projekt
  // zugewiesen" wären damit schlicht falsch.
  const alleProjekteSichtbar = isFeatureEnabled(user, 'projects_show_all_to_staff')
  const gefilterteProjekte = filterProjectsBySearch(projects, search)
  // Ohne Einsatzplanung gibt es keine Termine — dann bleibt es bei den Kacheln,
  // und der Umschalter entfällt ganz (die Route /pwa/schedule/week ist ebenso gated).
  const showWochenplan = hasModule(user, 'scheduling')

  // Detail: Dateien, Kommentare & Aufgaben
  const [files, setFiles] = useState<ProjectFile[]>([])
  // Inline-Umbenennen einer Datei/eines Fotos — auch als zugewiesener Monteur, nicht nur Admin.
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [comments, setComments] = useState<ProjectComment[]>([])
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  // Rapporte des Projekts — nachlesen, was erfasst wurde (auch von Kollegen), das
  // PDF öffnen, und den eigenen Fehleintrag korrigieren, wenn er erst später auffällt
  // (im Chat gibt es den Löschen-Knopf direkt nach dem Speichern).
  const [reports, setReports] = useState<ProjectReport[]>([])
  const [deletingReportId, setDeletingReportId] = useState<number | null>(null)
  const [openingReportId, setOpeningReportId] = useState<number | null>(null)
  // Unterschrift nachtragen: der Kunde ist beim Abschluss auf der Baustelle oft
  // nicht greifbar, im Chat lässt sich der Schritt überspringen — und der Rapport
  // blieb danach unsigniert liegen, also unverrechenbar. Hier ist er wieder
  // erreichbar. Ein Rapport zur Zeit, sonst hat der Monteur zwei Unterschriftsfelder
  // untereinander und weiss nicht mehr, welches zu welchem Tag gehört.
  const [signingReportId, setSigningReportId] = useState<number | null>(null)
  // Bündeln (docs/specs/teilrapport.md §6.2): der Dialog steht in der Rapportliste,
  // vorausgewählt sind alle freien Teilrapporte. `null` = zu, sonst die angehakten IDs.
  // Die freien Teilrapporte kommen aus der eigenen Route, nicht aus `reports`:
  // der Server filtert dort zusätzlich verrechnete heraus und prüft das Feature —
  // eine lokal gefilterte Liste könnte etwas anbieten, was das Gate danach ablehnt.
  // Bündelbare Einsätze des Projekts (Server: ohne Rechnung, ohne Bündelung, ohne
  // Unterschrift) — freie Teilrapporte UND gewöhnliche Rapporte. Letztere sind der
  // häufige Fall: dass die Baustelle länger dauert, merkt man erst am zweiten Tag.
  const [bundleable, setBundleable] = useState<ProjectReport[]>([])
  // Gibt es überhaupt etwas zu bündeln? Ein laufender Teilrapport wartet immer auf
  // seinen Gesamtrapport; bei gewöhnlichen Rapporten braucht es mindestens zwei,
  // sonst stünde der Knopf an jedem Projekt mit einem einzigen offenen Rapport.
  const showAggregateButton =
    bundleable.some(r => r.is_partial) || bundleable.length >= 2
  const [markingPartialId, setMarkingPartialId] = useState<number | null>(null)
  const [aggregateSelection, setAggregateSelection] = useState<number[] | null>(null)
  const [aggregating, setAggregating] = useState(false)
  const [dissolvingId, setDissolvingId] = useState<number | null>(null)
  const [aggregateError, setAggregateError] = useState<string | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadCategory, setUploadCategory] = useState<FileCategory>('fotos')
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  // Kunden-E-Mail nachtragen (Spec docs/specs/kunden-email-erfassen.md). Das Feld
  // steht bei den Projektinfos, nicht im Rapport-Chat: gefragt wird nicht, es ist
  // eine Angabe, die man ergänzt, wenn man sie ohnehin gerade hat. `editing` ist
  // getrennt vom Leer-Fall, weil eine gepflegte Adresse zuerst als Wert dasteht
  // und erst auf «Ändern» zum Eingabefeld wird — sonst überschriebe ein
  // Fehlgriff die Adresse, die schon stimmte.
  const [emailDraft, setEmailDraft] = useState('')
  const [emailEditing, setEmailEditing] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Eigener Input für die Lieferschein-Karte: die Kategorie steckt im Aufruf, nicht
  // im State — ein gemeinsamer Input müsste uploadCategory vor dem Klick umsetzen
  // und läse beim Change-Event womöglich noch den alten Wert.
  const lieferscheinInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setListError(null)
      try {
        const data = await apiFetch('/pwa/projects') as Project[]
        if (cancelled) return
        setProjects(data)
        setListSnapshotAt(null)
        // Write-through: jeder gelungene Online-Load füllt den Snapshot nach
        // (Spec §3.3). Kostet nichts und hält ihn auch zwischen zwei Prefetches aktuell.
        rememberProjects(userId, data)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
        // isNetworkError statt isOfflineError: auch «Empfangsbalken, aber kein
        // Durchkommen» soll den Snapshot zeigen. Gefahrlos, weil rein lesend —
        // die Endlos-Queue-Falle (siehe api/client.ts) betrifft nur Schreib-Queues.
        const pkg = isNetworkError(err) ? loadOfflinePackage(userId) : null
        if (pkg && pkg.projects.length > 0) {
          setProjects(pkg.projects)
          setListSnapshotAt(pkg.savedAt)
        } else {
          setProjects([])
          setListSnapshotAt(null)
          setListError(isNetworkError(err)
            ? 'Offline — deine Projekte konnten noch nicht geladen werden.'
            : 'Die Projekte konnten nicht geladen werden.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [reloadNonce, userId])

  // Netz zurück, Screen zeigt noch Snapshot oder Fehlerzustand → sofort frisch
  // laden. Ohne das bliebe der «Offline — Stand …»-Badge stehen, bis der Screen
  // neu geöffnet wird — eine Ansicht, die «offline» behauptet, während das Gerät
  // längst wieder Empfang hat. Feuert nur beim Umschalten von offline auf online
  // (Abhängigkeit ist allein `online`), also kein Reload-Loop bei Dauerfehlern.
  useEffect(() => {
    if (!online) return
    if (listSnapshotAt !== null || listError !== null) setReloadNonce(n => n + 1)
    if (detailSnapshotAt !== null) setDetailReloadNonce(n => n + 1)
  }, [online])

  useEffect(() => {
    if (!selected) return
    setFiles([])
    setComments([])
    setTasks([])
    setReports([])
    setBundleable([])
    setAggregateSelection(null)
    setAggregateError(null)
    setDetailSnapshotAt(null)
    // Ein halb getippter Entwurf gehört zu dem Projekt, in dem er entstanden ist —
    // sonst schlüge er beim nächsten geöffneten Projekt einem fremden Kunden vor.
    setEmailDraft('')
    setEmailEditing(false)
    setEmailError(null)
    setLoadingDetail(true)
    const projectId = selected.id
    Promise.all([
      listProjectFiles(SCOPE, projectId).catch(() => [] as ProjectFile[]),
      // Kommentare und Aufgaben sind die beiden Teile, die im Lesepaket liegen —
      // deshalb `null` statt `[]` im Fehlerfall: eine leere Liste ist eine
      // Aussage («keine Kommentare»), ein fehlgeschlagener Load ist keine.
      apiFetch(`/pwa/projects/${projectId}/comments`).catch(() => null) as Promise<ProjectComment[] | null>,
      apiFetch(`/pwa/projects/${projectId}/tasks`).catch(() => null) as Promise<ProjectTask[] | null>,
      fetchProjectReports(projectId).catch(() => [] as ProjectReport[]),
      // Ohne Feature gar kein Request — die Route antwortet dann mit 403, und ein
      // erwarteter Fehler im Netzwerk-Log ist Lärm.
      teilrapportEnabled
        ? fetchBundleableReports(projectId).catch(() => [] as ProjectReport[])
        : Promise.resolve([] as ProjectReport[]),
    ]).then(([f, c, t, r, p]) => {
      setFiles(f)
      setReports(r)
      setBundleable(p)
      if (c && t) {
        setComments(c)
        setTasks(t)
        rememberProjectComments(userId, projectId, c)
        rememberProjectTasks(userId, projectId, t)
        return
      }
      // Mindestens ein Teil kam nicht durch → aus dem Lesepaket rendern, mit
      // Stand-Badge. Was durchkam, gewinnt trotzdem: es ist frischer.
      const pkg = loadOfflinePackage(userId)
      setComments(c ?? pkg?.commentsByProject[projectId] ?? [])
      setTasks(t ?? pkg?.tasksByProject[projectId] ?? [])
      if (pkg?.savedAt) setDetailSnapshotAt(pkg.savedAt)
    }).finally(() => setLoadingDetail(false))
  }, [selected?.id, userId, detailReloadNonce])

  // Re-Entrancy-Schutz: flatterndes Netz darf keine zwei Drains parallel
  // starten. Der Server-Call ist zwar idempotent (Doppel-Toggle schadet nicht),
  // aber der Guard spart überflüssige Requests und hält die Reconcile-Logik sauber.
  const drainingRef = useRef(false)

  // Offline gepufferte Abhak-Aktionen synchronisieren, sobald wieder online.
  const drainTaskQueue = useCallback(async () => {
    if (drainingRef.current) return
    if (!navigator.onLine) return
    const q = loadTaskQueue()
    if (q.length === 0) return
    drainingRef.current = true
    const remaining: QueuedTaskToggle[] = []
    const sent = new Set<string>()
    try {
      for (const item of q) {
        try {
          // queued_at = realer Abhak-Zeitpunkt von der Baustelle, nicht die Sync-Zeit.
          await toggleProjectTaskDone(item.project_id, item.task_id, item.is_done, item.queued_at)
          sent.add(taskKey(item))
        } catch {
          remaining.push({ ...item, attempts: (item.attempts ?? 0) + 1 })
        }
      }
    } finally {
      // Reconcile gegen den aktuellen Stand statt blind zu überschreiben — und
      // MIT Versuchs-Deckel: Einträge, die MAX_DRAIN_ATTEMPTS erreicht haben
      // (gelöschte Aufgabe → 404, CORS-Dauerfehler), fliegen raus statt bei
      // jedem online-Event erneut versucht zu werden. Details in taskQueue.ts.
      saveTaskQueue(reconcileTaskQueue(loadTaskQueue(), sent, remaining))
      drainingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (navigator.onLine) { void drainTaskQueue() }
    const onOnline = () => { void drainTaskQueue() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [drainTaskQueue])

  // Hakt eine Aufgabe ab: erst optimistisch lokal, dann Server bzw. Offline-Queue.
  // checkedAt ist der echte Abhak-Moment — er wird mitgeschickt (auch offline via
  // Queue), damit done_at den Zeitpunkt vom Feld zeigt und nicht die Sync-Zeit.
  async function toggleTask(task: ProjectTask) {
    if (!selected) return
    const next = !task.is_done
    const checkedAt = next ? new Date().toISOString() : null
    const myName = localStorage.getItem(SK.DISPLAY_NAME)
    const updated = tasks.map(t => t.id === task.id
      ? { ...t, is_done: next, done_at: checkedAt, done_by_name: next ? (myName ?? t.done_by_name) : null }
      : t)
    setTasks(updated)
    // Der optimistische Toggle schreibt mit — sonst zeigt die Offline-Liste
    // nach dem Abhaken wieder den alten Stand (Spec §3.3).
    rememberProjectTasks(userId, selected.id, updated)
    try {
      await toggleProjectTaskDone(selected.id, task.id, next, checkedAt)
    } catch (err) {
      // isNetworkError statt isOfflineError: Funkloch (onLine === true) muss den
      // Abhak-Vorgang queuen, sonst gilt er nur optimistisch und geht bei
      // Reload verloren. Server-Toggle ist idempotent — Doppel-Sync unschädlich.
      if (isNetworkError(err)) {
        enqueueTaskToggle({ project_id: selected.id, task_id: task.id, is_done: next, queued_at: checkedAt ?? new Date().toISOString() })
      } else {
        // Echter Fehler → NUR diesen Haken zurückrollen (nicht die ganze Liste:
        // ein parallel abgehakter zweiter Haken behält seinen Zustand), im
        // Snapshot ebenso — sonst überlebt der abgelehnte Haken den Reload.
        setTasks(prev => prev.map(t => t.id === task.id ? task : t))
        rememberProjectTasks(userId, selected.id, updated.map(t => t.id === task.id ? task : t))
      }
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, category: FileCategory) {
    if (!selected || !e.target.files?.length) return
    const filesToUpload = Array.from(e.target.files)
    const input = e.target
    setUploading(true)
    try {
      // Backend nimmt eine Datei pro Request → sequentiell hochladen
      for (const file of filesToUpload) {
        await uploadProjectFile(SCOPE, selected.id, file, category)
      }
      setFiles(await listProjectFiles(SCOPE, selected.id))
    } catch {
      // silently ignore upload errors in user view
    } finally {
      setUploading(false)
      input.value = ''  // gleiche Datei erneut auswählbar machen
    }
  }

  async function handleRenameFile(fileId: string) {
    const name = renameValue.trim()
    if (!selected || !name) { setRenamingFileId(null); return }
    try {
      await renameProjectFile(SCOPE, selected.id, fileId, name)
      setFiles(await listProjectFiles(SCOPE, selected.id))
    } catch {
      // silently ignore rename errors in user view
    } finally {
      setRenamingFileId(null)
    }
  }

  // Rapport-PDF öffnen. Der Server rendert es frisch (zugriffsgeprüft: eigener
  // Rapport oder eigenes Projekt) — deshalb Blob statt Direkt-URL.
  async function handleOpenReportPdf(report: ProjectReport) {
    setOpeningReportId(report.id)
    try {
      const { blob, filename } = await downloadRapportPdf(report.id, !!report.signature_timestamp)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Auf dem Handy öffnet der PDF-Viewer die Datei; am Desktop landet sie im
      // Download-Ordner. Ein neues Fenster (window.open) blockiert iOS Safari,
      // weil der await den User-Gesten-Kontext verliert.
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      window.alert('Rapport konnte nicht geöffnet werden.')
    } finally {
      setOpeningReportId(null)
    }
  }

  // Eigenen Fehleintrag wegräumen. Der Server lässt nur eigene, unsignierte und
  // unverrechnete Rapporte zu — hier wird der Knopf entsprechend nur dort gezeigt.
  async function handleDeleteOwnReport(report: ProjectReport) {
    if (!window.confirm(
      `Rapport vom ${formatDate(report.report_date)} wirklich löschen? `
      + 'Erfasste Stunden und Material werden mitgelöscht.'
    )) return
    setDeletingReportId(report.id)
    try {
      await deleteOwnRapport(report.id)
      setReports(prev => prev.filter(r => r.id !== report.id))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      window.alert(err instanceof Error && err.message
        ? err.message
        : 'Rapport konnte nicht gelöscht werden. Bitte melde dich beim Projektleiter.')
    } finally {
      setDeletingReportId(null)
    }
  }

  async function handleAggregate() {
    if (!selected || !aggregateSelection || aggregateSelection.length === 0) return
    setAggregating(true)
    setAggregateError(null)
    try {
      const res = await createAggregateReport(selected.id, aggregateSelection)
      // Beide Listen frisch holen statt lokal zusammenzubauen: der Behälter trägt
      // einen vom Server gebauten Beschrieb (Datum + Arbeit je Einsatz), und die
      // Kinder sind ab jetzt gesperrt. Ein selbst gestrickter Zwischenzustand wiche
      // davon ab — und die freien Teilrapporte sind es nicht mehr.
      const [fresh, freshPartials] = await Promise.all([
        fetchProjectReports(selected.id),
        fetchBundleableReports(selected.id).catch(() => [] as ProjectReport[]),
      ])
      setReports(fresh)
      setBundleable(freshPartials)
      setAggregateSelection(null)
      // Direkt in die Unterschrift — dafür wurde gebündelt. Es ist derselbe
      // Signatur-Weg wie beim gewöhnlichen Rapport (POST /pwa/chat/sign/{id}).
      setSigningReportId(res.report_id)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      setAggregateError(err instanceof Error && err.message
        ? err.message
        : 'Der Gesamtrapport konnte nicht erstellt werden.')
    } finally {
      setAggregating(false)
    }
  }

  /**
   * «Weiterer Einsatz» an einem bestehenden Rapport: nimmt ihn in die Teilrapport-
   * Serie auf und springt direkt in den Chat für den nächsten Tag.
   *
   * Der Weg rückwärts zur Abschluss-Wahl im Chat — dass eine Baustelle länger dauert,
   * stellt sich meist erst am zweiten Tag heraus. Beide Schritte in einem Griff, weil
   * sie zusammen gemeint sind: erst danach taucht der erste Tag in «Gesamtrapport
   * erstellen» auf, und im Chat ist «Teilrapport» dann von selbst vorausgewählt.
   *
   * Was der erste Rapport behält: Stunden, Material, Beschrieb, sein PDF (dort steht
   * weiterhin «Rapport») und eine bereits geholte Unterschrift. Was er verliert: die
   * Verrechenbarkeit, bis der Gesamtrapport unterschrieben ist — deshalb sagt die
   * Rückfrage es, statt es geschehen zu lassen.
   */
  async function handleAddNextEinsatz(report: ProjectReport) {
    if (!selected) return
    if (!report.is_partial && !window.confirm(
      `Rapport vom ${formatDate(report.report_date)} zur mehrtägigen Baustelle machen?\n\n`
      + 'Er wird dann zusammen mit den weiteren Einsätzen zu einem Gesamtrapport '
      + 'gebündelt, den der Kunde EINMAL unterschreibt.\n\n'
      + 'Bis dahin wird er nicht verrechnet. Stunden, Material und eine bereits '
      + 'geholte Unterschrift bleiben unverändert.'
    )) return
    setMarkingPartialId(report.id)
    setAggregateError(null)
    try {
      await markReportPartial(selected.id, report.id)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      setAggregateError(err instanceof Error && err.message
        ? err.message
        : 'Der Rapport konnte nicht zur Serie hinzugefügt werden.')
      return
    } finally {
      setMarkingPartialId(null)
    }
    // Erst jetzt in den Chat: die Liste hinter uns ist gleich weg, ein Reload wäre
    // verschenkt. Beim Zurückkommen lädt der Projekt-Detail sie ohnehin neu.
    onStartRapport({ id: String(selected.id), name: selected.name })
  }

  async function handleDissolve(report: ProjectReport) {
    if (!selected) return
    if (!window.confirm(
      'Bündelung auflösen? Die Teilrapporte werden wieder frei und lassen sich neu '
      + 'zusammenstellen. Der Gesamtrapport selbst verschwindet.'
    )) return
    setDissolvingId(report.id)
    setAggregateError(null)
    try {
      await dissolveAggregateReport(selected.id, report.id)
      const [fresh, freshPartials] = await Promise.all([
        fetchProjectReports(selected.id),
        // Ohne Feature keine Liste — auflösen bleibt trotzdem erreichbar (Spec §5.5),
        // nur den Bündeln-Dialog gibt es dann nicht.
        teilrapportEnabled
          ? fetchBundleableReports(selected.id).catch(() => [] as ProjectReport[])
          : Promise.resolve([] as ProjectReport[]),
      ])
      setReports(fresh)
      setBundleable(freshPartials)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      setAggregateError(err instanceof Error && err.message
        ? err.message
        : 'Der Gesamtrapport konnte nicht aufgelöst werden.')
    } finally {
      setDissolvingId(null)
    }
  }

  async function handleSaveCustomerEmail() {
    const customer = selected?.customer
    if (!selected || !customer) return
    const value = emailDraft.trim()
    if (!looksLikeEmail(value)) {
      setEmailError('Das sieht nicht nach einer E-Mail-Adresse aus.')
      return
    }
    setSavingEmail(true)
    setEmailError(null)
    try {
      const saved = await setCustomerEmail(selected.id, value)
      // Lokal nachziehen statt neu laden: derselbe Kunde hängt an mehreren
      // Projekten des Monteurs, und der Offline-Snapshot trägt dieselben Zeilen —
      // ohne das Nachziehen stünde die Adresse beim nächsten Öffnen wieder leer da.
      const withEmail = (p: Project): Project => (
        p.customer && p.customer.id === customer.id
          ? { ...p, customer: { ...p.customer, email: saved } }
          : p
      )
      setProjects(prev => {
        const next = prev.map(withEmail)
        rememberProjects(userId, next)
        return next
      })
      setSelected(prev => (prev ? withEmail(prev) : prev))
      setEmailEditing(false)
      setEmailDraft('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      setEmailError(isNetworkError(err)
        ? OFFLINE_EMAIL_HINT
        : 'Die Adresse konnte nicht gespeichert werden.')
    } finally {
      setSavingEmail(false)
    }
  }

  async function handleAddComment() {
    if (!selected || !newComment.trim()) return
    setAddingComment(true)
    try {
      await apiFetch(`/pwa/projects/${selected.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: newComment.trim() }),
      })
      const updated = await apiFetch(`/pwa/projects/${selected.id}/comments`) as ProjectComment[]
      setComments(updated)
      rememberProjectComments(userId, selected.id, updated)
      setNewComment('')
    } catch {
      // silently ignore
    } finally {
      setAddingComment(false)
    }
  }

  // ── Detail-Ansicht ──────────────────────────────────────────
  if (selected) {
    const projectId = selected.id
    // Lieferscheine bekommen eine eigene Karte — die Sammelliste zeigt den Rest.
    const lieferscheine = files.filter(f => f.category === LIEFERSCHEIN_CATEGORY)
    const otherFiles = files.filter(f => f.category !== LIEFERSCHEIN_CATEGORY)

    // Eine Datei-Zeile (Icon, Download-Link, Kategorie/Datum, Umbenennen) —
    // identisch in beiden Karten. In der Lieferschein-Karte bleibt die Kategorie
    // weg: sie stünde unter jeder Zeile derselben Karte.
    const renderFileRow = (f: ProjectFile, showCategory = true) => (
      <div key={f.id} className="projekte-detail-row" style={{ alignItems: 'center' }}>
        <span style={{ fontSize: 16 }}>{projectFileIcon(f.mime_type, f.filename)}</span>
        {renamingFileId === f.id ? (
          <span className="projekte-detail-value" style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); void handleRenameFile(f.id) }
                if (e.key === 'Escape') setRenamingFileId(null)
              }}
              style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--text)' }}
            />
            <button type="button" className="projekte-kontakt-link-btn" style={{ fontSize: 12 }} onClick={() => void handleRenameFile(f.id)}>✓</button>
            <button type="button" className="projekte-kontakt-link-btn" style={{ fontSize: 12 }} onClick={() => setRenamingFileId(null)}>✕</button>
          </span>
        ) : (
          <span className="projekte-detail-value" style={{ flex: 1 }}>
            {f.storage_path && online
              ? <a href={projectFileUrl(SCOPE, projectId, f.id)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{f.filename}</a>
              : f.filename
            }
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted, #888)', marginTop: 1 }}>
              {showCategory && f.category && CATEGORY_LABELS[f.category] ? `${CATEGORY_LABELS[f.category]} · ` : ''}{formatDateTime(f.created_at)}
            </span>
          </span>
        )}
        {/* Der Dateiname öffnet nur — Fotos/PDFs liefert der Proxy `inline` aus.
            Zum Speichern braucht es `?download=1` (erzwingt `attachment`).
            Offline ist der Knopf gesperrt statt in einen leeren Tab zu führen:
            die Datei liegt beim Server, nicht im Lesepaket (Spec §4.1). */}
        {renamingFileId !== f.id && f.storage_path && (
          online ? (
            <a
              href={projectFileUrl(SCOPE, projectId, f.id, { download: true })}
              download={f.filename}
              className="projekte-kontakt-link-btn"
              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center' }}
              title="Herunterladen"
              aria-label={`${f.filename} herunterladen`}
            >
              <DownloadIcon />
            </a>
          ) : (
            <span
              className="projekte-kontakt-link-btn"
              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', opacity: 0.4 }}
              title={OFFLINE_DOWNLOAD_HINT}
              aria-label={`${f.filename} herunterladen — offline nicht möglich`}
              aria-disabled="true"
            >
              <DownloadIcon />
            </span>
          )
        )}
        {renamingFileId !== f.id && (
          <button
            type="button"
            className="projekte-kontakt-link-btn"
            style={{ fontSize: 12 }}
            title="Umbenennen"
            onClick={() => { setRenamingFileId(f.id); setRenameValue(f.filename) }}
          >
            ✏️
          </button>
        )}
      </div>
    )

    return (
      <div className="app-screen">
        <div className="inner-header">
          <div className="back-btn" onClick={() => setSelected(null)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </div>
          <div className="inner-title">{selected.name}</div>
          {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
        </div>

        <div className="projekte-detail-scroll">
          {detailSnapshotAt !== null && <OfflineStandBadge savedAt={detailSnapshotAt} />}

          {/* Projektnummer: im Detail immer sichtbar, nicht nur bei Namensdopplung.
              Sie ist die Antwort, die der Rapport-Bot bei mehrdeutigem Namen
              verlangt — der Monteur muss sie irgendwo nachschlagen können. */}
          {selected.project_id_text && (
            <div className="projekte-detail-nummer">Projekt-Nr. {selected.project_id_text}</div>
          )}

          {(() => {
            const k = (selected.kind || 'project') as ProjectKind
            if (k !== 'project') {
              return (
                <div className="projekte-detail-badge-row">
                  <span
                    className="projekte-detail-badge"
                    style={{ background: KIND_COLORS[k], color: '#fff' }}
                  >
                    {PROJECT_KIND_LABELS[k]}
                  </span>
                </div>
              )
            }
            if (selected.art_der_arbeit?.length) {
              return (
                <div className="projekte-detail-badge-row">
                  {selected.art_der_arbeit.map(art => (
                    <span key={art} className="projekte-detail-badge">{art}</span>
                  ))}
                </div>
              )
            }
            return null
          })()}

          {/* Bemerkung — rot hervorgehoben */}
          {selected.bemerkung && (
            <div className="projekte-detail-card" style={{ background: 'var(--accent-red-dim)', border: '1.5px solid var(--accent-red)' }}>
              <div className="projekte-detail-title" style={{ color: '#c53030' }}>Hinweis</div>
              <div style={{ fontSize: 14, color: '#c53030', fontWeight: 500, whiteSpace: 'pre-wrap' }}>
                {selected.bemerkung}
              </div>
            </div>
          )}

          {/* Aufgaben — Checkliste vom Büro, vom Monteur abhakbar */}
          {!loadingDetail && tasks.length > 0 && (
            <div className="projekte-detail-card">
              <div className="projekte-detail-title">Aufgaben</div>
              {tasks.map(t => (
                <label
                  key={t.id}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={t.is_done}
                    onChange={() => void toggleTask(t)}
                    style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: 'var(--accent)' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      whiteSpace: 'pre-wrap',
                      textDecoration: t.is_done ? 'line-through' : 'none',
                      color: t.is_done ? 'var(--text-muted, #888)' : 'var(--text)',
                    }}>
                      {t.text}
                    </div>
                    {t.is_done && (t.done_by_name || t.done_at) && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted, #888)', marginTop: 2 }}>
                        {t.done_by_name ? `erledigt von ${t.done_by_name}` : 'erledigt'}
                        {t.done_at ? ` · ${formatDateTime(t.done_at)}` : ''}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Gerüstfach / Lagerort */}
          {selected.geruestfach != null && (
            <div className="projekte-detail-card">
              <div className="projekte-detail-title">Gerüstfach / Lagerort</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {selected.geruestfach}
              </div>
            </div>
          )}

          {/* Rapport erstellen — gesperrt aus zwei Gründen (siehe rapportBlockReason):
              keine angenommene Offerte des Projekts (Feature
              rapport_offerten_annahme_pflicht) oder kein laufender Stempel (Feature
              rapport_nur_eingestempelt). Die eigentliche Durchsetzung liegt in
              beiden Fällen im Backend: der Rapport-Chat lehnt ebenso ab, auch wenn
              das Projekt frei im Gespräch gewählt wird. */}
          <button
            type="button"
            onClick={() => onStartRapport({ id: String(selected.id), name: selected.name })}
            disabled={rapportBlockReason !== null}
            title={
              rapportBlockReason === 'offerte' ? 'Offerte noch nicht angenommen'
                : rapportBlockReason === 'stempel' ? RAPPORT_CLOCK_IN_TITLE
                  : undefined
            }
            style={{
              width: '100%',
              padding: '14px 16px',
              marginBottom: rapportBlockReason ? 6 : 12,
              borderRadius: 12,
              border: 'none',
              background: rapportBlockReason ? 'var(--surface-2, #d4d4d8)' : 'var(--accent)',
              color: rapportBlockReason ? 'var(--text-muted, #71717a)' : '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: rapportBlockReason ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: rapportBlockReason ? 'none' : '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
            Rapport erstellen
          </button>
          {rapportBlockReason && (
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted, #71717a)', textAlign: 'center' }}>
              {rapportBlockReason === 'offerte' ? (
                <>
                  Die Offerte für dieses Projekt ist noch nicht angenommen. Der Rapport ist
                  möglich, sobald der Kunde oder der Projektleiter sie angenommen hat.
                </>
              ) : RAPPORT_CLOCK_IN_HINT}
            </div>
          )}

          {/* Rapporte des Projekts — was auf diesem Auftrag bereits erfasst wurde,
              inkl. der Einträge von Kollegen (sonst schreibt der zweite Mann
              denselben Tag nochmals). Das PDF holt der Server zugriffsgeprüft.
              Löschen nur beim eigenen Rapport und solange ohne Unterschrift und ohne
              Rechnung — der Server prüft dieselben Regeln nochmals. */}
          {!loadingDetail && reports.length > 0 && (
            <div className="projekte-detail-card">
              <div className="projekte-detail-title">Rapporte</div>

              {/* Gesamtrapport erstellen: sichtbar, sobald es etwas zu bündeln GIBT —
                  ein laufender Teilrapport, oder mindestens zwei Einsätze, die noch
                  auf eine Unterschrift warten. Der zweite Fall ist der häufige: zwei
                  gewöhnliche Rapporte derselben Baustelle, weil beim ersten noch
                  niemand wusste, dass es eine Serie wird. Bei EINEM gewöhnlichen
                  Rapport bleibt der Knopf weg — ein Bündel aus einem Einsatz ist eine
                  Unterschrift auf Umwegen, dafür gibt es «Unterschrift» direkt.

                  Vorausgewählt sind alle — der Normalfall ist «die ganze Woche», und
                  Abwählen ist ein Klick. Auch die Einsätze der Kollegen stehen zur
                  Wahl: wer am Freitag beim Kunden ist, holt die Unterschrift für alle
                  (docs/specs/teilrapport.md §3.8). */}
              {teilrapportEnabled && aggregateSelection === null && showAggregateButton && (
                <button
                  type="button"
                  onClick={() => setAggregateSelection(bundleable.map(r => r.id))}
                  style={{
                    width: '100%', padding: '10px 12px', marginBottom: 4,
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--accent)',
                    background: 'transparent', color: 'var(--accent)',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  📋 Gesamtrapport erstellen ({bundleable.length} Einsätze)
                </button>
              )}

              {aggregateSelection !== null && (
                <div style={{
                  padding: 12, marginBottom: 8, borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--accent)', background: 'var(--surface, transparent)',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                    Welche Einsätze soll der Kunde unterschreiben?
                  </div>
                  {bundleable.map(p => {
                    const checked = aggregateSelection.includes(p.id)
                    return (
                      <label key={p.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '6px 0', cursor: 'pointer',
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setAggregateSelection(prev => (prev ?? []).includes(p.id)
                            ? (prev ?? []).filter(id => id !== p.id)
                            : [...(prev ?? []), p.id])}
                          style={{ width: 18, height: 18, flex: 'none', marginTop: 2 }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{formatDate(p.report_date)}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted, #71717a)', marginLeft: 8 }}>
                            {p.is_own ? 'von dir' : (p.created_by || 'Kollege')}
                          </span>
                          {p.description && (
                            <span style={{
                              display: 'block', fontSize: 13,
                              color: 'var(--text-muted, #71717a)', whiteSpace: 'pre-wrap',
                            }}>
                              {p.description}
                            </span>
                          )}
                        </span>
                      </label>
                    )
                  })}
                  {aggregateError && (
                    <div style={{ fontSize: 13, color: '#e53e3e', marginTop: 8 }}>{aggregateError}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => void handleAggregate()}
                      disabled={aggregating || aggregateSelection.length === 0}
                      style={{
                        flex: 1, minHeight: 44, borderRadius: 'var(--radius-md)', border: 'none',
                        background: aggregateSelection.length === 0
                          ? 'var(--surface-2, #d4d4d8)' : 'var(--accent)',
                        color: aggregateSelection.length === 0 ? 'var(--text-muted, #71717a)' : '#fff',
                        fontSize: 14, fontWeight: 600,
                        cursor: aggregating || aggregateSelection.length === 0 ? 'default' : 'pointer',
                      }}
                    >
                      {aggregating ? 'Wird erstellt…' : '✍️ Unterschrift holen'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAggregateSelection(null); setAggregateError(null) }}
                      disabled={aggregating}
                      style={{
                        flex: 'none', minHeight: 44, padding: '0 14px', borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border, #e5e7eb)', background: 'transparent',
                        color: 'var(--text-muted, #71717a)', fontSize: 14, fontWeight: 600,
                        cursor: aggregating ? 'default' : 'pointer',
                      }}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}

              {reports.map(r => {
                const billed = !!r.invoice_id
                const signed = !!r.signature_timestamp
                // Gebündelt heisst gesperrt — auch vor der Unterschrift (Spec §3.3).
                // Der Server lehnt es ohnehin ab; der Knopf soll gar nicht erst dastehen.
                const merged = !!r.merged_into_report_id
                const canDelete = r.is_own && !billed && !signed && !merged
                // Nachtragen ist grosszügiger als Löschen: eigener Rapport, noch
                // ohne Unterschrift — und die Rechnung darf den Kunden noch nicht
                // erreicht haben. Die blosse Verknüpfung sperrt nicht mehr, sonst
                // wäre ein still mitverrechneter Rapport nie mehr nachsignierbar.
                // Alt-Server ohne invoice_locked: dann zählt wieder die Verknüpfung.
                const invoiceLocked = r.invoice_locked ?? billed
                const status = reportStatusLabel(r, invoiceLocked)
                // Der Teilrapport wird nicht einzeln unterschrieben — dafür gibt es
                // den Gesamtrapport. Der Behälter dagegen schon: er IST der Zweck.
                //
                // Beim Gesamtrapport zählt `is_own` NICHT: er kann vom Kollegen oder
                // vom Projektleiter gebündelt worden sein (Spec §3.8/§6.3), und
                // unterschreiben lässt ihn, wer beim Kunden steht. Beim gewöhnlichen
                // Rapport bleibt es beim eigenen — dort ist die Unterschrift ein
                // Nachtrag zur eigenen Aufnahme.
                const canSign = !signed && !invoiceLocked && !r.is_partial
                  && (r.is_aggregate ? (!r.dissolved_at && !r.pl_accepted_at) : r.is_own)
                // Auflösen: eigener, unsignierter, unverrechneter Behälter (Spec §3.6).
                // Den signierten löst nur der Projektleiter auf.
                const canDissolve = r.is_own && !!r.is_aggregate && !signed && !billed && !r.dissolved_at
                // «Weiterer Einsatz»: den bestehenden Rapport in die Serie aufnehmen
                // und gleich den nächsten Tag erfassen. Spiegelt `mark_partial_blocker`
                // — verrechnet, gebündelt oder selbst ein Behälter geht nicht. Nicht
                // auf `is_own` beschränkt: die mehrtägige Baustelle ist Teamarbeit,
                // dieselbe Regel wie beim Bündeln (Spec §3.8). Der Rapport darf schon
                // Teilrapport sein — dann entfällt nur die Umstellung.
                const canAddNext = teilrapportEnabled && !billed && !merged && !r.is_aggregate
                return (
                  <div key={r.id}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '8px 0', borderTop: '1px solid var(--border, #e5e7eb)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {formatDate(r.report_date)}
                        <span style={{
                          marginLeft: 8, fontSize: 12, fontWeight: 500,
                          color: status.tone === 'warn'
                            ? 'var(--accent-amber)'
                            : 'var(--text-muted, #71717a)',
                        }}>
                          {status.text}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted, #71717a)', marginTop: 1 }}>
                        {r.is_own ? 'von dir erfasst' : (r.created_by || 'Kollege')}
                      </div>
                      {r.description && (
                        <div style={{ fontSize: 13, color: 'var(--text-muted, #71717a)', whiteSpace: 'pre-wrap' }}>
                          {r.description}
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => void handleOpenReportPdf(r)}
                        // Das PDF baut der Server bei jedem Aufruf neu — offline
                        // gibt es nichts zu öffnen, also gar nicht erst anbieten.
                        disabled={openingReportId === r.id || !online}
                        title={online ? undefined : OFFLINE_DOWNLOAD_HINT}
                        style={{
                          padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--accent)', background: 'transparent',
                          color: 'var(--accent)', fontSize: 13, fontWeight: 600,
                          opacity: online ? 1 : 0.5,
                          cursor: openingReportId === r.id || !online ? 'default' : 'pointer',
                        }}
                      >
                        {openingReportId === r.id ? '…' : '📄 Ansehen'}
                      </button>
                      {canSign && signingReportId !== r.id && (
                        <button
                          type="button"
                          onClick={() => setSigningReportId(r.id)}
                          style={{
                            padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--accent-green, #16a34a)', background: 'transparent',
                            color: 'var(--accent-green, #16a34a)', fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          ✍️ Unterschrift
                        </button>
                      )}
                      {canAddNext && (
                        <button
                          type="button"
                          onClick={() => void handleAddNextEinsatz(r)}
                          disabled={markingPartialId === r.id}
                          title={r.is_partial
                            ? 'Noch einen Einsatz auf dieser Baustelle erfassen'
                            : 'Mehrtägige Baustelle: diesen Rapport in die Serie aufnehmen und den nächsten Einsatz erfassen'}
                          style={{
                            padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--accent)', background: 'transparent',
                            color: 'var(--accent)', fontSize: 13, fontWeight: 600,
                            cursor: markingPartialId === r.id ? 'default' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {markingPartialId === r.id ? '…' : '➕ Weiterer Einsatz'}
                        </button>
                      )}
                      {canDissolve && (
                        <button
                          type="button"
                          onClick={() => void handleDissolve(r)}
                          disabled={dissolvingId === r.id}
                          style={{
                            padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--text-muted, #71717a)', background: 'transparent',
                            color: 'var(--text-muted, #71717a)', fontSize: 13, fontWeight: 600,
                            cursor: dissolvingId === r.id ? 'default' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {dissolvingId === r.id ? '…' : 'Bündelung auflösen'}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteOwnReport(r)}
                          disabled={deletingReportId === r.id}
                          style={{
                            padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid #e53e3e', background: 'transparent',
                            color: '#e53e3e', fontSize: 13, fontWeight: 600,
                            cursor: deletingReportId === r.id ? 'default' : 'pointer',
                          }}
                        >
                          {deletingReportId === r.id ? '…' : 'Löschen'}
                        </button>
                      )}
                    </div>
                  </div>
                  {signingReportId === r.id && (
                    <SignaturePad
                      reportId={r.id}
                      skipLabel="Abbrechen"
                      onDone={(justSigned) => {
                        setSigningReportId(null)
                        // Die Zeile lokal auf "unterschrieben" setzen: das PDF baut
                        // der Server im Hintergrund, ein Neuladen der Liste käme zu
                        // früh und zeigte den Rapport weiter als unsigniert. Der
                        // Zeitstempel ist damit ein paar Sekunden vor dem in der DB —
                        // sichtbar ist ohnehin nur der Zustand, nicht die Uhrzeit.
                        if (justSigned) {
                          setReports(prev => prev.map(x => x.id === r.id
                            ? { ...x, signature_timestamp: new Date().toISOString() }
                            : x))
                        }
                      }}
                      onLoggedOut={onLoggedOut}
                    />
                  )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Projektinfos. Adressen sind Kartenlinks — antippen führt direkt in die
              Navigation, statt die Adresse abzutippen. Die Kundenadresse steht nur
              dann zusätzlich da, wenn sie sich von der Objektadresse unterscheidet. */}
          {(() => {
            const objectAddress = selected.object_address || selected.customer?.object_address || null
            const customerAddress = selected.customer?.address || null
            const showCustomerAddress = !!customerAddress
              && customerAddress.trim() !== (objectAddress ?? '').trim()
            const customerEmail = (selected.customer?.email ?? '').trim()
            // Eingabefeld statt Anzeige: entweder es gibt noch keine Adresse, oder
            // der Monteur hat «Ändern» gedrückt. Ohne Kundenzeile am Projekt
            // (Skeleton) entfällt die Zeile ganz — es gäbe nichts, woran die
            // Adresse hängen könnte, und der Server wiese sie mit 400 ab.
            const emailInputOpen = !customerEmail || emailEditing
            return (
              <div className="projekte-detail-card">
                <div className="projekte-detail-title">Projektinfos</div>
                {(selected.customer?.billing_name || selected.customer?.name) && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Kunde</span>
                    <span className="projekte-detail-value">{selected.customer?.billing_name || selected.customer?.name}</span>
                  </div>
                )}
                {/* Kunden-E-Mail — die einzige Zeile dieser Karte, die man
                    beschreiben kann (Spec docs/specs/kunden-email-erfassen.md).
                    Bei vielen Kunden fehlt die Adresse, und der Einsatz ist die
                    Gelegenheit, sie zu bekommen: der Monteur steht neben dem
                    Kunden. Im Rapport-Chat wird bewusst NICHT danach gefragt —
                    dort ist sie eine Frage zu viel; hier ist sie ein Feld, das man
                    ausfüllt, wenn man die Angabe gerade hat. */}
                {selected.customer && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Kunden-E-Mail</span>
                    <span className="projekte-detail-value" style={{ flex: 1, minWidth: 0 }}>
                      {emailInputOpen ? (
                        <>
                          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="email"
                              inputMode="email"
                              autoCapitalize="off"
                              autoCorrect="off"
                              spellCheck={false}
                              aria-label="Kunden-E-Mail"
                              placeholder="name@firma.ch"
                              value={emailDraft}
                              disabled={savingEmail || !online}
                              onChange={e => { setEmailDraft(e.target.value); setEmailError(null) }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); void handleSaveCustomerEmail() }
                                if (e.key === 'Escape' && customerEmail) { setEmailEditing(false); setEmailDraft('') }
                              }}
                              style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--text)' }}
                            />
                            <button
                              type="button"
                              className="projekte-kontakt-link-btn"
                              style={{ fontSize: 12 }}
                              disabled={savingEmail || !online || !emailDraft.trim()}
                              title={online ? undefined : OFFLINE_EMAIL_HINT}
                              onClick={() => void handleSaveCustomerEmail()}
                            >
                              {savingEmail ? '…' : 'Speichern'}
                            </button>
                            {customerEmail && (
                              <button
                                type="button"
                                className="projekte-kontakt-link-btn"
                                style={{ fontSize: 12 }}
                                disabled={savingEmail}
                                onClick={() => { setEmailEditing(false); setEmailDraft(''); setEmailError(null) }}
                              >
                                ✕
                              </button>
                            )}
                          </span>
                          {emailError && (
                            <span style={{ display: 'block', fontSize: 12, color: 'var(--danger, #ef4444)', marginTop: 4 }}>
                              {emailError}
                            </span>
                          )}
                          {!online && !emailError && (
                            <span className="projekte-offline-hint">{OFFLINE_EMAIL_HINT}</span>
                          )}
                        </>
                      ) : (
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <a href={`mailto:${customerEmail}`} style={{ color: 'var(--accent)', textDecoration: 'none', minWidth: 0, overflowWrap: 'anywhere' }}>
                            {customerEmail}
                          </a>
                          <button
                            type="button"
                            className="projekte-kontakt-link-btn"
                            style={{ fontSize: 12 }}
                            disabled={!online}
                            title={online ? 'Adresse korrigieren' : OFFLINE_EMAIL_HINT}
                            onClick={() => { setEmailDraft(customerEmail); setEmailEditing(true) }}
                          >
                            Ändern
                          </button>
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {selected.object_name && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Objekt</span>
                    <span className="projekte-detail-value">{selected.object_name}</span>
                  </div>
                )}
                {objectAddress && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Objektadresse</span>
                    <span className="projekte-detail-value">
                      <MapsAddress address={objectAddress} />
                    </span>
                  </div>
                )}
                {showCustomerAddress && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Kundenadresse</span>
                    <span className="projekte-detail-value">
                      <MapsAddress address={customerAddress} />
                    </span>
                  </div>
                )}
                {selected.projektleiter_name && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Projektleiter</span>
                    <span className="projekte-detail-value">{selected.projektleiter_name}</span>
                  </div>
                )}
                {!selected.customer && !selected.object_name && !objectAddress
                  && !selected.projektleiter_name && (
                  <div className="projekte-detail-empty">Keine weiteren Informationen eingetragen.</div>
                )}
              </div>
            )
          })()}

          {/* Einsatz-Termin */}
          {selected.start_date && (
            <div className="projekte-detail-card projekte-detail-card-accent">
              <div className="projekte-detail-title">Einsatz</div>
              <div className="projekte-detail-termin-date">
                {formatDateRange(selected)}
                {formatTimeRange(selected) && ` · ${formatTimeRange(selected)}`}
              </div>
            </div>
          )}

          {/* Kontakte — Baustellenkontakt zuerst */}
          {(selected.kontakte ?? []).length > 0 && (
            <div className="projekte-detail-card">
              <div className="projekte-detail-title">Kontakte</div>
              {[...selected.kontakte]
                .sort((a, b) => Number(!!b.is_site_contact) - Number(!!a.is_site_contact))
                .map((k, i) => (
                <div
                  key={i}
                  className="projekte-kontakt-item"
                  style={k.is_site_contact ? { background: '#fff8e6', border: '1.5px solid #f5a623', borderRadius: 'var(--radius-sm)', padding: 10, marginBottom: 8 } : undefined}
                >
                  <div className="projekte-kontakt-item-header">
                    <span className="projekte-kontakt-item-name">{k.name}</span>
                    {k.is_site_contact && (
                      <span
                        className="projekte-kontakt-item-rolle"
                        style={{ background: '#f5a623', color: '#fff', fontWeight: 600 }}
                      >
                        ★ Vor Ort
                      </span>
                    )}
                    {k.from_customer
                      ? <span className="projekte-kontakt-item-rolle">Kunde (keine Ansprechperson hinterlegt)</span>
                      : k.kommentar && <span className="projekte-kontakt-item-rolle">{k.kommentar}</span>}
                  </div>
                  <div className="projekte-kontakt-item-links">
                    {k.telefon && (
                      <a className="projekte-kontakt-link-btn" href={`tel:${k.telefon}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.62 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        {k.telefon}
                      </a>
                    )}
                    {k.email && (
                      <a className="projekte-kontakt-link-btn" href={`mailto:${k.email}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        {k.email}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Dokumente & Fotos */}
          {!loadingDetail && (
            <div className="projekte-detail-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                <div className="projekte-detail-title" style={{ margin: 0 }}>Dokumente & Fotos</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select
                    value={uploadCategory}
                    onChange={e => setUploadCategory(e.target.value as FileCategory)}
                    disabled={uploading}
                    aria-label="Kategorie"
                    style={{ fontSize: 12, padding: '5px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface, #fff)', color: 'var(--text)' }}
                  >
                    {FILE_CATEGORIES.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={PROJECT_FILE_ACCEPT}
                    multiple
                    aria-label="Datei hochladen"
                    style={{ display: 'none' }}
                    onChange={e => handleUpload(e, uploadCategory)}
                  />
                  <button
                    type="button"
                    className="projekte-kontakt-link-btn"
                    style={{ fontSize: 12 }}
                    disabled={uploading || !online}
                    title={online ? undefined : OFFLINE_UPLOAD_HINT}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? 'Lädt…' : '+ Hochladen'}
                  </button>
                </div>
              </div>
              {!online && <div className="projekte-offline-hint">{OFFLINE_UPLOAD_HINT}</div>}
              {otherFiles.length === 0 && (
                <div className="projekte-detail-empty">Noch keine Dateien hochgeladen.</div>
              )}
              {otherFiles.map(f => renderFileRow(f))}
            </div>
          )}

          {/* Lieferscheine — derselbe Teilordner wie im Reiter Lieferantendokumente
              der Admin-Ansicht, damit der Monteur den vom Büro abgelegten
              Lieferschein auf der Baustelle dabeihat (und den eigenen dort ablegt,
              wo er ihn sucht). Eigene Karte statt einer Zeile in der Sammelliste:
              sonst verschwindet er zwischen den Baustellenfotos. */}
          {!loadingDetail && (
            <div className="projekte-detail-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                <div className="projekte-detail-title" style={{ margin: 0 }}>Lieferscheine</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    ref={lieferscheinInputRef}
                    type="file"
                    accept={PROJECT_FILE_ACCEPT}
                    multiple
                    aria-label="Lieferschein hochladen"
                    style={{ display: 'none' }}
                    onChange={e => handleUpload(e, LIEFERSCHEIN_CATEGORY)}
                  />
                  <button
                    type="button"
                    className="projekte-kontakt-link-btn"
                    style={{ fontSize: 12 }}
                    disabled={uploading || !online}
                    title={online ? undefined : OFFLINE_UPLOAD_HINT}
                    onClick={() => lieferscheinInputRef.current?.click()}
                  >
                    {uploading ? 'Lädt…' : '+ Lieferschein'}
                  </button>
                </div>
              </div>
              {lieferscheine.length === 0 && (
                <div className="projekte-detail-empty">Noch kein Lieferschein vorhanden.</div>
              )}
              {lieferscheine.map(f => renderFileRow(f, false))}
            </div>
          )}

          {/* Kommentare */}
          {!loadingDetail && (
            <div className="projekte-detail-card">
              <div className="projekte-detail-title">Kommentare</div>
              {comments.length === 0 && (
                <div className="projekte-detail-empty" style={{ marginBottom: 10 }}>Noch keine Kommentare.</div>
              )}
              {comments.map(c => (
                <div key={c.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{c.author_name || 'Unbekannt'}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted, #888)' }}>{formatDateTime(c.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>{c.text}</div>
                </div>
              ))}
              {/* Lesen ja, schreiben braucht Netz (Spec §4.3). Offline gesperrt
                  statt nach dem Tippen abgelehnt — es gibt keine Kommentar-Queue. */}
              {!online && <div className="projekte-offline-hint">{OFFLINE_COMMENT_HINT}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--text)' }}
                  placeholder="Kommentar…"
                  value={newComment}
                  disabled={!online}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleAddComment() } }}
                />
                <button
                  type="button"
                  disabled={addingComment || !newComment.trim() || !online}
                  onClick={handleAddComment}
                  style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: addingComment || !newComment.trim() || !online ? 0.5 : 1 }}
                >
                  {addingComment ? '…' : 'Senden'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="nav-bar">
          <div className="nav-item" onClick={onNavHome}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
            <span>Home</span>
          </div>
          <div className="nav-item" onClick={onNavArbeitszeit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Arbeitszeit</span>
          </div>
          <div className="nav-item active">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <path d="M9 22V12h6v10"/>
            </svg>
            <span>Projekte</span>
          </div>
          <div className="nav-item" onClick={onNavProfile}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>Profil</span>
          </div>
        </div>
      </div>
    )
  }

  // ── Kachel-Übersicht ────────────────────────────────────────

  return (
    <div className="app-screen">
      <div className="inner-header">
        <div className="inner-title">{alleProjekteSichtbar ? 'Projekte' : 'Meine Projekte'}</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      {!loading && projects.length > 0 && showWochenplan && (
        <div className="projekte-view-toggle">
          <button
            type="button"
            className={`projekte-view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="2" width="5" height="5" rx="1"/>
              <rect x="9" y="2" width="5" height="5" rx="1"/>
              <rect x="2" y="9" width="5" height="5" rx="1"/>
              <rect x="9" y="9" width="5" height="5" rx="1"/>
            </svg>
            Kacheln
          </button>
          <button
            type="button"
            className={`projekte-view-toggle-btn ${viewMode === 'wochenplan' ? 'active' : ''}`}
            onClick={() => setViewMode('wochenplan')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="3" width="12" height="11" rx="1.5"/>
              <path d="M2 6.5h12M5.5 1.5V4M10.5 1.5V4"/>
            </svg>
            Wochenplan
          </button>
        </div>
      )}

      {viewMode === 'wochenplan' && (
        <Wochenplan projects={projects} userId={userId} onSelect={setSelected} onLoggedOut={onLoggedOut} />
      )}

      {/* Suche über Name und Projektnummer. Steht ausserhalb von
          `projekte-grid-scroll`, damit sie beim Scrollen der Kacheln stehen bleibt —
          bei einer langen Liste (Feature `projects_show_all_to_staff`) ist genau das
          der Fall, in dem man sie braucht. Bewusst ohne Mindest-Listenlänge: ein
          Feld, das mal da ist und mal nicht, sucht man beim nächsten Mal zuerst. */}
      {viewMode === 'grid' && !loading && projects.length > 0 && (
        <div className="projekte-suche">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5"/>
            <path d="M10.5 10.5L14 14"/>
          </svg>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Projekt oder Nummer suchen"
            aria-label="Projekt oder Nummer suchen"
            enterKeyHint="search"
            autoComplete="off"
          />
          {search !== '' && (
            <button
              type="button"
              className="projekte-suche-clear"
              onClick={() => setSearch('')}
              aria-label="Suche leeren"
            >
              ×
            </button>
          )}
        </div>
      )}

      {viewMode === 'grid' && (
      <div className="projekte-grid-scroll">
        {loading && (
          <div className="bericht-loading">Projekte werden geladen…</div>
        )}

        {!loading && listSnapshotAt !== null && <OfflineStandBadge savedAt={listSnapshotAt} />}

        {/* Ehrlicher Fehlerzustand statt eines leeren Normalzustands: «Du bist
            keinem Projekt zugewiesen» stand hier auch dann, wenn bloss das Netz
            fehlte — die einzige Aussage, die sicher falsch war. */}
        {!loading && listError !== null && (
          <div className="projekte-empty">
            {listError}
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="projekte-kontakt-link-btn"
                onClick={() => setReloadNonce(n => n + 1)}
              >
                Erneut versuchen
              </button>
            </div>
          </div>
        )}

        {!loading && listError === null && projects.length === 0 && (
          <div className="projekte-empty">
            {alleProjekteSichtbar
              ? 'Zurzeit gibt es keine offenen Projekte.'
              : 'Du bist keinem Projekt zugewiesen.'}
          </div>
        )}

        {/* Treffer-Null ist nicht dasselbe wie Liste-leer: hier hilft kein
            "erneut versuchen", sondern ein anderer Suchbegriff. */}
        {!loading && listError === null && projects.length > 0 && gefilterteProjekte.length === 0 && (
          <div className="projekte-empty">
            Kein Projekt gefunden für «{search.trim()}».
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="projekte-kontakt-link-btn"
                onClick={() => setSearch('')}
              >
                Suche zurücksetzen
              </button>
            </div>
          </div>
        )}

        {!loading && gefilterteProjekte.length > 0 && (() => {
          // Namen dürfen sich doppeln (zwei Liegenschaften desselben Kunden heissen
          // gleich). Dann — und nur dann — trägt die Kachel zusätzlich die
          // Projektnummer: sonst stehen zwei identische Kacheln untereinander und der
          // Monteur tippt auf gut Glück. Im Normalfall bleibt die Nummer weg, sie ist
          // für ihn keine Information, sondern Rauschen.
          const nameCount = new Map<string, number>()
          gefilterteProjekte.forEach(p => nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1))
          const groupMap = new Map<string, Project[]>()
          const noDateKey = '__none__'
          gefilterteProjekte.forEach(p => {
            const key = p.start_date || noDateKey
            const arr = groupMap.get(key) ?? []
            arr.push(p)
            groupMap.set(key, arr)
          })
          const groups = Array.from(groupMap.entries())
            // Neuester Tag zuerst: der aktuelle Auftrag steht oben, Altes rutscht
            // nach unten. "Ohne Termin" bleibt in beiden Richtungen am Ende.
            .sort(([a], [b]) => {
              if (a === noDateKey) return 1
              if (b === noDateKey) return -1
              return b.localeCompare(a)
            })
            // Innerhalb des Tages weiterhin nach Startzeit aufsteigend — der
            // Monteur arbeitet einen Tag von oben nach unten ab.
            .map(([dateKey, groupProjects]) =>
              [dateKey, sortProjectsNewestFirst(groupProjects)] as const)

          return (
            <div className="projekte-grouped">
              {groups.map(([dateKey, groupProjects]) => (
                <div key={dateKey} className="projekte-group">
                  <div className="projekte-group-header">
                    <span className="projekte-group-date">
                      {dateKey === noDateKey ? 'Ohne Termin' : formatDate(dateKey)}
                    </span>
                    <span className="projekte-group-line" />
                  </div>
                  <div className="projekte-group-tiles">
                    {groupProjects.map(p => {
                      const timeLabel = formatTimeRange(p)
                      const kind = (p.kind || 'project') as ProjectKind
                      const isInternal = kind !== 'project'
                      const tileColor = KIND_COLORS[kind] || KIND_COLORS.project
                      return (
                        <div key={p.id} className="projekte-tile" onClick={() => setSelected(p)}>
                          <div className="projekte-tile-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke={tileColor} strokeWidth="1.8">
                              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                              <path d="M9 22V12h6v10"/>
                            </svg>
                          </div>
                          {/* Eigener Textblock: die Kachel ist eine Zeile über die
                              volle Breite (Icon | Text | Pfeil), nicht mehr eine
                              von zwei Spalten. */}
                          <div className="projekte-tile-body">
                            <div className="projekte-tile-name">{p.name}</div>
                            {/* Sonst nur bei doppelten Namen. Während einer Suche
                                immer: wer nach einer Nummer sucht, will an der
                                Kachel sehen, dass es die richtige ist. */}
                            {(search.trim() !== '' || (nameCount.get(p.name) ?? 0) > 1) && p.project_id_text && (
                              <div className="projekte-tile-nummer">Nr. {p.project_id_text}</div>
                            )}
                            <div className="projekte-tile-sub" style={isInternal ? { color: tileColor, fontWeight: 600 } : undefined}>
                              {isInternal
                                ? PROJECT_KIND_LABELS[kind]
                                : (p.art_der_arbeit?.length ? p.art_der_arbeit.join(', ') : (p.customer?.billing_name || p.customer?.name || '—'))}
                            </div>
                            {p.bemerkung && (
                              <div className="projekte-tile-hinweis">⚠ {p.bemerkung}</div>
                            )}
                            {p.start_date && (
                              <div className="projekte-tile-termin">
                                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <rect x="1" y="3" width="14" height="12" rx="2"/>
                                  <path d="M5 1v3M11 1v3M1 7h14"/>
                                </svg>
                                {timeLabel || formatDate(p.start_date)}
                              </div>
                            )}
                          </div>
                          <div className="projekte-tile-arrow">
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 8h10M9 4l4 4-4 4"/>
                            </svg>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

      </div>
      )}

      <div className="nav-bar">
        <div className="nav-item" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span>Home</span>
        </div>
        <div className="nav-item" onClick={onNavArbeitszeit}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>Arbeitszeit</span>
        </div>
        <div className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <path d="M9 22V12h6v10"/>
          </svg>
          <span>Projekte</span>
        </div>
        <div className="nav-item" onClick={onNavProfile}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Profil</span>
        </div>
      </div>
    </div>
  )
}

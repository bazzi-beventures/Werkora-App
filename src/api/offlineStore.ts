// Offline-Lesepaket der Mitarbeiter-PWA (docs/specs/offline-modus.md §3).
//
// Baustellen sind der Funkloch-Fall schlechthin. Stempeln, Abhaken und
// Projekt-Entwürfe haben längst echte Offline-Queues — die LESESEITE hing
// dagegen am `api-cache` des Service-Workers, und der ist Beifang, kein Konzept:
// der Boot-Kill-Switch leert ihn bei jedem Deploy (und das soll er — er
// garantiert Build-Konsistenz), die App kann ihn nicht befragen (kein
// Alters-Badge, kein gezielter Empty-State) und in jsdom ist er nicht testbar.
// Ergebnis: der Monteur öffnete offline «Meine Projekte» und las «Du bist keinem
// Projekt zugewiesen» — die App wirkte funktionsfähig und war es halb.
//
// Dieses Modul ist der bewusste Gegenentwurf: EIN localStorage-Key pro
// Mitarbeiter, von der App selbst geschrieben, versionierbar über
// APP_DATA_VERSION, überlebt Deploys und ist im Test lesbar.
//
// Zwei Regeln, die überall in diesem Modul gelten:
//   * Schreiben ist best-effort. Ein voller Storage darf nie einen Screen
//     brechen — die App fällt dann auf das heutige Verhalten zurück
//     (online-only Lesen), nie auf etwas Schlechteres.
//   * Der Snapshot ist rein LESEND. Aktionen (Abhaken, Stempeln) validiert
//     weiterhin der Server; ein inzwischen geschlossenes Projekt kann angezeigt,
//     aber nicht falsch bearbeitet werden.

import { apiFetch } from './client'
import type { ProjectTask } from './projectTasks'
import type { ScheduleWeek } from './schedule'
import { mondayOfISO, shiftDayISO, todayISO } from './schedule'
import type { MonteurProject, ProjectComment } from '../shared/projectDetail/types'

/** Prefix des Snapshot-Keys. Muss mit der `isKnownKey`-Whitelist in
 *  storageMigrations.ts übereinstimmen — sonst räumt der nächste Schema-Wechsel
 *  das Lesepaket weg. Wie `rapport-draft:` bewusst OHNE Env-Suffix: der Key trägt
 *  die User-id, und Prod/Staging teilen sich keinen eingeloggten Nutzer. */
export const OFFLINE_PACKAGE_PREFIX = 'offline-lesepaket:'

export function offlinePackageKey(userId: string): string {
  return `${OFFLINE_PACKAGE_PREFIX}${userId}`
}

export interface OfflinePackage {
  /** Wann das Paket zuletzt geschrieben wurde (ISO). Speist den Stand-Badge. */
  savedAt: string
  projects: MonteurProject[]
  tasksByProject: Record<string, ProjectTask[]>
  commentsByProject: Record<string, ProjectComment[]>
  /** Wochenplan, nach Montag (ISO) abgelegt — dieselbe Schlüsselform wie im
   *  Wochenplan-State. */
  scheduleWeeks: Record<string, ScheduleWeek>
}

// Deckel gegen das 5-MB-localStorage-Budget (Spec §3.2). `/pwa/projects` liefert
// nur die zugewiesenen OFFENEN Projekte — typisch einstellig; die Deckel sind
// die Notbremse für den Ausreisser, nicht der Normalfall.
export const MAX_PROJECTS = 30
export const MAX_TASKS_PER_PROJECT = 50
export const MAX_COMMENTS_PER_PROJECT = 20
export const MAX_WEEKS = 2

/** Ab hier gilt der Stand als alt: Datum dazu, Warnfarbe an. Der Snapshot
 *  verfällt trotzdem nicht — auf der Baustelle sind alte Daten besser als keine
 *  (Spec §3.4). Sichtbar muss das Alter sein, nicht tödlich. */
export const SNAPSHOT_STALE_MS = 24 * 60 * 60 * 1000

/** Frühestens alle 15 Minuten prefetchen. Verglichen wird gegen `savedAt`, nicht
 *  gegen einen RAM-Zähler: ein Neustart der App soll nicht jedes Mal 5–25 GETs
 *  auslösen. */
export const PREFETCH_MIN_INTERVAL_MS = 15 * 60 * 1000

function emptyPackage(): OfflinePackage {
  return { savedAt: '', projects: [], tasksByProject: {}, commentsByProject: {}, scheduleWeeks: {} }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Nimmt nur an, was die erwartete Grobform hat. Ein halb geschriebener oder von
 *  einer älteren Version stammender Eintrag darf den Screen nicht sprengen —
 *  lieber ein leerer Teil als ein Absturz beim Rendern. */
function sanitizeMap<T>(raw: unknown, cap: number): Record<string, T[]> {
  if (!isRecord(raw)) return {}
  const out: Record<string, T[]> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) out[k] = v.slice(0, cap) as T[]
  }
  return out
}

/** Liest das Paket eines Mitarbeiters. `null`, wenn keins da ist oder der
 *  Inhalt unbrauchbar ist — der Aufrufer behandelt beides gleich. */
export function loadOfflinePackage(userId: string): OfflinePackage | null {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(offlinePackageKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    if (!Array.isArray(parsed.projects)) return null
    return {
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      projects: (parsed.projects as MonteurProject[]).slice(0, MAX_PROJECTS),
      tasksByProject: sanitizeMap<ProjectTask>(parsed.tasksByProject, MAX_TASKS_PER_PROJECT),
      commentsByProject: sanitizeMap<ProjectComment>(parsed.commentsByProject, MAX_COMMENTS_PER_PROJECT),
      scheduleWeeks: isRecord(parsed.scheduleWeeks)
        ? (parsed.scheduleWeeks as Record<string, ScheduleWeek>)
        : {},
    }
  } catch {
    return null
  }
}

/** Distanz einer Woche zum laufenden Montag, in Millisekunden. Basis der
 *  Wochen-Auswahl: das Paket hält die laufende und die folgende KW — wer weit
 *  vorausblättert, bekommt seine Woche zwar zu sehen, verdrängt damit aber nicht
 *  die, in der er morgen arbeitet. */
function weekDistance(mondayIso: string, referenceMonday: string): number {
  const a = Date.parse(`${mondayIso}T00:00:00Z`)
  const b = Date.parse(`${referenceMonday}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.MAX_SAFE_INTEGER
  return Math.abs(a - b)
}

/** Wendet alle Deckel an und wirft weg, was zu keinem Projekt der Liste mehr
 *  gehört. Ohne dieses Aufräumen wüchse `tasksByProject` mit jedem je geöffneten
 *  Projekt weiter, auch lange nachdem es abgeschlossen ist.
 *
 *  `keepWeek` ist die gerade geschriebene Woche: sie überlebt das Kürzen immer,
 *  sonst hätte ein Write-through beim Vorausblättern keinen Effekt. */
export function capPackage(pkg: OfflinePackage, keepWeek?: string): OfflinePackage {
  const projects = pkg.projects.slice(0, MAX_PROJECTS)
  const known = new Set(projects.map(p => p.id))

  const tasksByProject: Record<string, ProjectTask[]> = {}
  for (const [id, list] of Object.entries(pkg.tasksByProject)) {
    if (known.has(id)) tasksByProject[id] = list.slice(0, MAX_TASKS_PER_PROJECT)
  }
  const commentsByProject: Record<string, ProjectComment[]> = {}
  for (const [id, list] of Object.entries(pkg.commentsByProject)) {
    if (known.has(id)) commentsByProject[id] = list.slice(0, MAX_COMMENTS_PER_PROJECT)
  }

  const reference = mondayOfISO(todayISO())
  const weekKeys = Object.keys(pkg.scheduleWeeks).sort((a, b) => {
    if (keepWeek) {
      if (a === keepWeek) return -1
      if (b === keepWeek) return 1
    }
    return weekDistance(a, reference) - weekDistance(b, reference)
  }).slice(0, MAX_WEEKS)
  const scheduleWeeks: Record<string, ScheduleWeek> = {}
  for (const k of weekKeys) scheduleWeeks[k] = pkg.scheduleWeeks[k]

  return { savedAt: pkg.savedAt, projects, tasksByProject, commentsByProject, scheduleWeeks }
}

/** Schreibt das Paket. Best-effort — schlägt es fehl (Storage voll, Private
 *  Mode), bleibt der alte Stand liegen und der Aufrufer merkt nichts. */
export function saveOfflinePackage(userId: string, pkg: OfflinePackage, keepWeek?: string): void {
  if (!userId) return
  try {
    localStorage.setItem(offlinePackageKey(userId), JSON.stringify(capPackage(pkg, keepWeek)))
  } catch {
    // Storage voll / privat / blockiert — Persistenz ist best-effort (Spec §3.2).
  }
}

/** Liest, ändert, schreibt. Einziger Schreibweg von aussen, damit die Deckel
 *  und das `savedAt` an genau einer Stelle gesetzt werden. */
function updatePackage(
  userId: string,
  now: Date,
  mutate: (pkg: OfflinePackage) => string | undefined,
): void {
  if (!userId) return
  const pkg = loadOfflinePackage(userId) ?? emptyPackage()
  const keepWeek = mutate(pkg)
  pkg.savedAt = now.toISOString()
  saveOfflinePackage(userId, pkg, keepWeek)
}

// ─── Write-through (Spec §3.3, Weg 1) ───────────────────────
// Jeder erfolgreiche Online-Load der betroffenen Screens schreibt seinen Teil
// mit. Das kostet nichts und hält den Snapshot auch zwischen zwei Prefetches
// aktuell — insbesondere hält es ihn nach dem Abhaken korrekt, sonst zeigte die
// Offline-Liste den alten Stand.

export function rememberProjects(userId: string, projects: MonteurProject[], now = new Date()): void {
  updatePackage(userId, now, pkg => { pkg.projects = projects; return undefined })
}

export function rememberProjectTasks(userId: string, projectId: string, tasks: ProjectTask[], now = new Date()): void {
  updatePackage(userId, now, pkg => { pkg.tasksByProject[projectId] = tasks; return undefined })
}

export function rememberProjectComments(userId: string, projectId: string, comments: ProjectComment[], now = new Date()): void {
  updatePackage(userId, now, pkg => { pkg.commentsByProject[projectId] = comments; return undefined })
}

export function rememberScheduleWeek(userId: string, mondayIso: string, week: ScheduleWeek, now = new Date()): void {
  updatePackage(userId, now, pkg => { pkg.scheduleWeeks[mondayIso] = week; return mondayIso })
}

/** Löscht ALLE Lesepakete auf dem Gerät, nicht nur das des abgemeldeten
 *  Nutzers. Gleiche Begründung wie bei `clearApiCache()`: auf einem geteilten
 *  Werkhof-Tablet sollen auch fremde Reste das Gerät verlassen (Spec §3.5). */
export function clearOfflinePackages(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(OFFLINE_PACKAGE_PREFIX)) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
  } catch {
    // Storage nicht verfügbar — Logout darf daran nie hängen bleiben.
  }
}

// ─── Stand-Badge (Spec §3.4) ────────────────────────────────

export interface SnapshotAge {
  /** Fertige Beschriftung, z.B. «Offline — Stand 07:42». */
  label: string
  /** Älter als 24 h: Datum steht dabei, die Anzeige wird zur Warnung. */
  stale: boolean
}

/** Wie alt genau DIESE Daten sind. Der Badge gehört zum Screen-Inhalt, nicht
 *  zum globalen Offline-Banner: das Banner sagt «kein Netz», der Badge sagt,
 *  worauf man gerade schaut. */
export function snapshotAge(savedAt: string, now: Date = new Date()): SnapshotAge {
  const ts = Date.parse(savedAt)
  if (!savedAt || Number.isNaN(ts)) {
    return { label: 'Offline — Stand unbekannt', stale: true }
  }
  const d = new Date(ts)
  const time = d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
  if (now.getTime() - ts >= SNAPSHOT_STALE_MS) {
    const date = d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
    return { label: `Offline — Stand ${date}, ${time}`, stale: true }
  }
  return { label: `Offline — Stand ${time}`, stale: false }
}

// ─── Prefetch im Netz-Moment (Spec §3.3, Weg 2) ─────────────

// Re-Entrancy-Schutz: App-Start und Einstempeln können kurz hintereinander
// auslösen (morgens im Werkhof der Normalfall). Zwei parallele Läufe würden
// dieselben GETs doppelt fahren und sich beim Schreiben überholen.
let prefetching = false

/** Nur für Tests: der Guard lebt im Modul, ein abgebrochener Lauf soll den
 *  nächsten Testfall nicht blockieren. */
export function resetPrefetchGuard(): void {
  prefetching = false
}

export interface PrefetchOptions {
  /** Ohne Modul `scheduling` gibt es keinen Wochenplan — die Route ist ebenso
   *  gated, ein Request wäre ein erwarteter 403 im Netzwerk-Log. */
  scheduling: boolean
  /** Drosselung übergehen (z.B. direkt nach dem Einstempeln). */
  force?: boolean
  now?: Date
}

/**
 * Lädt das Lesepaket aktiv, solange Netz da ist: nach App-Start (sobald
 * `/pwa/me` durch ist) und nach erfolgreichem Einstempeln — morgens, meist noch
 * im WLAN des Werkhofs.
 *
 * Bewusst kein Sammel-Endpoint: bei einstelliger Projektzahl sind das ~5–25
 * kleine GETs gegen bestehende Routen, also kein Backend-Change. Ein
 * `/pwa/offline-package` kommt erst, falls das messbar stört (Spec §6).
 *
 * Wirft nie. Ein misslungener Prefetch ist ein Nicht-Ereignis — der alte
 * Snapshot bleibt stehen, der Write-through füllt weiter nach.
 */
export async function prefetchOfflinePackage(userId: string, opts: PrefetchOptions): Promise<void> {
  const now = opts.now ?? new Date()
  if (!userId) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  if (prefetching) return

  const existing = loadOfflinePackage(userId)
  if (!opts.force && existing?.savedAt) {
    const age = now.getTime() - Date.parse(existing.savedAt)
    if (Number.isFinite(age) && age >= 0 && age < PREFETCH_MIN_INTERVAL_MS) return
  }

  prefetching = true
  try {
    const projects = await apiFetch<MonteurProject[]>('/pwa/projects')
    if (!Array.isArray(projects)) return

    const wanted = projects.slice(0, MAX_PROJECTS)
    // Der bestehende Stand ist der Ausgangspunkt: fällt ein einzelner Teil-Load
    // aus, bleibt der alte Eintrag stehen statt zu verschwinden.
    const next: OfflinePackage = {
      savedAt: now.toISOString(),
      projects,
      tasksByProject: { ...(existing?.tasksByProject ?? {}) },
      commentsByProject: { ...(existing?.commentsByProject ?? {}) },
      scheduleWeeks: { ...(existing?.scheduleWeeks ?? {}) },
    }

    await Promise.all(wanted.map(async p => {
      const [tasks, comments] = await Promise.all([
        apiFetch<ProjectTask[]>(`/pwa/projects/${p.id}/tasks`).catch(() => null),
        apiFetch<ProjectComment[]>(`/pwa/projects/${p.id}/comments`).catch(() => null),
      ])
      if (Array.isArray(tasks)) next.tasksByProject[p.id] = tasks
      if (Array.isArray(comments)) next.commentsByProject[p.id] = comments
    }))

    if (opts.scheduling) {
      const thisMonday = mondayOfISO(todayISO())
      const nextMonday = shiftDayISO(thisMonday, 7)
      await Promise.all([thisMonday, nextMonday].map(async monday => {
        const week = await apiFetch<ScheduleWeek>(
          `/pwa/schedule/week?week_start=${encodeURIComponent(monday)}`,
        ).catch(() => null)
        if (week && Array.isArray(week.days)) next.scheduleWeeks[monday] = week
      }))
    }

    // Ein einziger Schreibvorgang am Ende statt einer pro Teil-Antwort: das ist
    // der teure Teil (JSON.stringify über das ganze Paket).
    saveOfflinePackage(userId, next, mondayOfISO(todayISO()))
  } catch {
    // Netz weg, Session abgelaufen, Storage voll — der Prefetch ist Kür.
  } finally {
    prefetching = false
  }
}

/**
 * Zwischenstand des Offline-Rapport-Formulars —
 * [docs/specs/offline-modus.md](../../../../docs/specs/offline-modus.md) §4.5.3.
 *
 * Getrennt vom Chat-Entwurf ([chat/rapportDraft.ts](../../chat/rapportDraft.ts)),
 * und zwar bewusst: ein angefangener Chat-Rapport darf durch das Formular weder
 * überschrieben noch fortgesetzt werden. Das Formular kennt den Gesprächskontext
 * nicht und darf nicht so tun, als kennte es ihn.
 *
 * localStorage statt IndexedDB, anders als bei der Queue nebenan: der Entwurf ist
 * ein paar Kilobyte Text und trägt nie eine Unterschrift — die entsteht erst auf
 * der Kundenansicht, und ab da liegt der Rapport in der Queue. Schreiben ist
 * best-effort wie überall im Offline-Bestand: ein voller Storage darf das
 * Formular nie sprengen.
 *
 * Pro Mitarbeiter UND Projekt genau ein Entwurf. Wer auf zwei Baustellen war,
 * hat zwei — der zweite Rapport ist nicht die Fortsetzung des ersten.
 */
import type {
  RapportKleinmaterial,
  RapportMaterialLine,
  RapportStaffLine,
} from '../../api/rapportQueue'

/** Muss mit der `isKnownKey`-Whitelist in
 *  [storageMigrations.ts](../../api/storageMigrations.ts) übereinstimmen — sonst
 *  räumt der nächste Schema-Wechsel die Entwürfe weg. Wie `rapport-draft:` ohne
 *  Env-Suffix: der Key trägt die User-id, und Prod/Staging teilen sich keinen
 *  eingeloggten Nutzer. */
export const OFFLINE_DRAFT_PREFIX = 'offline-rapport-entwurf:'

export function offlineDraftKey(userId: string, projectId: string): string {
  return `${OFFLINE_DRAFT_PREFIX}${userId}:${projectId}`
}

/** Gleiche Frist wie beim Chat-Entwurf: ein tagealter Zwischenstand soll nicht
 *  wieder auftauchen, ein heute begonnener nicht verschwinden. Sie läuft ab der
 *  letzten Änderung, nicht ab dem Beginn — wer am Rapport arbeitet, verliert ihn
 *  nicht. */
export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000

export interface OfflineRapportDraft {
  date: string
  staff: RapportStaffLine[]
  description: string
  workTypes: string[]
  einbauort: string
  materials: RapportMaterialLine[]
  kleinmaterial: RapportKleinmaterial | null
  isPartial: boolean
}

interface StoredDraft extends OfflineRapportDraft {
  savedAt: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Liest den Entwurf. `null`, wenn keiner da, er abgelaufen oder unbrauchbar ist
 * — der Aufrufer behandelt alle drei gleich und beginnt mit einem leeren
 * Formular.
 */
export function loadOfflineDraft(
  userId: string,
  projectId: string,
  now: number = Date.now(),
): OfflineRapportDraft | null {
  if (!userId || !projectId) return null
  try {
    const raw = localStorage.getItem(offlineDraftKey(userId, projectId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
    if (!savedAt || now - savedAt > DRAFT_MAX_AGE_MS) {
      clearOfflineDraft(userId, projectId)
      return null
    }
    if (!Array.isArray(parsed.staff)) return null
    return {
      date: typeof parsed.date === 'string' ? parsed.date : '',
      staff: parsed.staff as RapportStaffLine[],
      description: typeof parsed.description === 'string' ? parsed.description : '',
      workTypes: Array.isArray(parsed.workTypes) ? (parsed.workTypes as string[]) : [],
      einbauort: typeof parsed.einbauort === 'string' ? parsed.einbauort : '',
      materials: Array.isArray(parsed.materials) ? (parsed.materials as RapportMaterialLine[]) : [],
      kleinmaterial: isRecord(parsed.kleinmaterial)
        ? (parsed.kleinmaterial as unknown as RapportKleinmaterial)
        : null,
      isPartial: parsed.isPartial === true,
    }
  } catch {
    return null
  }
}

export function saveOfflineDraft(
  userId: string,
  projectId: string,
  draft: OfflineRapportDraft,
  now: number = Date.now(),
): void {
  if (!userId || !projectId) return
  try {
    const stored: StoredDraft = { ...draft, savedAt: now }
    localStorage.setItem(offlineDraftKey(userId, projectId), JSON.stringify(stored))
  } catch {
    // Voller/gesperrter Storage: der Monteur tippt weiter, der Zwischenstand
    // überlebt dann nur keinen Navigationswechsel. Ihn deswegen am Weitertippen
    // zu hindern wäre die teurere Reaktion.
  }
}

export function clearOfflineDraft(userId: string, projectId: string): void {
  try {
    localStorage.removeItem(offlineDraftKey(userId, projectId))
  } catch { /* Storage weg — nichts zu räumen */ }
}

/** Heute als DD.MM.YYYY — das Format, in dem der Chat-Pfad das Rapport-Datum
 *  führt und das der Server erwartet. */
export function todayDDMMYYYY(now: Date = new Date()): string {
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${now.getFullYear()}`
}

/** DD.MM.YYYY ⇄ YYYY-MM-DD, für `<input type="date">`. */
export function toDateInput(ddmmyyyy: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ddmmyyyy)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

export function fromDateInput(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

/** Obergrenze der Stunden je Person und Rapport.
 *
 *  Spiegel von `MAX_REPORT_HOURS_PER_STAFF` in `services/report_policy.py`. Der
 *  Server bleibt massgeblich — aber er antwortet erst beim Upload, und bis dahin
 *  hat der Kunde längst unterschrieben. Ein Zahlendreher muss hier auffallen,
 *  nicht Stunden später in der Queue. */
export const MAX_HOURS_PER_STAFF = 12

/**
 * Ist das Formular abschickbar? Reine Funktion — die Regel entscheidet, ob der
 * Monteur weiterkommt, und gehört einzeln geprüft.
 *
 * Drei Bedingungen:
 *   * mindestens eine Stundenzeile mit Name und Stunden > 0 (ein Rapport ohne
 *     Stunden hätte nichts zu verrechnen und wäre beim Kunden eine leere Seite),
 *   * jede gefüllte Zeile innerhalb der Grenze, die auch der Server zieht,
 *   * eine Beschreibung (die WS-3-Meldung: «Nur die Stunden, aber nicht was ich
 *     gemacht habe» — im Chat fragt das LLM nach, hier muss es das Formular tun).
 */
export function draftBlockReason(draft: OfflineRapportDraft): string | null {
  const gefuellt = draft.staff.filter(s => s.name.trim() && (s.hours ?? 0) > 0)
  if (!gefuellt.length) return 'Trag mindestens eine Person mit ihren Stunden ein.'
  const zuViel = gefuellt.find(s => (s.hours ?? 0) > MAX_HOURS_PER_STAFF)
  if (zuViel) {
    return `${zuViel.name}: ${zuViel.hours} Stunden sind zu viel für einen Tag `
      + `(höchstens ${MAX_HOURS_PER_STAFF}).`
  }
  if (!draft.description.trim()) return 'Beschreib kurz, was ihr gemacht habt.'
  return null
}

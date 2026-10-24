import type { AutosaveField } from './projectForm'

// Rückfrage «Projektleiter übernehmen?» (docs/specs/projektleiter-uebernahme.md).
//
// Ändert ein Projektleiter ein Projekt, das er nicht leitet, fragt die Maske
// einmal nach — NACH dem Speichern, damit nichts aufgehalten wird. Die Regel
// steht hier als reine Funktion; der Hook ruft sie nach jedem gelungenen
// Speichern auf, der Screen zeigt den Dialog.

/**
 * Felder, deren Änderung NICHT als inhaltliche Änderung zählt (§3.1 Pkt. 3).
 * Die Bemerkung ist die Notiz der Maske; wer den Projektleiter selbst ändert,
 * kümmert sich bereits darum. Dateien, Kommentare und Termine sind keine
 * Autosave-Felder und kommen hier gar nicht erst an.
 */
export const PL_FRAGE_OHNE: readonly AutosaveField[] = ['bemerkung', 'projektleiterId']

/** Eine Änderung, nach der gefragt werden darf? */
export function isInhaltlicheAenderung(fields: readonly AutosaveField[]): boolean {
  // Ändert dieselbe Speicherung den Projektleiter mit, ist die Frage überholt.
  if (fields.includes('projektleiterId')) return false
  return fields.some(f => !PL_FRAGE_OHNE.includes(f))
}

export interface TakeoverContext {
  /** Feature `projektleiter_rueckfrage` für dieses Konto an (Beta, /pwa/me). */
  enabled: boolean
  /** Eigene staff_id — ohne sie gibt es nichts zu übernehmen. */
  myStaffId: string | null
  /** Ist der eigene Mitarbeiter als Projektleiter markiert (`staff.projektleiter`)? */
  iAmProjektleiter: boolean
}

/** Alle vier Bedingungen aus §3.1. */
export function shouldAskTakeover(args: {
  ctx: TakeoverContext
  projectId: string
  /** Projektleiter des Projekts, wie er nach dem Speichern dasteht. */
  projektleiterId: string
  fields: readonly AutosaveField[]
  askedThisSession: ReadonlySet<string>
  suppressed: ReadonlySet<string>
}): boolean {
  const { ctx, projectId, projektleiterId, fields, askedThisSession, suppressed } = args
  if (!ctx.enabled || !ctx.myStaffId || !ctx.iAmProjektleiter) return false
  if (projektleiterId === ctx.myStaffId) return false
  if (!isInhaltlicheAenderung(fields)) return false
  if (askedThisSession.has(projectId) || suppressed.has(projectId)) return false
  return true
}

// ── «Für dieses Projekt nicht mehr fragen» (§3.2) ─────────────────────────

const KEY_PREFIX = 'pl-frage-aus:'
/** Höchstens so viele Projekte merken — die ältesten fallen heraus. */
export const PL_FRAGE_MAX = 200

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

/** Projekte, für die dieses Konto nicht mehr gefragt werden will. */
export function loadSuppressed(userId: string | null): Set<string> {
  if (!userId) return new Set()
  try {
    const raw = localStorage.getItem(storageKey(userId))
    const list = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Projekt merken; ein schon gemerktes rückt ans Ende (zuletzt benutzt). */
export function suppressProject(userId: string | null, projectId: string): void {
  if (!userId) return
  const list = [...loadSuppressed(userId)].filter(id => id !== projectId)
  list.push(projectId)
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(list.slice(-PL_FRAGE_MAX)))
  } catch {
    // Voller oder gesperrter Speicher: dann fragt die Maske eben wieder —
    // höchstens einmal pro Sitzung.
  }
}

// «In dieser Sitzung schon gefragt»: lebt so lange wie der Tab. Ein Remount
// der Maske (anderer Reiter, Projekt erneut geöffnet) fragt nicht noch einmal.
const askedThisSession = new Set<string>()

export function sessionAsked(): ReadonlySet<string> {
  return askedThisSession
}

export function markAsked(projectId: string): void {
  askedThisSession.add(projectId)
}

/** Nur für Tests. */
export function resetSessionAsked(): void {
  askedThisSession.clear()
}

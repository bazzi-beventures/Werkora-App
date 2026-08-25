/**
 * Diagnose-Breadcrumbs — Spec docs/specs/support-ticket.md §5.3.
 *
 * Eine Spur der letzten Ereignisse im Client, die mit einer Support-Meldung
 * mitgeschickt wird. Nicht zu verwechseln mit einer Navigations-Pfadleiste im
 * UI: das hier ist unsichtbar und existiert nur für den Fehlerfall.
 *
 * Warum es das braucht: `audit_log` protokolliert serverseitig **nur
 * Schreibaktionen**. Der häufigste Supportfall in einer Baustellen-App ist
 * aber «der Knopf tut nichts» oder «ich finde X nicht» — da wurde nichts
 * geschrieben, der Vorfall existiert serverseitig überhaupt nicht. Diese Spur
 * hält fest, was der Nutzer GETAN hat, nicht nur, was das System geändert hat.
 *
 * Bewusst NUR im Arbeitsspeicher (kein localStorage):
 *  - es entstehen keine gespeicherten Daten auf dem Gerät,
 *  - es braucht keine APP_DATA_VERSION-Migration (CLAUDE.md-Regel),
 *  - beim nächsten Laden ist der Puffer automatisch leer.
 * Der Preis: ein Neuladen löscht die Spur. Bewusst akzeptiert — Persistenz
 * wäre gespeicherte Datenhaltung mit allem, was daran hängt.
 *
 * Und bewusst OHNE Inhalte: bei `api_error` stehen nur Pfad und Statuscode,
 * kein Request-Body, keine Feldwerte, keine Tastatureingaben. Die Spur geht an
 * den Werkora-Support, verlässt also den Mandanten — sie darf niemals Löhne
 * oder Kundendaten transportieren.
 */

export type BreadcrumbKind = 'nav' | 'api_error'

export interface Breadcrumb {
  /** Uhrzeit HH:MM:SS — für den Support reicht die Reihenfolge plus Tageszeit. */
  t: string
  kind: BreadcrumbKind
  detail: string
}

/** Ringpuffer-Grösse. Muss zum Serverdeckel passen (support_service.MAX_BREADCRUMBS). */
export const MAX_BREADCRUMBS = 50

const buffer: Breadcrumb[] = []

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function push(kind: BreadcrumbKind, detail: string): void {
  buffer.push({ t: stamp(), kind, detail: detail.slice(0, 200) })
  // Ringpuffer: kommt ein Eintrag über die Grenze, fällt der älteste raus.
  // Relevant sind die letzten Minuten vor dem Problem, nicht die erste Stunde.
  if (buffer.length > MAX_BREADCRUMBS) buffer.splice(0, buffer.length - MAX_BREADCRUMBS)
}

/** Bildschirm-/Routenwechsel festhalten. */
export function trackNav(screen: string): void {
  if (!screen) return
  // Doppelte Einträge desselben Screens sind Rauschen (Re-Render, gleicher Screen).
  const last = buffer[buffer.length - 1]
  if (last && last.kind === 'nav' && last.detail === screen) return
  push('nav', screen)
}

/** Fehlgeschlagenen API-Aufruf festhalten — nur Pfad und Statuscode. */
export function trackApiError(path: string, status: number): void {
  push('api_error', `${path} → ${status}`)
}

/** Kopie der Spur, älteste zuerst. Kopie, damit niemand den Puffer von aussen ändert. */
export function getBreadcrumbs(): Breadcrumb[] {
  return buffer.slice()
}

/** Nur für Tests. */
export function clearBreadcrumbs(): void {
  buffer.length = 0
}

/**
 * Reine Regeln des Support-Posteingangs (Spec docs/specs/support-uebersicht.md).
 *
 * Alles hier ist ohne DOM testbar: welche Meldungen ein Reiter zeigt, in welcher
 * Reihenfolge, wie alt eine Meldung «aussieht» und wie eine `route` heisst.
 */
import type { SupportStatus, SupportTicket } from '../../api/support'
import { SCREEN_TITLES } from '../../admin/screenTitles'

export type InboxTab = 'todo' | 'erledigt' | 'alle'

export const TAB_LABEL: Record<InboxTab, string> = {
  todo: 'Zu erledigen',
  erledigt: 'Erledigt',
  alle: 'Alle',
}

const OPEN: SupportStatus[] = ['offen', 'in_arbeit']

export function isOpen(status: SupportStatus): boolean {
  return OPEN.includes(status)
}

/** Ab wann eine offene Meldung als spät (Warnfarbe) bzw. überfällig (Fehlerfarbe)
 *  gilt — Spec O1. Konstanten, keine Einstellung. */
export const AGE_WARN_HOURS = 24
export const AGE_LATE_HOURS = 72

const HOUR_MS = 3_600_000

export function ageHours(iso: string, now: number): number {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : Math.max(0, (now - t) / HOUR_MS)
}

/** «jetzt», «40 min», «5 h», «3 T» — kurz genug für eine Listenzeile. */
export function ageLabel(iso: string | null | undefined, now: number): string {
  if (!iso) return '—'
  const h = ageHours(iso, now)
  if (h < 1 / 60) return 'jetzt'
  if (h < 1) return `${Math.floor(h * 60)} min`
  if (h < 48) return `${Math.floor(h)} h`
  return `${Math.floor(h / 24)} T`
}

/** Farbstufe des Alters. Erledigte Meldungen sind nie «spät». */
export function ageTone(ticket: Pick<SupportTicket, 'status' | 'created_at'>, now: number):
  'ok' | 'warn' | 'late' {
  if (!isOpen(ticket.status)) return 'ok'
  const h = ageHours(ticket.created_at, now)
  if (h >= AGE_LATE_HOURS) return 'late'
  if (h >= AGE_WARN_HOURS) return 'warn'
  return 'ok'
}

/** Noch nie im Detail geöffnet. Ohne `seen_at`-Spalte (Server älter als die
 *  Migration) ist nichts ungelesen — lieber kein Punkt als überall einer. */
export function isUnread(ticket: Pick<SupportTicket, 'seen_at'>): boolean {
  return ticket.seen_at === null
}

export interface InboxFilter {
  tab: InboxTab
  tenantId: string
  query: string
  /** Häufungs-Filter aus dem Banner: nur Meldungen dieses Screens bzw. dieser
   *  Backend-Stelle. */
  cluster?: { kind: 'route' | 'source'; key: string } | null
}

/**
 * Filtern und sortieren. «Zu erledigen» zeigt die ÄLTESTE zuerst — die, die am
 * längsten wartet, ist die dringendste. «Erledigt» und «Alle» zeigen die
 * neueste zuerst: dort sucht man etwas, man arbeitet nichts ab.
 */
export function inboxView(tickets: SupportTicket[], f: InboxFilter): SupportTicket[] {
  const q = f.query.trim().toLowerCase()
  const rows = tickets.filter(t => {
    if (f.tab === 'todo' && !isOpen(t.status)) return false
    if (f.tab === 'erledigt' && t.status !== 'erledigt') return false
    if (f.tenantId && t.tenant_id !== f.tenantId) return false
    if (f.cluster) {
      const value = f.cluster.kind === 'route' ? t.route : t.snapshot_top_source
      if ((value ?? '') !== f.cluster.key) return false
    }
    if (q) {
      const hay = [t.reference, t.message, t.created_by_name, t.tenant_name]
        .filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const asc = f.tab === 'todo'
  return rows.sort((a, b) => {
    const d = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return asc ? d : -d
  })
}

export function tabCounts(tickets: SupportTicket[], tenantId: string): Record<InboxTab, number> {
  const scoped = tenantId ? tickets.filter(t => t.tenant_id === tenantId) : tickets
  return {
    todo: scoped.filter(t => isOpen(t.status)).length,
    erledigt: scoped.filter(t => t.status === 'erledigt').length,
    alle: scoped.length,
  }
}

// ── Lesbare Screen-Namen ────────────────────────────────────────────────────

/** Screens der Mitarbeiter-App (`Screen` in App.tsx). Nur die, auf denen die
 *  Hilfe-Blase sitzt — Login, PIN und Consent haben keine. */
const PWA_TITLES: Record<string, string> = {
  home: 'Startseite',
  rapport: 'Rapport erfassen',
  rapportOffline: 'Rapport (offline)',
  arbeitszeit: 'Arbeitszeit',
  profile: 'Profil',
  bericht: 'Bericht',
  projekte: 'Projekte',
  offerten: 'Offerten',
  projektEntwurf: 'Projektentwurf',
  absenzen: 'Absenzen',
  inventur: 'Inventur',
}

const ADMIN_TITLES: Record<string, string> = SCREEN_TITLES

/** `route` + Bereich → Anzeigename. Unbekanntes bleibt roh, statt zu raten. */
export function routeLabel(route: string | null | undefined, appContext?: string | null): string {
  if (!route) return '—'
  if (!appContext) return routeLabelAny(route)
  const titles = appContext === 'admin' ? ADMIN_TITLES : PWA_TITLES
  return titles[route.replace(/^\//, '')] ?? route
}

/** Screen-Name ohne Bereich (Dashboard-Serien tragen nur die `route`). */
export function routeLabelAny(route: string): string {
  const key = route.replace(/^\//, '')
  return ADMIN_TITLES[key] ?? PWA_TITLES[key] ?? route
}

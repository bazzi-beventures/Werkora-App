/**
 * Masken, auf die der Hilfe-Bot verlinken darf — Client-Seite.
 *
 * Spec docs/specs/hilfe-bot-masken-und-ablaeufe.md (D1–D3). Der Server gibt dem
 * Modell die erlaubten Masken als Liste (services/help_targets.py); das Modell
 * setzt Links `#/admin/<screen>` bzw. `#/app/<screen>`. Hier fällt das letzte
 * Wort: ein Link wird nur zum Knopf, wenn Ziel, App, Modul und Rolle passen.
 * Alles andere bleibt Text — ein falscher Link richtet so keinen Schaden an.
 *
 * Die Liste MUSS zu services/help_targets.py passen; tests/unit/test_help_targets.py
 * hält beide gleich. Die Gates spiegeln die Seitenleiste (admin/AdminSidebar.tsx)
 * bzw. die Screen-Gates der Monteur-App (App.tsx).
 */
import type { UserInfo } from '../api/auth'
import { hasModule, type ModuleName } from '../api/modules'

export type HelpApp = 'admin' | 'pwa'

export interface HelpTarget {
  app: HelpApp
  screen: string
  module?: ModuleName
  managementOnly?: boolean
  /** Für Rolle user_light gesperrt (Monteur-App). */
  noLight?: boolean
}

// Format je Zeile bewusst gleich (der Python-Ratchet liest sie per Regex):
// { app: '<app>', screen: '<screen>' … }
export const HELP_TARGETS: readonly HelpTarget[] = [
  { app: 'admin', screen: 'dashboard' },
  { app: 'admin', screen: 'tasks', module: 'task_board' },
  { app: 'admin', screen: 'my-time', module: 'timekeeping' },
  { app: 'admin', screen: 'staff' },
  { app: 'admin', screen: 'bulk-clockin', module: 'timekeeping', managementOnly: true },
  { app: 'admin', screen: 'absences', module: 'hr' },
  { app: 'admin', screen: 'corrections', module: 'timekeeping' },
  { app: 'admin', screen: 'hr-reports', module: 'hr' },
  { app: 'admin', screen: 'vacation', module: 'hr' },
  { app: 'admin', screen: 'settings', managementOnly: true },
  { app: 'admin', screen: 'projects' },
  { app: 'admin', screen: 'project-drafts' },
  { app: 'admin', screen: 'project-schedule', module: 'scheduling' },
  { app: 'admin', screen: 'customers' },
  { app: 'admin', screen: 'quotes', module: 'quotes' },
  { app: 'admin', screen: 'invoices', module: 'invoicing' },
  { app: 'admin', screen: 'payment-reconciliation', module: 'payment_matching' },
  { app: 'admin', screen: 'aftersales', module: 'aftersales' },
  { app: 'admin', screen: 'suppliers' },
  { app: 'admin', screen: 'supplier-wiki', module: 'supplier_wiki' },
  { app: 'admin', screen: 'materials' },
  { app: 'admin', screen: 'staff-roles', managementOnly: true },
  { app: 'admin', screen: 'pricing-rules', managementOnly: true },
  { app: 'admin', screen: 'quote-templates', module: 'quotes', managementOnly: true },
  { app: 'admin', screen: 'kpis', module: 'kpis', managementOnly: true },
  { app: 'admin', screen: 'users' },
  { app: 'admin', screen: 'roadmap', module: 'feature_requests' },
  { app: 'admin', screen: 'document-backup', module: 'document_backup', managementOnly: true },
  { app: 'admin', screen: 'profile' },
  { app: 'pwa', screen: 'home' },
  { app: 'pwa', screen: 'arbeitszeit', module: 'timekeeping' },
  { app: 'pwa', screen: 'absenzen', module: 'hr' },
  { app: 'pwa', screen: 'projekte', noLight: true },
  { app: 'pwa', screen: 'offerten', module: 'quotes', noLight: true },
  { app: 'pwa', screen: 'projektEntwurf', noLight: true },
  { app: 'pwa', screen: 'profile' },
  { app: 'pwa', screen: 'roadmap', module: 'feature_requests', noLight: true },
]

// #/admin/<screen> bzw. #/app/<screen> — nichts dahinter (keine Unter-Reiter, D4).
const LINK_PATTERN = /^#\/(admin|app)\/([A-Za-z-]+)\/?$/

/** Darf dieser Nutzer die Maske öffnen? Dieselben Regeln wie die Navigation. */
export function targetAllowed(t: HelpTarget, user: UserInfo | null): boolean {
  if (!user) return false
  const role = (user.role || '').toLowerCase()
  if (t.module && !hasModule(user, t.module)) return false
  if (t.managementOnly && role !== 'management' && role !== 'superadmin') return false
  if (t.noLight && role === 'user_light') return false
  return true
}

/**
 * Ein Link aus der Bot-Antwort → Maske, oder null (dann bleibt es Text).
 *
 * null bei: unbekanntem Format, unbekannter Maske, Maske der anderen App,
 * fehlendem Modul, fehlender Rolle.
 */
export function resolveHelpLink(
  href: string | undefined, user: UserInfo | null, app: HelpApp,
): HelpTarget | null {
  const m = LINK_PATTERN.exec((href ?? '').trim())
  if (!m) return null
  const linkApp: HelpApp = m[1] === 'admin' ? 'admin' : 'pwa'
  if (linkApp !== app) return null
  const target = HELP_TARGETS.find(t => t.app === linkApp && t.screen === m[2])
  if (!target || !targetAllowed(target, user)) return null
  return target
}

/** Externe Adresse (http/https/mailto/tel)? Die öffnet ein neuer Tab — die
 *  PWA wird nie im selben Tab verlassen. */
export function isExternalLink(href: string | undefined): boolean {
  return /^(https?:|mailto:|tel:)/i.test((href ?? '').trim())
}

import { UserInfo } from './auth'

export type ModuleName =
  | 'timekeeping'
  | 'scheduling'
  | 'quotes'
  | 'invoicing'
  | 'payment_matching'
  | 'inventory'
  | 'inventory_alerts'
  | 'hr'
  | 'arg_compliance'
  | 'violation_emails'
  | 'kpis'
  | 'kpi_assistent'
  | 'ai'
  | 'help_bot'
  | 'clock_in_reminder'
  | 'admin_clock_in_push'
  | 'correction_request_push'
  | 'aftersales'
  | 'document_backup'
  | 'task_board'
  | 'support'
  | 'newsletter'
  | 'supplier_wiki'
  | 'feature_requests'
  | 'warranty'
  | 'reminders'
  | 'hagelschaden'
  | 'lieferschein_erfassung'
  | 'mail_eingang'
  | 'termin_bestaetigung'
  | 'bexio'
  | 'kreditoren'
  | 'service_begleitung'

export function hasModule(user: UserInfo | null, name: ModuleName): boolean {
  if (!user) return false
  return user.enabled_modules?.includes(name) ?? false
}

// ─── Feature-Flags (konfigurierbare Workflow-Bausteine) ─────────────

export interface KleinmaterialPromptConfig {
  enabled: boolean
  presets_chf: number[]
  scope: 'per_auftrag' | 'per_position'
}

export function getFeature<T = Record<string, unknown>>(
  user: UserInfo | null,
  key: string,
): T | null {
  const cfg = user?.feature_flags?.[key]
  return cfg ? (cfg as T) : null
}

export function isFeatureEnabled(user: UserInfo | null, key: string): boolean {
  return !!getFeature(user, key)?.enabled
}

/**
 * Not-Aus des Rapport-Chats (Feature `rapport_bot`, docs/specs/rapport-bot-guardrails.md
 * §4.7). Anders als `isFeatureEnabled` gilt ein FEHLENDER Eintrag als «an»: der
 * Schalter ist standardmässig an, und ein älterer Server oder ein zwischengespeichertes
 * `/pwa/me` ohne den Schlüssel darf den Chat nicht abschalten. Aus ist er nur, wenn
 * der Betreiber ihn ausdrücklich ausgeschaltet hat.
 */
export function rapportBotAn(user: UserInfo | null): boolean {
  return getFeature(user, 'rapport_bot')?.enabled !== false
}

/**
 * Darf dieses Konto den Rapport im Formular erfassen? Mit Feature
 * `rapport_offline_formular` — oder wenn der Rapport-Bot ausgeschaltet ist: dann ist
 * das Formular der einzige Weg zum Rapport, auch für Konten ohne das Beta-Häkchen
 * (rapport-bot-guardrails §4.7). Das Backend entscheidet dieselbe Frage in
 * `agents/routers/rapport_offline.py::_formular_offen`.
 */
export function rapportFormularOffen(user: UserInfo | null): boolean {
  return isFeatureEnabled(user, 'rapport_offline_formular') || !rapportBotAn(user)
}

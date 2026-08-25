import { UserInfo } from './auth'

export type ModuleName =
  | 'timekeeping'
  | 'scheduling'
  | 'quotes'
  | 'invoicing'
  | 'payment_matching'
  | 'inventory'
  | 'hr'
  | 'arg_compliance'
  | 'violation_emails'
  | 'kpis'
  | 'kpis_email'
  | 'ai'
  | 'help_bot'
  | 'clock_in_reminder'
  | 'hr_weekly_report'
  | 'admin_clock_in_push'
  | 'aftersales'
  | 'document_backup'
  | 'task_board'
  | 'support'

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

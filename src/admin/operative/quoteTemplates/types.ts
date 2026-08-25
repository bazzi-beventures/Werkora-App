// Formular-Zustand der Vorlagen-Maske. Die API-Typen (InstallationTpl,
// SpecialTpl, QuoteAttachmentTpl, SpecialMode) stehen seit Charge H1 bei ihren
// Funktionen in api/admin/quoteTemplates.ts.

import type { SpecialMode } from '../../../api/admin/quoteTemplates'

// Dateigrösse menschenlesbar — die API liefert Bytes.
export function fmtBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export type Kind = 'installation' | 'special'

export interface EditState {
  kind: Kind
  // 'new' = anlegen, sonst die zu bearbeitende ID
  id: string | 'new'
}

export interface FormState {
  label: string
  default_fee: string
  pricing_mode: SpecialMode
  default_hours: string
  notes: string
}

export const EMPTY_FORM: FormState = {
  label: '', default_fee: '', pricing_mode: 'pauschal', default_hours: '', notes: '',
}

// «Allg. Abzüge» im Rechnung-Erstellen-Dialog (Feature allgemeine_abzuege):
// reine Logik, getrennt von der UI (GeneralDeductionFields) — Geld-nahe Regeln
// gehören unit-getestet (generalDeduction.test.ts), nicht in JSX.
// Spec: docs/specs/allgemeine-abzuege.md

import type { GeneralDeductionSection } from '../../api/admin/invoices'

export const GENERAL_DEDUCTION_SECTIONS: { key: GeneralDeductionSection; label: string }[] = [
  { key: 'labor', label: 'Arbeitszeit' },
  { key: 'material', label: 'Material (inkl. weitere Produkte)' },
  { key: 'travel', label: 'Fahrtkosten' },
]

/** Mandanten-Konfiguration aus /pwa/me (feature_registry.allgemeine_abzuege). */
export interface GeneralDeductionConfig {
  enabled?: boolean
  bezeichnung?: string
  prozent?: number
  basis?: string[]
}

/** Zustand der Felder im Dialog. `pct` als String — so wie das Eingabefeld ihn hält. */
export interface GeneralDeductionState {
  enabled: boolean
  pct: string
  sections: GeneralDeductionSection[]
}

const KNOWN = new Set<string>(GENERAL_DEDUCTION_SECTIONS.map(s => s.key))

/**
 * Startzustand beim Öffnen des Dialogs. Das Häkchen startet IMMER aus — die
 * Konfiguration belegt nur Prozentsatz und Basis vor (wie beim Skonto).
 */
export function initialGeneralDeduction(cfg: GeneralDeductionConfig | null): GeneralDeductionState {
  const pct = cfg?.prozent && cfg.prozent > 0 ? String(cfg.prozent) : ''
  const fromCfg = (cfg?.basis ?? []).filter(k => KNOWN.has(k)) as GeneralDeductionSection[]
  return {
    enabled: false,
    pct,
    sections: fromCfg.length > 0 ? fromCfg : GENERAL_DEDUCTION_SECTIONS.map(s => s.key),
  }
}

/** Prozentsatz aus dem Feld — Komma wie Punkt; `null` wenn ungültig (nicht in (0, 100)). */
export function parseDeductionPct(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'))
  if (!raw.trim() || !Number.isFinite(n) || n <= 0 || n >= 100) return null
  return n
}

/** Fehlertext für den Dialog, oder `null` wenn alles passt bzw. das Häkchen aus ist. */
export function generalDeductionError(state: GeneralDeductionState): string | null {
  if (!state.enabled) return null
  if (parseDeductionPct(state.pct) === null) return 'Prozentsatz zwischen 0 und 100 eingeben.'
  if (state.sections.length === 0) return 'Mindestens eine Basis wählen.'
  return null
}

/**
 * Was geht an den Generate-Request? Leeres Objekt, solange das Häkchen aus oder
 * die Eingabe ungültig ist — dann entsteht die Rechnung wie bisher ohne Abzug.
 * Die Sektionen in fester Reihenfolge (wie das Backend sie speichert).
 */
export interface GeneralDeductionPayload {
  general_deduction_pct?: number
  general_deduction_sections?: GeneralDeductionSection[]
}

export function generalDeductionPayload(state: GeneralDeductionState): GeneralDeductionPayload {
  if (generalDeductionError(state) !== null || !state.enabled) return {}
  const chosen = new Set(state.sections)
  return {
    general_deduction_pct: parseDeductionPct(state.pct) as number,
    general_deduction_sections: GENERAL_DEDUCTION_SECTIONS.map(s => s.key).filter(k => chosen.has(k)),
  }
}

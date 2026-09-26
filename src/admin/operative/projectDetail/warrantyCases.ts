// Beschriftungen und reine Helfer rund um den Garantiefall
// (docs/specs/garantiefall.md Phase 2). Eigene Datei, damit die Logik ohne
// React testbar ist — der Reiter selbst steht in WarrantyTab.tsx.

import type {
  UpdateWarrantyCaseBody, WarrantyCase, WarrantyCaseStatus, WarrantyCause, WarrantyChannel,
  WarrantyDecision,
} from '../../../api/admin/warranty'
import type { ProjectStatus } from '../../constants/statuses'
import { parseIsoDate, startOfDay } from '../../../shared/warranty'

/**
 * «14.03.2027» aus einem ISO-Datum — über `parseIsoDate`, nicht über
 * `new Date(s)`: das liest UTC-Mitternacht und zeigt westlich von Greenwich den
 * Vortag. Bei einer Frist gegenüber dem Kunden ist ein Tag daneben ein Fehler.
 */
export function fmtTag(value: string | null | undefined): string {
  const d = parseIsoDate(value)
  if (!d) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

export const CASE_STATUS_LABELS: Record<WarrantyCaseStatus, string> = {
  gemeldet: 'Gemeldet',
  in_pruefung: 'In Prüfung',
  entschieden: 'Entschieden',
  in_arbeit: 'In Arbeit',
  behoben: 'Behoben',
  abgeschlossen: 'Abgeschlossen',
}

export const CASE_STATUS_BADGE: Record<WarrantyCaseStatus, string> = {
  gemeldet: 'admin-badge-open',
  in_pruefung: 'admin-badge-pending',
  entschieden: 'admin-badge-sent',
  in_arbeit: 'admin-badge-active',
  behoben: 'admin-badge-paid',
  abgeschlossen: 'admin-badge-closed',
}

export const DECISION_LABELS: Record<WarrantyDecision, string> = {
  anerkannt: 'Anerkannt',
  kulanz: 'Kulanz',
  abgelehnt: 'Abgelehnt',
}

export const CAUSE_LABELS: Record<WarrantyCause, string> = {
  eigener_fehler: 'Eigener Fehler',
  material: 'Material',
  fremdverschulden: 'Fremdverschulden',
  verschleiss: 'Verschleiss',
  unklar: 'Unklar',
}

export const CHANNEL_LABELS: Record<WarrantyChannel, string> = {
  telefon: 'Telefon',
  mail: 'Mail',
  vor_ort: 'Vor Ort',
  brief: 'Brief',
  sonstiges: 'Sonstiges',
}

/**
 * Knopf-Text je Ziel-Status. «entschieden» fehlt mit Absicht: dorthin führt
 * der Entscheid selbst (der Server setzt den Status, wenn ein Entscheid
 * gespeichert wird), ein eigener Knopf dafür hätte nichts zu entscheiden.
 */
export const TRANSITION_LABELS: Partial<Record<WarrantyCaseStatus, string>> = {
  in_pruefung: 'In Prüfung nehmen',
  in_arbeit: 'In Arbeit',
  behoben: 'Behoben',
  abgeschlossen: 'Abschliessen',
}

/** Die Knöpfe, die die Fall-Ansicht zeigt — die Regel selbst kommt vom Server. */
export function transitionButtons(c: Pick<WarrantyCase, 'allowed_transitions'>): WarrantyCaseStatus[] {
  return c.allowed_transitions.filter(s => s in TRANSITION_LABELS)
}

export type FristTon = 'ok' | 'warn' | 'bad' | 'neutral'

/**
 * Frist-Stand zu einem Meldedatum, wie ihn der Meldedialog VOR dem Speichern
 * zeigt (Spec §6.1): der Entscheid soll informiert fallen.
 *
 * Tagesgenau und inklusive des letzten Tags — dieselbe Regel wie
 * `services/warranty.py::within_deadline`.
 */
export function fristHinweis(
  reportedAt: Date | null,
  deadlineAt: string | null | undefined,
  expiryAt: string | null | undefined,
): { text: string; ton: FristTon } {
  const deadline = parseIsoDate(deadlineAt)
  if (!deadline) {
    return { text: 'Frist unbekannt — am Projekt fehlt der Stichtag (Abnahme bzw. Rechnung).', ton: 'neutral' }
  }
  if (!reportedAt) return { text: `Rügefrist bis ${fmtTag(deadlineAt)}.`, ton: 'neutral' }
  const tag = startOfDay(reportedAt).getTime()
  if (tag <= deadline.getTime()) {
    return { text: `Rügefrist bis ${fmtTag(deadlineAt)} — die Meldung liegt innerhalb.`, ton: 'ok' }
  }
  const expiry = parseIsoDate(expiryAt)
  if (expiry && tag <= expiry.getTime()) {
    return {
      text: `Rügefrist am ${fmtTag(deadlineAt)} abgelaufen — nur verdeckte Mängel bis ${fmtTag(expiryAt)}.`,
      ton: 'warn',
    }
  }
  return { text: `Garantie abgelaufen (Rügefrist bis ${fmtTag(deadlineAt)}).`, ton: 'bad' }
}

/** Kurzform für die Fallliste: lag die Meldung in der eingefrorenen Frist? */
export function fristKurz(c: Pick<WarrantyCase, 'within_deadline' | 'deadline_at'>): string {
  if (c.within_deadline === true) return 'in Frist'
  if (c.within_deadline === false) return 'nach Frist'
  return c.deadline_at ? '—' : 'Frist unbekannt'
}

/** Gemeldet wird zu einem abgeschlossenen Auftrag — ein offener ist keine Garantie. */
export function canReportWarranty(status: ProjectStatus): boolean {
  return status === 'abgeschlossen' || status === 'archiviert'
}

/** Formularstand der Fall-Ansicht — leere Strings stehen für «nicht gesetzt». */
export interface CaseForm {
  decision: WarrantyDecision | ''
  decision_note: string
  cause: WarrantyCause | ''
  supplier_id: string
  description: string
}

export function formAus(c: WarrantyCase): CaseForm {
  return {
    decision: c.decision ?? '',
    decision_note: c.decision_note ?? '',
    cause: c.cause ?? '',
    supplier_id: c.supplier_id ?? '',
    description: c.description,
  }
}

/**
 * Nur, was sich gegenüber dem gespeicherten Fall geändert hat. Leere Felder
 * gehen als `null` (leeren); ein Entscheid lässt sich nicht leeren, und ein
 * leerer Beschrieb wird gar nicht erst geschickt.
 */
export function caseChanges(c: WarrantyCase, f: CaseForm): UpdateWarrantyCaseBody {
  const body: UpdateWarrantyCaseBody = {}
  if (f.decision && f.decision !== c.decision) body.decision = f.decision
  if (f.decision_note.trim() !== (c.decision_note ?? '')) body.decision_note = f.decision_note.trim() || null
  if ((f.cause || null) !== c.cause) body.cause = f.cause || null
  if ((f.supplier_id || null) !== c.supplier_id) body.supplier_id = f.supplier_id || null
  if (f.description.trim() && f.description.trim() !== c.description) body.description = f.description.trim()
  return body
}

/**
 * Darf aus diesem Fall jetzt ein Reparatur-Projekt entstehen (Phase 3)?
 * Entschieden, noch keines angelegt, und der Wechsel auf «in Arbeit» ist
 * erlaubt — dieselben Bedingungen, die der Server mit 409 durchsetzt.
 */
export function canCreateRepairProject(
  c: Pick<WarrantyCase, 'decision' | 'repair_project_id' | 'allowed_transitions'>,
): boolean {
  return !!c.decision && !c.repair_project_id && c.allowed_transitions.includes('in_arbeit')
}

/** Was das Reparatur-Projekt bei diesem Entscheid wird (Spec §3.5). */
export function repairProjectHint(decision: WarrantyDecision | null): string {
  return decision === 'abgelehnt'
    ? 'Wird als gewöhnliche, verrechenbare Reparatur angelegt.'
    : 'Wird als Garantiefall angelegt (Häkchen «Garantiefall» gesetzt).'
}

import { BoardColumn, BoardTask, TaskTypeInfo } from '../../api/admin'
import type { AdminScreen } from '../useAdminNav'
import type { ProjectTab } from '../operative/projectDetail/ProjectTabBar'
import { todayISO } from '../utils/format'

export const COLUMN_LABELS: Record<BoardColumn, string> = {
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  wartet: 'Wartet',
  erledigt: 'Erledigt',
}

/** Ansichten des Boards: fachliches Feld (Default), klassisches Status-Kanban,
 *  pro Projektleiter (nur Management). */
export type BoardView = 'field' | 'status' | 'assignee'

/** Karten je Spalte, sortiert nach sort_order (Lücken-Sortierung), dann jüngste zuerst. */
export function groupByColumn(tasks: BoardTask[], columns: BoardColumn[]): Record<BoardColumn, BoardTask[]> {
  const grouped = Object.fromEntries(columns.map(c => [c, [] as BoardTask[]])) as Record<BoardColumn, BoardTask[]>
  for (const t of tasks) {
    if (grouped[t.status]) grouped[t.status].push(t)
  }
  for (const c of columns) {
    grouped[c].sort((a, b) =>
      a.sort_order - b.sort_order || (b.created_at || '').localeCompare(a.created_at || ''),
    )
  }
  return grouped
}

/**
 * sort_order für einen Drop an Position `targetIndex` innerhalb einer Spalte.
 * Lücken-Verfahren: zwischen Nachbarn das Mittel, an den Rändern ±1 — so braucht
 * ein Drop nie ein Umnummerieren der ganzen Spalte.
 */
export function dropSortOrder(columnTasks: BoardTask[], targetIndex: number, movedId?: string): number {
  const rest = columnTasks.filter(t => t.id !== movedId)
  if (rest.length === 0) return 0
  const idx = Math.max(0, Math.min(targetIndex, rest.length))
  if (idx === 0) return rest[0].sort_order - 1
  if (idx >= rest.length) return rest[rest.length - 1].sort_order + 1
  return (rest[idx - 1].sort_order + rest[idx].sort_order) / 2
}

/**
 * Fester Prozessschritt: die Karte erledigt nur das System (sobald z.B. die
 * Rechnung erstellt ist) — manuelles Abhaken würde die Aufgabe über den
 * task_key-Dedup dauerhaft unterdrücken und wird auch server-seitig abgelehnt.
 * Unbekannte Typen → false (verwaiste Alt-Karten müssen schliessbar bleiben,
 * gleiche Kulanz wie das Backend).
 */
export function isProcessBound(task: Pick<BoardTask, 'source' | 'task_type'>, taskTypes: Record<string, TaskTypeInfo>): boolean {
  if (task.source !== 'auto') return false
  return taskTypes[task.task_type ?? '']?.prozessgebunden === true
}

/** Aufgabenfeld einer Karte: manuelle Karten → 'manuell', Auto-Karten über den
 *  Typ-Katalog; unbekannte Typen fallen ebenfalls nach 'manuell' (Catch-all). */
export function taskField(task: Pick<BoardTask, 'source' | 'task_type'>, taskTypes: Record<string, TaskTypeInfo>): string {
  if (task.source === 'manuell') return 'manuell'
  return taskTypes[task.task_type ?? '']?.field ?? 'manuell'
}

/**
 * Dringlichkeits-Sortierung für die Feld-/Projektleiter-Ansicht:
 * überfällig zuerst (früheste Fälligkeit oben), dann Karten mit Fälligkeit,
 * dann der Rest — dort die am längsten liegende zuerst.
 */
export function urgencySort(tasks: BoardTask[], today = new Date()): BoardTask[] {
  const rank = (t: BoardTask) => (isOverdue(t, today) ? 0 : t.due_date ? 1 : 2)
  return [...tasks].sort((a, b) =>
    rank(a) - rank(b)
    || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    || (a.created_at || '').localeCompare(b.created_at || ''),
  )
}

/**
 * Karten je Feld (Default-Ansicht). Erledigtes verschwindet hier — der
 * Bearbeitungszustand ist in dieser Ansicht ein Chip auf der Karte, keine Spalte.
 */
export function groupByField(
  tasks: BoardTask[],
  fieldKeys: string[],
  taskTypes: Record<string, TaskTypeInfo>,
  today = new Date(),
): Record<string, BoardTask[]> {
  const grouped = Object.fromEntries(fieldKeys.map(k => [k, [] as BoardTask[]]))
  const fallback = fieldKeys.includes('manuell') ? 'manuell' : fieldKeys[0]
  for (const t of tasks) {
    if (t.status === 'erledigt') continue
    const key = taskField(t, taskTypes)
    ;(grouped[key] ?? grouped[fallback]).push(t)
  }
  for (const k of fieldKeys) grouped[k] = urgencySort(grouped[k], today)
  return grouped
}

/**
 * Karten je Zuständigem (Management-Ansicht): 'null'-Schlüssel = nicht
 * zugewiesen. Erledigtes ist auch hier ausgeblendet.
 */
export function groupByAssignee(tasks: BoardTask[], today = new Date()): Map<string | null, BoardTask[]> {
  const grouped = new Map<string | null, BoardTask[]>()
  for (const t of tasks) {
    if (t.status === 'erledigt') continue
    const key = t.assignee_staff_id ?? null
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(t)
  }
  for (const [key, list] of grouped) grouped.set(key, urgencySort(list, today))
  return grouped
}

export function daysSince(iso: string | null): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

/** Überfällig = Fälligkeit vor heute und noch nicht erledigt. Heute = lokaler
 *  Kalendertag (todayISO), nicht toISOString — das rechnet nach UTC und hielt
 *  zwischen Mitternacht und 02:00 noch den gestrigen Tag für «heute». */
export function isOverdue(task: Pick<BoardTask, 'due_date' | 'status'>, today = new Date()): boolean {
  if (!task.due_date || task.status === 'erledigt') return false
  return task.due_date < todayISO(today)
}

export type Urgency = 'overdue' | 'today' | 'soon' | null

/** Dringlichkeit für den Farbstreifen der Karte: überfällig, heute fällig,
 *  in den nächsten drei Tagen fällig — sonst nichts. Erledigtes ist nie dringend. */
export function urgency(task: Pick<BoardTask, 'due_date' | 'status'>, today = new Date()): Urgency {
  if (!task.due_date || task.status === 'erledigt') return null
  const iso = todayISO(today)
  if (task.due_date < iso) return 'overdue'
  if (task.due_date === iso) return 'today'
  const soon = todayISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3))
  return task.due_date <= soon ? 'soon' : null
}

/**
 * Titel ohne das Typ-Präfix, das der Chip darüber schon nennt: aus
 * «Projekt überfällig: Torti Seuzach» unter dem Chip «Projekt überfällig» wird
 * «Torti Seuzach». Die Auto-Titel tragen das Präfix, weil sie auch ausserhalb
 * des Boards (Detail, Dashboard) für sich stehen müssen; auf der Karte las sich
 * jede zweite Zeile doppelt. Ohne passendes Präfix bleibt der Titel, wie er ist.
 */
export function displayTitle(title: string, typeLabel: string | null | undefined): string {
  if (!typeLabel) return title
  const prefix = `${typeLabel}:`
  if (!title.startsWith(prefix)) return title
  const rest = title.slice(prefix.length).trim()
  return rest || title
}

/** Schnellsuche: jedes Wort muss in Titel, Projekt, Beschreibung oder Typ
 *  vorkommen (ohne Gross-/Kleinschreibung). Leere Suche trifft alles. */
export function matchesQuery(
  task: Pick<BoardTask, 'title' | 'project_name' | 'description'>,
  query: string,
  typeLabel?: string | null,
): boolean {
  const words = query.toLocaleLowerCase('de-CH').split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = [task.title, task.project_name, task.description, typeLabel]
    .filter(Boolean).join(' ').toLocaleLowerCase('de-CH')
  return words.every(w => hay.includes(w))
}

/**
 * Deep-Link von der Karte zum Quell-Datensatz.
 *
 * Offerten, Rechnungen und Bestellfreigaben mit Projekt öffnen das Projekt auf
 * dem passenden Reiter — dort steht der Datensatz selbst. Die Listen-Screens
 * kennen keinen Sprung auf einen einzelnen Eintrag; ohne Projekt bleibt es
 * deshalb bei der Liste (Offerten wenigstens auf den passenden Status gefiltert).
 */
export function navTarget(task: BoardTask): { screen: AdminScreen; detailId?: string; tab?: ProjectTab } | null {
  const inProject = (tab: ProjectTab) =>
    task.project_id ? { screen: 'projects' as const, detailId: task.project_id, tab } : null
  switch (task.ref_kind) {
    case 'quote':
      return inProject('quotes') ?? {
        screen: 'quotes',
        // QuotesScreen liest die detailId als Status-Vorfilter.
        detailId: task.task_type === 'quote_draft_stale' ? 'entwurf'
          : task.task_type === 'quote_followup' ? 'gesendet' : undefined,
      }
    case 'invoice': return inProject('invoices') ?? { screen: 'invoices' }
    case 'project': return task.project_id ? { screen: 'projects', detailId: task.project_id } : { screen: 'projects' }
    case 'draft': return { screen: 'project-drafts' }
    case 'approval': return inProject('approvals') ?? { screen: 'dashboard' }
    case 'aftersales': return { screen: 'aftersales' }
    // Der Fall liegt im Projekt, Reiter «Garantie» (Spec garantiefall.md §6.2).
    case 'warranty_case': return inProject('warranty')
    default:
      return task.project_id ? { screen: 'projects', detailId: task.project_id } : null
  }
}

/** Direktaktion auf der Karte — die Arbeit, für die man sonst erst «Öffnen» muss. */
export interface CardAction {
  kind: 'close_project' | 'quote_reminder'
  /** Knopf auf der Karte (kurz). */
  label: string
  /** Knopf im Detail (ausgeschrieben). */
  longLabel: string
  /** Rückfrage vor dem Auslösen — beide Aktionen wirken nach aussen bzw. endgültig. */
  confirm: string
  success: string
}

/**
 * Welche Direktaktion eine Karte trägt. Bewusst nur zwei, beide mit einem
 * bestehenden Endpoint, und beide machen die Karte im nächsten Sync von selbst
 * erledigt (Projekt nicht mehr offen bzw. reminder_sent_at gesetzt):
 *
 * - «Projekt überfällig» → Projekt abschliessen (wie das Dashboard-Modal).
 * - «Offerte nachfassen» → Erinnerungsmail an den Kunden.
 *
 * Nicht dabei: «Rechnung mahnen». Ob Zahlungserinnerung oder Mahnung fällig
 * ist, weiss die Karte nicht, und eine Mahnung per Ein-Klick vom Board aus
 * ist zu viel für einen Knopf — dafür öffnet die Karte die Rechnung im Projekt.
 */
export function cardAction(task: Pick<BoardTask, 'source' | 'task_type' | 'status' | 'project_id' | 'ref_id' | 'title'>): CardAction | null {
  if (task.source !== 'auto' || task.status === 'erledigt') return null
  if (task.task_type === 'project_overdue' && task.project_id) {
    return {
      kind: 'close_project',
      label: 'Abschliessen',
      longLabel: 'Projekt abschliessen',
      confirm: 'Projekt als abgeschlossen markieren? Danach erscheint es unter «Rechnung erstellen», falls noch keine Rechnung existiert.',
      success: 'Projekt abgeschlossen',
    }
  }
  if (task.task_type === 'quote_followup' && task.ref_id && /^\d+$/.test(task.ref_id)) {
    return {
      kind: 'quote_reminder',
      label: 'Nachfassen',
      longLabel: 'Erinnerung an Kunden senden',
      confirm: 'Erinnerungsmail zu dieser Offerte jetzt an den Kunden senden?',
      success: 'Erinnerung an den Kunden gesendet',
    }
  }
  return null
}

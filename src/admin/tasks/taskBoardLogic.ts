import { BoardColumn, BoardTask, TaskTypeInfo } from '../../api/admin'

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

/** Überfällig = Fälligkeit vor heute und noch nicht erledigt. */
export function isOverdue(task: Pick<BoardTask, 'due_date' | 'status'>, today = new Date()): boolean {
  if (!task.due_date || task.status === 'erledigt') return false
  const iso = today.toISOString().slice(0, 10)
  return task.due_date < iso
}

// Aufgaben-Board (Kanban): Karten lesen, ändern, löschen.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export type BoardColumn = 'offen' | 'in_arbeit' | 'wartet' | 'erledigt'

export interface BoardTask {
  id: string
  source: 'auto' | 'manuell'
  task_type: string | null
  title: string
  description: string | null
  project_id: string | null
  project_name: string | null
  ref_kind: 'quote' | 'invoice' | 'project' | 'draft' | 'approval' | 'aftersales' | null
  ref_id: string | null
  status: BoardColumn
  sort_order: number
  assignee_staff_id: string | null
  assignee_locked: boolean
  due_date: string | null
  created_by_name: string | null
  done_at: string | null
  done_by_name: string | null
  auto_done: boolean
  created_at: string
}

export interface TaskBoardStaff {
  id: string
  name: string | null
  kuerzel: string | null
}

export interface TaskTypeInfo {
  label: string
  field: string
  /** Fester Prozessschritt: nur der Sync erledigt die Karte, manuelles
   *  Abhaken lehnt der Server ab (auto_task_process_bound). */
  prozessgebunden: boolean
}

export interface BoardField {
  key: string
  label: string
}

export interface TaskBoardResponse {
  tasks: BoardTask[]
  columns: BoardColumn[]
  fields: BoardField[]
  task_types: Record<string, TaskTypeInfo>
  me_staff_id: string | null
  can_filter_all: boolean
  assignee: string
  projektleiter: TaskBoardStaff[]
  staff: TaskBoardStaff[]
}

export async function getTaskBoard(assignee: string, refresh = false): Promise<TaskBoardResponse> {
  const params = new URLSearchParams({ assignee })
  if (refresh) params.set('refresh', '1')
  return apiFetch<TaskBoardResponse>(`/pwa/admin/tasks?${params}`)
}

export interface CreateBoardTaskBody {
  title: string
  description?: string | null
  project_id?: string | null
  assignee_staff_id?: string | null
  due_date?: string | null
}

export async function createBoardTask(body: CreateBoardTaskBody): Promise<BoardTask | null> {
  const res = await apiFetch('/pwa/admin/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as { task: BoardTask | null }
  return res.task
}

export interface PatchBoardTaskBody {
  status?: BoardColumn
  sort_order?: number
  assignee_staff_id?: string | null
  due_date?: string | null
  title?: string
  description?: string | null
}

export async function updateBoardTask(taskId: string, body: PatchBoardTaskBody): Promise<BoardTask | null> {
  const res = await apiFetch(`/pwa/admin/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }) as { task: BoardTask | null }
  return res.task
}

export async function deleteBoardTask(taskId: string): Promise<void> {
  await apiFetch(`/pwa/admin/tasks/${taskId}`, { method: 'DELETE' })
}

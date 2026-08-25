import { useState } from 'react'
import {
  addAdminProjectTask, deleteAdminProjectTask, listAdminProjectTasks, updateAdminProjectTask,
} from '../../../api/projectTasks'
import type { ProjectTask } from '../../../api/projectTasks'

// Aufgaben-Checkliste des Projekts (Charge H, H3). Dünner Wrapper um die
// api/projectTasks-Funktionen — er hält die Liste und meldet Fehler als Toast,
// damit der Screen davon nichts mehr weiss.
export interface UseProjectTasks {
  tasks: ProjectTask[]
  reload: () => Promise<void>
  add: (text: string) => Promise<void>
  edit: (taskId: string, text: string) => Promise<void>
  remove: (taskId: string) => Promise<void>
}

export function useProjectTasks(
  projectId: string | null | undefined,
  onToast: (msg: string) => void,
): UseProjectTasks {
  const [tasks, setTasks] = useState<ProjectTask[]>([])

  async function reload() {
    if (!projectId) return
    try {
      setTasks(await listAdminProjectTasks(projectId))
    } catch { /* ignore */ }
  }

  async function add(text: string) {
    if (!projectId) return
    try {
      await addAdminProjectTask(projectId, text)
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Fehler beim Anlegen')
    }
  }

  async function edit(taskId: string, text: string) {
    if (!projectId) return
    try {
      await updateAdminProjectTask(projectId, taskId, text)
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Fehler beim Speichern')
    }
  }

  async function remove(taskId: string) {
    if (!projectId) return
    if (!window.confirm('Aufgabe wirklich löschen?')) return
    try {
      await deleteAdminProjectTask(projectId, taskId)
      // Optimistisch aus der Liste nehmen statt neu zu laden — die Antwort trägt
      // nichts bei, was die Zeile noch bräuchte.
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Fehler beim Löschen')
    }
  }

  return { tasks, reload, add, edit, remove }
}

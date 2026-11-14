// Aufgaben (Checkliste) des im Planungs-Panel geöffneten Projekts.
//
// Die Checkliste hängt am einzelnen Projekt und wird deshalb erst beim Öffnen im
// Panel geladen — nicht mit dem Kalender, der den ganzen Bestand füllt. Seit Charge
// M4a (Spec refactoring-wachstum.md §17) eigener Hook; vorher Zustand und Handler
// direkt in ProjectScheduleScreen.tsx. Darstellung: ScheduleTasksSection.tsx.
import { useEffect, useState } from 'react'
import {
  type ProjectTask,
  addAdminProjectTask, deleteAdminProjectTask, listAdminProjectTasks, updateAdminProjectTask,
} from '../../api/projectTasks'
import type { ToastFn } from '../components/useToast'

export interface ScheduleTasks {
  tasks: ProjectTask[]
  tasksLoading: boolean
  newTaskText: string
  setNewTaskText: (text: string) => void
  taskBusy: boolean
  editingTaskId: string | null
  editingTaskText: string
  setEditingTaskText: (text: string) => void
  startEdit: (task: ProjectTask) => void
  cancelEdit: () => void
  handleAddTask: () => Promise<void>
  handleSaveTaskEdit: () => Promise<void>
  handleDeleteTask: (taskId: string) => Promise<void>
}

/** ``projectId`` leer (neuer interner Einsatz) oder Panel zu ⇒ keine Aufgaben. */
export function useScheduleTasks(projectId: string | undefined, panelOpen: boolean,
                                 showToast: ToastFn): ScheduleTasks {
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [newTaskText, setNewTaskText] = useState('')
  const [taskBusy, setTaskBusy] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTaskText, setEditingTaskText] = useState('')

  useEffect(() => {
    setEditingTaskId(null)
    setEditingTaskText('')
    setNewTaskText('')
    const pid = projectId
    if (!panelOpen || !pid) {
      setTasks([])
      return
    }
    let cancelled = false
    setTasksLoading(true)
    listAdminProjectTasks(pid)
      .then(t => { if (!cancelled) setTasks(t) })
      .catch(() => { if (!cancelled) setTasks([]) })
      .finally(() => { if (!cancelled) setTasksLoading(false) })
    return () => { cancelled = true }
  }, [projectId, panelOpen])

  async function reloadTasks() {
    if (!projectId) return
    try {
      setTasks(await listAdminProjectTasks(projectId))
    } catch { /* Liste bleibt wie sie ist */ }
  }

  async function handleAddTask() {
    const text = newTaskText.trim()
    if (!projectId || !text || taskBusy) return
    setTaskBusy(true)
    try {
      await addAdminProjectTask(projectId, text)
      setNewTaskText('')
      await reloadTasks()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Aufgabe konnte nicht angelegt werden.', 'error')
    } finally {
      setTaskBusy(false)
    }
  }

  async function handleSaveTaskEdit() {
    const text = editingTaskText.trim()
    if (!projectId || !editingTaskId || !text || taskBusy) return
    setTaskBusy(true)
    try {
      await updateAdminProjectTask(projectId, editingTaskId, text)
      setEditingTaskId(null)
      setEditingTaskText('')
      await reloadTasks()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Aufgabe konnte nicht gespeichert werden.', 'error')
    } finally {
      setTaskBusy(false)
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!projectId || taskBusy) return
    if (!window.confirm('Aufgabe wirklich löschen?')) return
    setTaskBusy(true)
    try {
      await deleteAdminProjectTask(projectId, taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
      if (editingTaskId === taskId) { setEditingTaskId(null); setEditingTaskText('') }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Aufgabe konnte nicht gelöscht werden.', 'error')
    } finally {
      setTaskBusy(false)
    }
  }

  return {
    tasks, tasksLoading, newTaskText, setNewTaskText, taskBusy,
    editingTaskId, editingTaskText, setEditingTaskText,
    startEdit: (t: ProjectTask) => { setEditingTaskId(t.id); setEditingTaskText(t.text) },
    cancelEdit: () => { setEditingTaskId(null); setEditingTaskText('') },
    handleAddTask, handleSaveTaskEdit, handleDeleteTask,
  }
}

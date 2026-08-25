import { useState } from 'react'
import {
  addProjectComment, deleteProjectComment, listProjectComments, updateProjectComment,
} from '../../../api/admin/projects'
import type { ProjectComment } from '../../../api/admin/projects'

// Kommentar-Verlauf im Projekt-Detail (Charge H, H3): Laden, Anlegen, Bearbeiten,
// Löschen samt der Zustände, die die Maske dafür braucht.
//
// Der Screen behielt davon 8 useState und 5 Handler — die hängen alle nur
// aneinander, an nichts sonst im Screen. Genau so ein Block gehört in einen Hook.

// Nach 10 Minuten ist ein Kommentar gesperrt: Bearbeiten/Löschen verschwinden aus
// der Maske, das Backend lehnt es zusätzlich ab. Wer sich vertippt, korrigiert
// sofort — was länger steht, haben andere schon gelesen.
export const COMMENT_LOCK_MS = 10 * 60 * 1000

export interface UseProjectComments {
  comments: ProjectComment[]
  newComment: string
  setNewComment: (v: string) => void
  adding: boolean
  editingId: string | null
  editingText: string
  setEditingText: (v: string) => void
  savingEdit: boolean
  confirmDeleteId: string | null
  setConfirmDeleteId: (v: string | null) => void
  deleting: boolean
  reload: () => Promise<void>
  add: () => Promise<void>
  startEdit: (c: ProjectComment) => void
  cancelEdit: () => void
  saveEdit: () => Promise<void>
  remove: () => Promise<void>
  /** Älter als COMMENT_LOCK_MS — `now` kommt von aussen, damit die Sperre ohne Reload greift. */
  isLocked: (c: ProjectComment, now: number) => boolean
}

export function useProjectComments(
  projectId: string | null | undefined,
  onError: (msg: string) => void,
): UseProjectComments {
  const [comments, setComments] = useState<ProjectComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function reload() {
    if (!projectId) return
    try {
      setComments(await listProjectComments(projectId))
    } catch { /* ignore */ }
  }

  async function add() {
    if (!projectId || !newComment.trim()) return
    setAdding(true)
    try {
      await addProjectComment(projectId, newComment.trim())
      setComments(await listProjectComments(projectId))
      setNewComment('')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Fehler beim Speichern des Kommentars')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(c: ProjectComment) {
    setEditingId(c.id)
    setEditingText(c.text)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingText('')
  }

  async function saveEdit() {
    if (!projectId || !editingId || !editingText.trim()) return
    setSavingEdit(true)
    try {
      await updateProjectComment(projectId, editingId, editingText.trim())
      setComments(await listProjectComments(projectId))
      cancelEdit()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren des Kommentars')
    } finally {
      setSavingEdit(false)
    }
  }

  async function remove() {
    if (!projectId || !confirmDeleteId) return
    setDeleting(true)
    try {
      await deleteProjectComment(projectId, confirmDeleteId)
      setComments(prev => prev.filter(c => c.id !== confirmDeleteId))
      setConfirmDeleteId(null)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Fehler beim Löschen des Kommentars')
      setConfirmDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  function isLocked(c: ProjectComment, now: number): boolean {
    return now - new Date(c.created_at).getTime() > COMMENT_LOCK_MS
  }

  return {
    comments, newComment, setNewComment, adding,
    editingId, editingText, setEditingText, savingEdit,
    confirmDeleteId, setConfirmDeleteId, deleting,
    reload, add, startEdit, cancelEdit, saveEdit, remove, isLocked,
  }
}

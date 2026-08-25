import { useState } from 'react'
import {
  deleteProjectFile, listProjectFiles, renameProjectFile, uploadProjectFile,
} from '../../../api/admin/projects'
import type { ProjectFile, ProjectFileCategory } from './types'

// Dateien am Projekt (Charge H, H3): Liste, Upload je Kategorie, Umbenennen,
// Löschen.
//
// Der Upload kann den Beschaffungsstatus vorrücken — das entscheidet der Server
// (services/project_workflow.py) und meldet es in der Antwort. Der Hook reicht es
// über `onBeschaffungAdvanced` weiter, statt den Status selbst zu kennen: welcher
// Schritt auf welchen folgt, ist nicht die Sache der Dateiliste.
export interface UseProjectDocuments {
  files: ProjectFile[]
  setFiles: (f: ProjectFile[]) => void
  uploading: boolean
  /** Kategorie, die gerade hochlädt — markiert die richtige Sektion mit «Wird hochgeladen…». */
  uploadingCategory: ProjectFileCategory | null
  confirmDeleteId: string | null
  setConfirmDeleteId: (id: string | null) => void
  deleting: boolean
  reload: () => Promise<void>
  upload: (category: ProjectFileCategory, filesToUpload: File[]) => Promise<void>
  remove: () => Promise<void>
  rename: (fileId: string, filename: string) => Promise<void>
}

export function useProjectDocuments(
  projectId: string | null | undefined,
  cb: {
    onError: (msg: string) => void
    onToast: (msg: string) => void
    onBeschaffungAdvanced: (status: string) => void
  },
): UseProjectDocuments {
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadingCategory, setUploadingCategory] = useState<ProjectFileCategory | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function reload() {
    if (!projectId) return
    try {
      setFiles(await listProjectFiles(projectId))
    } catch { /* ignore */ }
  }

  async function upload(category: ProjectFileCategory, filesToUpload: File[]) {
    if (!projectId || !filesToUpload.length) return
    setUploading(true)
    setUploadingCategory(category)
    try {
      // Backend nimmt eine Datei pro Request → sequentiell hochladen.
      let advancedTo: string | null = null
      for (const file of filesToUpload) {
        const res = await uploadProjectFile(projectId, file, category)
        if (res?.beschaffung_status) advancedTo = res.beschaffung_status
      }
      setFiles(await listProjectFiles(projectId))
      if (advancedTo) cb.onBeschaffungAdvanced(advancedTo)
      cb.onToast(
        advancedTo
          ? `Hochgeladen · Beschaffung: ${advancedTo}`
          : filesToUpload.length > 1 ? `${filesToUpload.length} Dateien hochgeladen` : 'Datei hochgeladen',
      )
    } catch {
      cb.onError('Fehler beim Hochladen')
    } finally {
      setUploading(false)
      setUploadingCategory(null)
    }
  }

  async function remove() {
    if (!projectId || !confirmDeleteId) return
    setDeleting(true)
    try {
      await deleteProjectFile(projectId, confirmDeleteId)
      setFiles(prev => prev.filter(f => f.id !== confirmDeleteId))
      setConfirmDeleteId(null)
    } catch {
      cb.onError('Fehler beim Löschen')
    } finally {
      setDeleting(false)
    }
  }

  async function rename(fileId: string, filename: string) {
    if (!projectId) return
    try {
      await renameProjectFile(projectId, fileId, filename)
      setFiles(await listProjectFiles(projectId))
    } catch {
      cb.onError('Fehler beim Umbenennen')
    }
  }

  return {
    files, setFiles, uploading, uploadingCategory, confirmDeleteId, setConfirmDeleteId,
    deleting, reload, upload, remove, rename,
  }
}

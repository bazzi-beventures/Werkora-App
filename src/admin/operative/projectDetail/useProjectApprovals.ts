import { useCallback, useRef, useState } from 'react'
import {
  createProjectApproval, decideProjectApproval, deleteProjectApproval, listProjectApprovals,
} from '../../../api/admin/projects'
import type { ProjectApproval } from './types'

// Bestellfreigaben im Projekt-Detail (Charge H, H3): ein Dokument geht zur
// Freigabe an einen Vorgesetzten, der per Mail-Link oder im Dashboard entscheidet.
//
// Der Hook hält auch das Anlege-Formular, weil dessen Felder nur hier gebraucht
// werden — inklusive des Datei-Feldes, das nach dem Absenden geleert werden muss
// (sonst zeigt der Browser weiter den alten Dateinamen). Das Feld meldet sich per
// Callback-Ref (`bindFileInput`) an; eine RefObject-Rückgabe würde den React
// Compiler das ganze Hook-Ergebnis als Ref behandeln lassen — dann gilt jeder
// Zugriff auf `approvals.title` & Co. im JSX als Ref-Zugriff während des Renderns.

export interface UseProjectApprovals {
  approvals: ProjectApproval[]
  showForm: boolean
  setShowForm: (v: boolean) => void
  title: string
  setTitle: (v: string) => void
  approverUserId: string
  setApproverUserId: (v: string) => void
  file: File | null
  setFile: (f: File | null) => void
  /** An das <input type="file"> hängen — der Hook leert es nach dem Absenden. */
  bindFileInput: (el: HTMLInputElement | null) => void
  creating: boolean
  decidingId: string | null
  reload: () => Promise<void>
  resetForm: () => void
  create: (e: React.FormEvent) => Promise<void>
  decide: (approvalId: string, decision: 'approve' | 'reject') => Promise<void>
  remove: (approvalId: string) => Promise<void>
}

export function useProjectApprovals(
  projectId: string | null | undefined,
  onToast: (msg: string) => void,
): UseProjectApprovals {
  const [approvals, setApprovals] = useState<ProjectApproval[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [approverUserId, setApproverUserId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [creating, setCreating] = useState(false)
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const bindFileInput = useCallback((el: HTMLInputElement | null) => { fileInput.current = el }, [])

  async function reload() {
    if (!projectId) return
    try {
      setApprovals(await listProjectApprovals<ProjectApproval>(projectId))
    } catch { /* ignore */ }
  }

  function resetForm() {
    setShowForm(false)
    setTitle('')
    setApproverUserId('')
    setFile(null)
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!projectId || !title.trim() || !approverUserId || !file) return
    setCreating(true)
    try {
      await createProjectApproval(projectId, title.trim(), approverUserId, file)
      resetForm()
      if (fileInput.current) fileInput.current.value = ''
      onToast('Freigabe-Anfrage gesendet')
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Fehler beim Anlegen')
    } finally {
      setCreating(false)
    }
  }

  async function decide(approvalId: string, decision: 'approve' | 'reject') {
    let note: string | undefined
    if (decision === 'reject') {
      const input = window.prompt('Grund für Ablehnung (optional):')
      if (input === null) return
      note = input || undefined
    }
    setDecidingId(approvalId)
    try {
      await decideProjectApproval(approvalId, decision, note)
      onToast(decision === 'approve' ? 'Freigabe erteilt' : 'Freigabe abgelehnt')
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setDecidingId(null)
    }
  }

  async function remove(approvalId: string) {
    if (!window.confirm('Pendente Freigabe wirklich löschen?')) return
    try {
      await deleteProjectApproval(approvalId)
      onToast('Freigabe gelöscht')
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Fehler beim Löschen')
    }
  }

  return {
    approvals, showForm, setShowForm, title, setTitle, approverUserId, setApproverUserId,
    file, setFile, bindFileInput, creating, decidingId,
    reload, resetForm, create, decide, remove,
  }
}

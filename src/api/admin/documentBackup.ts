// Dokument-Massensicherung (Modul `document_backup`, nur Management).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export type DocumentBackupStatus = 'pending' | 'running' | 'ready' | 'failed' | 'cancelled'

// Vollbackup = Gesamtbestand, Teilbackup = Zeitraum. Beide haben ein eigenes
// Monatskontingent (Feature `document_backup_limit`).
export type DocumentBackupScope = 'full' | 'partial'

export type DocumentBackupContent = 'documents' | 'photos' | 'project_files' | 'master_data'

export const BACKUP_CONTENT_LABELS: Record<DocumentBackupContent, string> = {
  documents: 'Dokumente (Rechnungen, Offerten, Rapporte)',
  photos: 'Rapport-Fotos',
  project_files: 'Projekt-Dateien (Lieferscheine, ABs, Uploads)',
  master_data: 'Stammdaten als Excel (Projekte, Kunden, Journale)',
}

// Vollbackup: alles an. Teilbackup: Dokumente + Fotos (Spec §4.2) — Projekt-Dateien
// und Stammdaten sind selten das, was man für einen einzelnen Zeitraum braucht.
export const DEFAULT_CONTENTS: Record<DocumentBackupScope, DocumentBackupContent[]> = {
  full: ['documents', 'photos', 'project_files', 'master_data'],
  partial: ['documents', 'photos'],
}

export interface DocumentBackupSelection {
  scope: DocumentBackupScope
  range_from: string | null
  range_to: string | null
  contents: DocumentBackupContent[]
}

export interface DocumentBackupPart {
  filename: string | null
  document_count: number
  total_bytes: number
  download_url: string
}

export interface DocumentBackupJob {
  id: number
  status: DocumentBackupStatus
  document_count: number
  total_bytes: number
  filename: string | null
  error: string | null
  created_at: string
  ready_at: string | null
  expires_at: string | null
  expired: boolean
  cancel_requested: boolean
  // Ein Backup kann auf mehrere Teil-ZIPs aufgeteilt sein (Storage-Upload-Limit).
  // `parts` ist maßgeblich; `download_url` bleibt für Einzel-Teil-Backups gesetzt.
  parts: DocumentBackupPart[]
  download_url: string | null
  // Beschreibt den Lauf — die Statuskarte zeigt Typ/Zeitraum/Inhalte des letzten
  // Backups. Alt-Jobs (vor Migration 20260825) liefern 'full' + ['documents'].
  scope: DocumentBackupScope
  range_from: string | null
  range_to: string | null
  contents: DocumentBackupContent[]
}

// Vorab-Übersicht für den Bestätigungs-Dialog (startet noch nichts).
export interface DocumentBackupPreview {
  scope: DocumentBackupScope
  range_from: string | null
  range_to: string | null
  contents: DocumentBackupContent[]
  document_count: number
  invoices: number
  quotes: number
  reports: number
  photos: number
  project_files: number
  // Alt-Zeilen, die nur auf Google Drive liegen — die gehen bewusst NICHT mit
  // (kein Drive-Zugriff im Backup-Pfad), werden aber ausgewiesen.
  photos_drive_only: number
  project_files_drive_only: number
  max_per_month: number         // Kontingent des gewählten Typs, 0 = unbegrenzt
  max_full_per_month: number
  max_partial_per_month: number
  used_this_month: number
  remaining_this_month: number | null  // null = unbegrenzt
  limit_reached: boolean
  active: boolean
}

function selectionQuery(sel: DocumentBackupSelection): string {
  const params = new URLSearchParams()
  params.set('scope', sel.scope)
  if (sel.scope === 'partial') {
    if (sel.range_from) params.set('range_from', sel.range_from)
    if (sel.range_to) params.set('range_to', sel.range_to)
  }
  // Wiederholter Key statt Komma-Liste — FastAPI liest `contents` als list[str].
  sel.contents.forEach(c => params.append('contents', c))
  return params.toString()
}

export async function getDocumentBackupPreview(
  sel: DocumentBackupSelection,
): Promise<DocumentBackupPreview> {
  return apiFetch<DocumentBackupPreview>(
    `/pwa/admin/document-backup/preview?${selectionQuery(sel)}`,
  )
}

export async function startDocumentBackup(
  sel: DocumentBackupSelection,
): Promise<DocumentBackupJob> {
  return apiFetch<DocumentBackupJob>('/pwa/admin/document-backup', {
    method: 'POST',
    body: JSON.stringify({
      scope: sel.scope,
      range_from: sel.scope === 'partial' ? sel.range_from : null,
      range_to: sel.scope === 'partial' ? sel.range_to : null,
      contents: sel.contents,
    }),
  })
}

export async function getLatestDocumentBackup(): Promise<DocumentBackupJob | null> {
  const res = await apiFetch('/pwa/admin/document-backup/latest') as { job: DocumentBackupJob | null }
  return res.job
}

export async function getDocumentBackup(id: number): Promise<DocumentBackupJob> {
  return apiFetch<DocumentBackupJob>(`/pwa/admin/document-backup/${id}`)
}

export async function cancelDocumentBackup(id: number): Promise<DocumentBackupJob> {
  return apiFetch<DocumentBackupJob>(`/pwa/admin/document-backup/${id}/cancel`, { method: 'POST' })
}

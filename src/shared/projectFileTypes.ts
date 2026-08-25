/**
 * Erlaubte Dateitypen für Projekt-Dateien — geteilt zwischen Admin-Dokumente-Tab
 * und Mitarbeiter-PWA, damit die beiden Picker nicht auseinanderlaufen.
 *
 * Muss zur Backend-Whitelist `_ALLOWED_PROJECT_FILE_MIME_TYPES` in
 * agents/routers/admin_projects.py passen: was der Picker durchlässt, das Backend
 * aber ablehnt, sieht für den Nutzer wie ein kaputter Upload aus.
 *
 * Die Endungen stehen zusätzlich zu den MIME-Typen im accept-String: Windows
 * meldet für .xls/.doc je nach installierter Office-Version abweichende MIME-Typen,
 * über die Endung greift der Filter trotzdem.
 */
export const PROJECT_FILE_ACCEPT = [
  'image/*',
  'application/pdf',
  '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls', 'application/vnd.ms-excel',
  '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc', 'application/msword',
].join(',')

const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])

const WORD_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
])

/**
 * Icon für eine Projekt-Datei. Fällt auf den Dateinamen zurück, weil `mime_type`
 * bei Altbestand (Drive-Migration) NULL sein kann — ohne den Fallback bekäme ein
 * migriertes .xlsx das Bild-Icon.
 */
export function projectFileIcon(mimeType: string | null | undefined, filename?: string | null): string {
  const mime = mimeType || ''
  if (mime === 'application/pdf') return '📄'
  if (EXCEL_MIME_TYPES.has(mime)) return '📊'
  if (WORD_MIME_TYPES.has(mime)) return '📝'
  if (mime.startsWith('image/')) return '🖼️'

  const ext = (filename || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (ext === 'pdf') return '📄'
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return '📊'
  if (ext === 'docx' || ext === 'doc') return '📝'
  return '🖼️'
}

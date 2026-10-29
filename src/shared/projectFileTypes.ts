/**
 * Erlaubte Dateitypen für Projekt-Dateien — geteilt zwischen Admin-Dokumente-Tab
 * und Mitarbeiter-PWA, damit die beiden Picker nicht auseinanderlaufen.
 *
 * Muss zur Backend-Whitelist `_ALLOWED_PROJECT_FILE_MIME_TYPES` in
 * agents/routers/admin_project_files.py passen: was der Picker durchlässt, das Backend
 * aber ablehnt, sieht für den Nutzer wie ein kaputter Upload aus.
 *
 * Die Endungen stehen zusätzlich zu den MIME-Typen im accept-String: Windows
 * meldet für .xls/.doc je nach installierter Office-Version abweichende MIME-Typen,
 * über die Endung greift der Filter trotzdem.
 */
const DOCUMENT_ACCEPT = [
  'image/*',
  'application/pdf',
  '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls', 'application/vnd.ms-excel',
  '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc', 'application/msword',
  // Abgespeicherte E-Mails (WW-53). Nur über die Endung: für .msg meldet der
  // Browser je nach Office keinen oder einen anderen Typ — das Backend erkennt
  // beide ebenfalls an der Endung (_EMAIL_MIME_BY_EXT).
  '.eml', '.msg',
]

// Kurze Videos (WW-45), z. B. um ein Geräusch festzuhalten. Mit Video-Typen im
// accept bietet das Handy neben der Galerie auch die Kamera im Videomodus an.
// Einzeln statt `video/*`: .avi/.mkv lehnte das Backend ab.
const VIDEO_ACCEPT = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', '.mp4', '.mov', '.webm', '.3gp']

export const PROJECT_FILE_ACCEPT = [...DOCUMENT_ACCEPT, ...VIDEO_ACCEPT].join(',')

/**
 * Der Lieferschein-Knopf öffnet direkt die Kamera (`capture`). Ein Video im
 * accept liesse das Handy dort zuerst fragen, ob Foto oder Video — für einen
 * Lieferschein ein überflüssiger Tipp.
 */
export const LIEFERSCHEIN_FILE_ACCEPT = DOCUMENT_ACCEPT.join(',')

const VIDEO_EXT = /\.(mp4|mov|webm|3gp)$/i
const EMAIL_EXT = /\.(eml|msg)$/i
const EMAIL_MIME_TYPES = new Set(['message/rfc822', 'application/vnd.ms-outlook'])

// Grössen-Deckel wie im Backend (admin_project_files.py). Vorab im Browser
// geprüft, damit niemand 200 MB über das Baustellen-Netz schiebt, um danach eine
// Absage zu bekommen.
const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

function isVideoFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith('video/') || VIDEO_EXT.test(file.name)
}

/** Fehlermeldung, wenn die Datei über dem Deckel liegt, sonst null. */
export function projectFileTooLarge(file: { name: string; type: string; size: number }): string | null {
  if (isVideoFile(file)) {
    return file.size > MAX_VIDEO_BYTES
      ? `«${file.name}» ist zu gross (max. 50 MB) — bitte ein kürzeres Video aufnehmen.`
      : null
  }
  return file.size > MAX_FILE_BYTES ? `«${file.name}» ist zu gross (max. 20 MB).` : null
}

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
  if (mime.startsWith('video/')) return '🎬'
  if (EMAIL_MIME_TYPES.has(mime)) return '✉️'

  const ext = (filename || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (ext === 'pdf') return '📄'
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return '📊'
  if (ext === 'docx' || ext === 'doc') return '📝'
  if (filename && VIDEO_EXT.test(filename)) return '🎬'
  if (filename && EMAIL_EXT.test(filename)) return '✉️'
  return '🖼️'
}

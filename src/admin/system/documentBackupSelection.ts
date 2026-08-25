// Reine Auswahl-/Anzeige-Logik des Datensicherungs-Screens (Spec
// docs/specs/datensicherung-v2.md). Bewusst ohne React und ohne Fetch, damit
// Vorbelegung, Zeitraum-Prüfung und die Zählzeilen des Bestätigungsdialogs
// testbar sind — im Screen selbst wären sie es nur über gerendertes DOM.

import {
  DocumentBackupContent,
  DocumentBackupPreview,
  DocumentBackupScope,
  BACKUP_CONTENT_LABELS,
} from '../../api/admin'

export const CONTENT_ORDER: DocumentBackupContent[] = [
  'documents', 'photos', 'project_files', 'master_data',
]

/** Lokales ISO-Datum. NICHT toISOString(): das rechnet nach UTC um und liefert in
 *  der Schweiz vor 01:00 (bzw. 02:00 im Sommer) den Vortag. */
export function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Vorbelegung des Teilbackups: die letzten zwei Monate (Spec §4.1). */
export function defaultRange(today: Date = new Date()): { from: string; to: string } {
  const from = new Date(today)
  from.setMonth(from.getMonth() - 2)
  return { from: isoLocal(from), to: isoLocal(today) }
}

/** Vollbackup: alles an. Teilbackup: Dokumente + Fotos — Projekt-Dateien und
 *  Stammdaten sind selten das, was man für einen einzelnen Zeitraum braucht. */
export function defaultContents(scope: DocumentBackupScope): DocumentBackupContent[] {
  return scope === 'full'
    ? ['documents', 'photos', 'project_files', 'master_data']
    : ['documents', 'photos']
}

/** Haken setzen/entfernen — das Ergebnis behält immer die Reihenfolge von
 *  CONTENT_ORDER, damit die Auswahl nicht von der Klick-Reihenfolge abhängt
 *  (sie landet 1:1 als `contents` auf der Job-Zeile). */
export function toggleContent(
  current: DocumentBackupContent[], key: DocumentBackupContent,
): DocumentBackupContent[] {
  return current.includes(key)
    ? current.filter(c => c !== key)
    : CONTENT_ORDER.filter(c => c === key || current.includes(c))
}

/** True, wenn der Start blockiert werden muss: Teilbackup ohne oder mit
 *  verdrehtem Zeitraum. Das Backend lehnt denselben Fall mit 400 ab — hier nur,
 *  damit der Nutzer den Knopf gar nicht erst drücken kann. */
export function rangeInvalid(
  scope: DocumentBackupScope, from: string, to: string,
): boolean {
  return scope === 'partial' && (!from || !to || from > to)
}

export function describeScope(
  scope: DocumentBackupScope, from: string | null, to: string | null,
): string {
  if (scope === 'partial' && from && to) return `Teilbackup ${from} bis ${to}`
  return 'Vollbackup (Gesamtbestand)'
}

/** Kurzform der Inhalte für die Statuskarte („Dokumente, Rapport-Fotos"). */
export function describeContents(contents: DocumentBackupContent[]): string {
  return contents.map(c => (BACKUP_CONTENT_LABELS[c] ?? c).split(' (')[0]).join(', ')
}

/** Zählzeilen des Bestätigungsdialogs — nur für die gewählten Kategorien. */
export function previewLines(preview: DocumentBackupPreview): string[] {
  const lines: string[] = []
  if (preview.contents.includes('documents')) {
    lines.push(
      `${preview.invoices} Rechnung(en) · ${preview.quotes} Offert-Datei(en) · `
      + `${preview.reports} Rapport(e)`,
    )
  }
  if (preview.contents.includes('photos')) lines.push(`${preview.photos} Rapport-Foto(s)`)
  if (preview.contents.includes('project_files')) {
    lines.push(`${preview.project_files} Projekt-Datei(en)`)
  }
  if (preview.contents.includes('master_data')) {
    lines.push('4 Stammdaten-Arbeitsmappen (Projekte, Kunden, Rechnungs- und Offertenjournal)')
  }
  return lines
}

/** Wie viele Dateien nur auf Drive liegen und deshalb NICHT mitgehen — gezählt
 *  werden nur die Kategorien, die überhaupt gewählt sind. */
export function driveOnlyCount(preview: DocumentBackupPreview): number {
  return (preview.contents.includes('photos') ? preview.photos_drive_only : 0)
    + (preview.contents.includes('project_files') ? preview.project_files_drive_only : 0)
}

/** Stammdaten zählen nicht im `document_count` (sie entstehen erst beim Export).
 *  Ein leeres Backup ist es deshalb nur, wenn auch sie nicht gewählt sind. */
export function isEmptySelection(preview: DocumentBackupPreview): boolean {
  return preview.document_count === 0 && !preview.contents.includes('master_data')
}

/** iOS Safari lädt aus einer Klick-Serie nur die erste Datei — der Sammel-Knopf
 *  wäre dort eine Lüge. Die Einzel-Knöpfe bleiben, also fehlt niemandem etwas. */
export function supportsBulkDownload(
  nav: Navigator | null = typeof navigator === 'undefined' ? null : navigator,
): boolean {
  if (!nav) return false
  const ua = nav.userAgent
  // iPadOS meldet sich seit 13 als "Macintosh" — deshalb zusätzlich Touch prüfen.
  const isIos = /iPad|iPhone|iPod/.test(ua)
    || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)
  return !isIos
}

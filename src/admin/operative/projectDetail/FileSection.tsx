import { useState, useRef } from 'react'
import { apiUrl } from '../../../api/client'
import { formatDateTime } from '../../utils/format'
import { PROJECT_FILE_ACCEPT, projectFileIcon } from '../../../shared/projectFileTypes'
import { DownloadIcon } from '../../../shared/DownloadIcon'
import type { ProjectFile, ProjectFileCategory } from './types'

export const PROJECT_DOC_SECTIONS: { key: ProjectFileCategory; title: string; legacyFallback?: boolean }[] = [
  { key: 'fotos', title: 'Fotos' },
  { key: 'masse', title: 'Masse' },
  { key: 'sonstiges', title: 'Sonstiges', legacyFallback: true },
  // Dokumente für den Kunden (z.B. Produktprospekt) — können beim Versand einer
  // Offerte als E-Mail-Anhang gewählt werden (Feature prospekt_mit_offerte).
  { key: 'anhang', title: 'Anhänge für Offerte' },
]

export const SUPPLIER_DOC_SECTIONS: { key: ProjectFileCategory; title: string }[] = [
  // Chronologie des Beschaffungsablaufs: erst das Angebot des Lieferanten, dann
  // Bestellung, AB, Lieferschein.
  { key: 'angebot_lieferant', title: 'Angebote Lieferant' },
  { key: 'bestellungen', title: 'Bestellungen' },
  { key: 'auftragsbestaetigung', title: 'Auftragsbestätigung' },
  { key: 'lieferschein', title: 'Lieferschein' },
]

// Hochgeladene Rapporte, die nicht im System erfasst wurden: das ausgefüllte
// Papier-Blatt und Rapporte aus Fremdsystemen (z.B. Sorba). Steht im Rapporte-Tab
// unter der Rapport-Liste, nicht im Dokumente-Tab.
export const REPORT_DOC_SECTIONS: { key: ProjectFileCategory; title: string }[] = [
  { key: 'rapport', title: 'Hochgeladene Rapporte (Papier / Fremdsystem)' },
]

// Offerten, die nicht in diesem System entstanden sind: die eingescannte Papier-
// Offerte, eine Offerte aus einem Vorgängersystem oder die eines Drittanbieters.
// Steht im Offerten-Tab unter der Offerten-Liste — analog zu den hochgeladenen
// Rapporten. NICHT zu verwechseln mit 'anhang' ("Anhänge für Offerte"): das sind
// Dokumente, die MIT der Offerte an den Kunden rausgehen. Hier liegt das Dokument
// nur am Projekt.
export const QUOTE_DOC_SECTIONS: { key: ProjectFileCategory; title: string }[] = [
  { key: 'offerte', title: 'Hochgeladene Offerten (Papier / Fremdsystem)' },
  // Die versendeten Auftragsbestätigungen: das PDF legt der Versand-Knopf selbst hier
  // ab (Backend: services/quote_order_confirmation_pdf.py). Bewusst kein eigener Reiter
  // — die Auftragsbestätigung IST die angenommene Offerte, nur weitergeführt. Hochladen
  // bleibt möglich (nachgereichte/unterschriebene Fassung).
  { key: 'auftragsbestaetigung_kunde', title: 'Auftragsbestätigungen an den Kunden' },
]

// Alle bekannten Kategorien über beide Tabs hinweg. Der legacyFallback der
// "Sonstiges"-Sektion darf NUR echte Altlasten (null / unbekannte Kategorie)
// auffangen – sonst würden Lieferanten-Dateien (z.B. auftragsbestaetigung)
// zusätzlich unter "Sonstiges" doppelt erscheinen.
const ALL_CATEGORY_KEYS = new Set<ProjectFileCategory>(
  [...PROJECT_DOC_SECTIONS, ...SUPPLIER_DOC_SECTIONS, ...REPORT_DOC_SECTIONS, ...QUOTE_DOC_SECTIONS].map(s => s.key),
)
// Altbestand: wird in der Anhänge-Sektion angezeigt und darf nicht zusätzlich
// unter "Sonstiges" auftauchen.
ALL_CATEGORY_KEYS.add('prospekt')

// Die Beschriftungen teilen sich beide Sichten (Charge H5).
export { CATEGORY_LABELS } from '../../../shared/projectDetail/types'

interface FileSectionsProps {
  files: ProjectFile[]
  sections: { key: ProjectFileCategory; title: string; legacyFallback?: boolean }[]
  uploading: boolean
  uploadingCategory: ProjectFileCategory | null
  onUpload: (category: ProjectFileCategory, files: File[]) => void
  onDelete: (fileId: string) => void
  onRename: (fileId: string, filename: string) => Promise<void>
}

interface FileSectionProps {
  section: { key: ProjectFileCategory; title: string; legacyFallback?: boolean }
  items: ProjectFile[]
  uploading: boolean
  isUploadingHere: boolean
  onUpload: (category: ProjectFileCategory, files: File[]) => void
  onDelete: (fileId: string) => void
  onRename: (fileId: string, filename: string) => Promise<void>
}

// Eine Datei-Sektion (z.B. "Fotos") mit Drag-&-Drop-Feld + Hochladen-Button.
// Sowohl Ablegen per Drag-&-Drop als auch Auswahl über den Button laden direkt
// in DIESE Kategorie hoch — die Sektion bestimmt die Kategorie implizit.
function FileSection({ section, items, uploading, isUploadingHere, onUpload, onDelete, onRename }: FileSectionProps) {
  const [dragOver, setDragOver] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFiles() {
    if (!uploading) inputRef.current?.click()
  }

  function startEdit(f: ProjectFile) {
    setEditingId(f.id)
    setEditValue(f.filename)
  }

  async function saveEdit() {
    const name = editValue.trim()
    if (!editingId || !name || renaming) return
    setRenaming(true)
    try {
      await onRename(editingId, name)
      setEditingId(null)
    } finally {
      setRenaming(false)
    }
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files ? Array.from(e.target.files) : []
    if (selected.length) onUpload(section.key, selected)
    e.target.value = '' // gleiche Datei erneut auswählbar machen
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (uploading) return
    const dropped = Array.from(e.dataTransfer.files || [])
    if (dropped.length) onUpload(section.key, dropped)
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--muted)',
          padding: '6px 10px',
          background: 'var(--surface-2)',
          borderLeft: '3px solid var(--primary)',
          borderRadius: 4,
          marginBottom: 8,
        }}
      >
        <span>{section.title}</span>
        <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {items.length}</span>
      </div>

      {/* Drag-&-Drop-Feld: Datei reinziehen ODER klicken / Button → Datei-Auswahl */}
      <div
        onClick={pickFiles}
        onDragOver={e => { e.preventDefault(); if (!uploading) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '14px 12px',
          marginBottom: 8,
          borderRadius: 'var(--radius-sm)',
          border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
          background: dragOver ? 'var(--surface-2)' : 'transparent',
          color: 'var(--muted)',
          fontSize: 12,
          cursor: uploading ? 'default' : 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={PROJECT_FILE_ACCEPT}
          multiple
          style={{ display: 'none' }}
          onChange={handleSelect}
        />
        <span>
          {isUploadingHere
            ? 'Wird hochgeladen…'
            : dragOver
              ? 'Dateien hier ablegen'
              : 'Dateien hierher ziehen oder klicken'}
        </span>
        <button
          type="button"
          className="admin-btn admin-btn-sm admin-btn-secondary"
          style={{ textTransform: 'none', letterSpacing: 0 }}
          disabled={uploading}
          onClick={e => { e.stopPropagation(); pickFiles() }}
        >
          + Hochladen
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 12, padding: '4px 12px' }}>—</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 18 }}>{projectFileIcon(f.mime_type, f.filename)}</span>
              {editingId === f.id ? (
                <>
                  <input
                    type="text"
                    className="admin-input"
                    value={editValue}
                    disabled={renaming}
                    autoFocus
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEdit()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    style={{ flex: 1, minWidth: 0, fontSize: 13 }}
                  />
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-primary"
                    disabled={renaming || !editValue.trim()}
                    onClick={saveEdit}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    disabled={renaming}
                    onClick={() => setEditingId(null)}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {f.storage_path
                      ? <a href={apiUrl(`/pwa/admin/project-files/${f.id}/download`)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 500, color: 'var(--primary)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</a>
                      : <span style={{ fontSize: 13, fontWeight: 500 }}>{f.filename}</span>
                    }
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDateTime(f.created_at)}</div>
                  </div>
                  {/* Der Dateiname öffnet nur (Fotos/PDFs liefert der Proxy `inline`
                      aus). Für "wirklich als Datei speichern" braucht es den
                      eigenen Knopf mit `?download=1` — siehe drive_proxy.py. */}
                  {f.storage_path && (
                    <a
                      href={apiUrl(`/pwa/admin/project-files/${f.id}/download?download=1`)}
                      download={f.filename}
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      title="Herunterladen"
                      aria-label={`${f.filename} herunterladen`}
                    >
                      <DownloadIcon />
                    </a>
                  )}
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    title="Umbenennen"
                    onClick={() => startEdit(f)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-danger"
                    onClick={() => onDelete(f.id)}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function FileSections({ files, sections, uploading, uploadingCategory, onUpload, onDelete, onRename }: FileSectionsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {sections.map(section => {
        const items = files.filter(f => {
          if (f.category === section.key) return true
          // Altbestand: frühere Kategorie der Offerten-Anhänge.
          if (section.key === 'anhang' && f.category === 'prospekt') return true
          // Fallback nur für echte Altlasten: null oder eine Kategorie, die in
          // KEINEM Tab vorkommt. Bekannte Fremd-Kategorien (z.B. auftragsbestaetigung)
          // bleiben in ihrer eigenen Sektion und tauchen hier nicht auf.
          if (section.legacyFallback && (f.category == null || !ALL_CATEGORY_KEYS.has(f.category))) return true
          return false
        })
        return (
          <FileSection
            key={section.key}
            section={section}
            items={items}
            uploading={uploading}
            isUploadingHere={uploading && uploadingCategory === section.key}
            onUpload={onUpload}
            onDelete={onDelete}
            onRename={onRename}
          />
        )
      })}
    </div>
  )
}

import { BeschaffungStep, daysSince } from '../../constants/beschaffungSteps'
import { FileSections, PROJECT_DOC_SECTIONS, SUPPLIER_DOC_SECTIONS } from './FileSection'
import type { ProjectFile, ProjectFileCategory } from './types'

export interface DocumentsTabProps {
  files: ProjectFile[]
  uploading: boolean
  uploadingCategory: ProjectFileCategory | null
  onUpload: (category: ProjectFileCategory, files: File[]) => void
  onDelete: (fileId: string) => void
  onRename: (fileId: string, filename: string) => Promise<void>
}

export function DocumentsTab({ files, uploading, uploadingCategory, onUpload, onDelete, onRename }: DocumentsTabProps) {
  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div className="admin-section-title" style={{ marginBottom: 14 }}>Dokumente & Fotos</div>
      <FileSections
        files={files}
        sections={PROJECT_DOC_SECTIONS}
        uploading={uploading}
        uploadingCategory={uploadingCategory}
        onUpload={onUpload}
        onDelete={onDelete}
        onRename={onRename}
      />
    </div>
  )
}

interface SupplierDocumentsTabProps extends DocumentsTabProps {
  // Feature `beschaffungsstatus`: Dropdown über den Datei-Sektionen. Fehlen die Props,
  // sieht der Tab aus wie vorher (Feature aus / Abwärtskompatibilität mit den Tests).
  beschaffungSteps?: BeschaffungStep[]
  beschaffungStatus?: string | null
  beschaffungStatusAt?: string | null
  beschaffungStatusSource?: string | null
  savingBeschaffung?: boolean
  onBeschaffungChange?: (status: string | null) => void
}

export function SupplierDocumentsTab({
  files, uploading, uploadingCategory, onUpload, onDelete, onRename,
  beschaffungSteps, beschaffungStatus, beschaffungStatusAt, beschaffungStatusSource,
  savingBeschaffung, onBeschaffungChange,
}: SupplierDocumentsTabProps) {
  const showBeschaffung = !!beschaffungSteps?.length && !!onBeschaffungChange
  const days = daysSince(beschaffungStatusAt)
  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div className="admin-section-title" style={{ marginBottom: 14 }}>Lieferantendokumente</div>

      {/* Beschaffungsstatus: bewusst hier und nicht im Status-Reiter (dort steht der
          Lebenszyklus). Man setzt den Schritt in dem Moment, in dem man auch das
          Dokument ablegt — Bedienung und Beleg am selben Ort. */}
      {showBeschaffung && (
        <div style={{
          marginBottom: 20,
          padding: '14px 16px',
          borderRadius: 8,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <label className="admin-form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>
            Beschaffungsstatus
          </label>
          <select
            className="admin-form-input"
            style={{ width: 'auto', minWidth: 200 }}
            value={beschaffungStatus ?? ''}
            disabled={savingBeschaffung}
            onChange={e => onBeschaffungChange!(e.target.value || null)}
          >
            <option value="">— nichts bestellt</option>
            {beschaffungSteps!.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          {savingBeschaffung && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Wird gespeichert…</span>
          )}
          {!savingBeschaffung && beschaffungStatus && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {days !== null ? `seit ${days} Tag${days === 1 ? '' : 'en'}` : 'heute gesetzt'}
              {/* Woher der Wert kommt, entscheidet über das Vertrauen in die Spalte:
                  ein automatischer Sprung ohne Erklärung liest sich als Fehler. */}
              {beschaffungStatusSource === 'auto' && ' · automatisch beim Upload gesetzt'}
            </span>
          )}
        </div>
      )}

      <FileSections
        files={files}
        sections={SUPPLIER_DOC_SECTIONS}
        uploading={uploading}
        uploadingCategory={uploadingCategory}
        onUpload={onUpload}
        onDelete={onDelete}
        onRename={onRename}
      />
    </div>
  )
}

import { useRef } from 'react'
import { apiUrl } from '../../../api/client'
import { fmtDate } from '../../utils/format'
import type { QuoteAttachmentTpl } from '../../../api/admin/quoteTemplates'
import { fmtBytes } from './types'

// Standard-Anhänge: pflegbar auch bei deaktiviertem Feature (nur der Versand-Dialog
// hängt am Flag) — analog zu den Sonderpositionen mit Hinweis statt Ausblenden.
//
// Das Suchfeld liegt bewusst im Panel: die Sektion verschwindet während jedes
// Neuladens (Spinner), lokaler State wäre danach weg.
interface Props {
  attachments: QuoteAttachmentTpl[]
  featureOn: boolean
  uploading: boolean
  // ID des Anhangs, der gerade gelöscht wird (oder null)
  deleting: string | null
  search: string
  onSearchChange: (v: string) => void
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDelete: (a: QuoteAttachmentTpl) => void
}

export function AttachmentsSection({
  attachments, featureOn, uploading, deleting, search, onSearchChange, onUpload, onDelete,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const needle = search.trim().toLowerCase()
  const filtered = needle
    ? attachments.filter(a => a.filename.toLowerCase().includes(needle))
    : attachments

  return (
    <>
      <div className="admin-page-header" style={{ marginTop: 24 }}>
        <div>
          <div className="admin-page-title" style={{ fontSize: 18 }}>Standard-Anhänge</div>
          <div className="admin-page-subtitle">
            Dokumente (z.B. AGB, Firmenprospekt), die beim Versenden einer Offerte als Anhang wählbar sind.
          </div>
        </div>
        <button
          className="admin-btn admin-btn-primary"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Wird hochgeladen…' : '+ Anhang hochladen'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={onUpload}
        />
      </div>
      {!featureOn && (
        <div className="admin-form-hint" style={{ margin: '0 0 12px' }}>
          Das Feature „Anhänge mit der Offerte versenden" ist für diesen Mandanten aktuell deaktiviert —
          die Anhänge erscheinen erst im Versand-Dialog, wenn du es unter Konfiguration aktivierst.
          Du kannst sie hier trotzdem schon vorbereiten.
        </div>
      )}
      {attachments.length > 5 && (
        <input
          className="admin-form-input"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Anhänge durchsuchen…"
          style={{ maxWidth: 320, marginBottom: 12 }}
        />
      )}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Datei</th><th>Grösse</th><th>Hochgeladen</th><th></th></tr>
          </thead>
          <tbody>
            {attachments.length === 0 ? (
              <tr><td colSpan={4} className="admin-table-empty">Keine Standard-Anhänge hochgeladen.</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="admin-table-empty">Keine Treffer.</td></tr>
            ) : filtered.map(a => (
              <tr key={a.id}>
                <td>
                  {/* Download läuft über den Browser (Cookie-Auth), nicht über apiFetch */}
                  <a
                    href={apiUrl(`/pwa/admin/quote-attachment-templates/${a.id}/download`)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <strong>{a.filename}</strong>
                  </a>
                </td>
                <td style={{ color: 'var(--muted)' }}>{fmtBytes(a.file_size)}</td>
                <td style={{ color: 'var(--muted)' }}>{fmtDate(a.created_at)}</td>
                <td>
                  <button
                    className="admin-btn admin-btn-danger admin-btn-sm"
                    onClick={() => onDelete(a)}
                    disabled={deleting === a.id}
                  >
                    {deleting === a.id ? '…' : 'Löschen'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

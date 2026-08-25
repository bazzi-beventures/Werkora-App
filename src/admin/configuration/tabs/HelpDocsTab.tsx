import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ApiError } from '../../../api/client'
import {
  listHelpDocs, uploadHelpDoc, deleteHelpDoc, triggerHelpReindex, getHelpReindexStatus,
  HelpDoc, ReindexStatus,
} from '../../../api/help'
import { useToast, ToastHost } from '../../components/useToast'

// ─── Hilfe-Bot-Tab: Handbücher hochladen/löschen + Reindex ───────────────────
//
// Die Handbücher liegen im privaten Bucket `help-docs` (Prefix {tenant_id}/) und
// werden über die /pwa/help/docs-Endpoints verwaltet. Nach einer Änderung muss der
// Reindex laufen, damit der Bot die neue Wissensbasis kennt.

const ACCEPT_HELP = '.md,.markdown,.txt,.pdf'

function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function HelpDocsTab() {
  const { toast, showToast } = useToast()
  const [docs, setDocs] = useState<HelpDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [status, setStatus] = useState<ReindexStatus | null>(null)
  const [moduleOff, setModuleOff] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<number | null>(null)

  async function loadDocs() {
    setLoading(true)
    try {
      setDocs(await listHelpDocs())
      setModuleOff(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { setModuleOff(true); return }
      showToast('Handbücher laden fehlgeschlagen', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadStatus() {
    try { setStatus(await getHelpReindexStatus()) } catch { /* Status ist optional */ }
  }

  useEffect(() => {
    loadDocs()
    loadStatus()
    return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
  }, [])

  // Solange ein Reindex läuft, den Status alle 2s nachladen.
  useEffect(() => {
    if (status?.state === 'running' && pollRef.current === null) {
      pollRef.current = window.setInterval(loadStatus, 2000)
    } else if (status?.state !== 'running' && pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [status?.state])

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''  // erlaubt erneutes Wählen derselben Datei
    if (!file) return
    setUploading(true)
    try {
      await uploadHelpDoc(file)
      showToast(`„${file.name}" hochgeladen`, 'success')
      await loadDocs()
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : ''
      showToast(`Upload fehlgeschlagen${detail ? ': ' + detail : ''}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  async function onDelete(name: string) {
    if (!window.confirm(`„${name}" wirklich löschen?`)) return
    try {
      await deleteHelpDoc(name)
      showToast('Gelöscht', 'success')
      await loadDocs()
    } catch {
      showToast('Löschen fehlgeschlagen', 'error')
    }
  }

  async function onReindex() {
    setReindexing(true)
    try {
      await triggerHelpReindex()
      showToast('Reindex gestartet', 'success')
      await loadStatus()
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : ''
      showToast(`Reindex fehlgeschlagen${detail ? ': ' + detail : ''}`, 'error')
    } finally {
      setReindexing(false)
    }
  }

  if (moduleOff) {
    return (
      <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          Das Modul <strong>Hilfe-Bot</strong> ist für diesen Mandanten nicht aktiv.
          Aktiviere es zuerst im Tab <strong>Module</strong>, um Handbücher zu verwalten.
        </div>
      </div>
    )
  }

  const running = status?.state === 'running'

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 760 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Handbücher (Markdown, Text oder PDF) für den In-App-Hilfe-Bot. Die Dateien liegen im
        privaten Bucket <code>help-docs</code>. Nach dem Hoch- oder Herunterladen den{' '}
        <strong>Reindex</strong> auslösen, damit der Bot die Änderungen kennt (läuft sonst
        automatisch nachts um 03:30).
        <br />
        Einträge mit dem Vermerk <em>vom Anbieter gepflegt</em> sind das auf diesen Mandanten
        zugeschnittene Werkora-Handbuch — es wird automatisch aktualisiert und lässt sich hier
        weder ersetzen noch löschen.
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input ref={fileRef} type="file" accept={ACCEPT_HELP} onChange={onPick} style={{ display: 'none' }} />
        <button
          className="admin-btn admin-btn-primary"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Lädt hoch…' : '+ Handbuch hochladen'}
        </button>
        <button
          className="admin-btn admin-btn-secondary"
          onClick={onReindex}
          disabled={reindexing || running}
        >
          {running ? 'Reindex läuft…' : 'Neu indexieren'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Erlaubt: .md, .txt, .pdf (max. 25 MB)</span>
      </div>

      {status && status.state !== 'idle' && (
        <div style={{
          padding: 12, marginBottom: 16, borderRadius: 8, fontSize: 13,
          background: status.state === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,171,0.08)',
          border: `1px solid ${status.state === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,171,0.25)'}`,
          color: status.state === 'error' ? '#fca5a5' : undefined,
        }}>
          {status.state === 'running' && 'Reindex läuft…'}
          {status.state === 'success' && `Reindex erfolgreich — ${status.chunks_indexed} Abschnitte aus ${status.files_processed} Datei(en) indexiert${status.files_skipped ? `, ${status.files_skipped} übersprungen` : ''}.`}
          {status.state === 'error' && `Reindex-Fehler: ${status.last_error ?? 'unbekannt'}`}
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><div className="admin-spinner" /> Handbücher werden geladen…</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>
          Noch keine Handbücher hochgeladen.
        </div>
      ) : (
        <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Datei</th>
              <th>Grösse</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.name}>
                <td style={{ fontWeight: 600 }}>{d.name}</td>
                <td>{formatBytes(d.size)}</td>
                <td>
                  {d.system ? (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>vom Anbieter gepflegt</span>
                  ) : (
                    <button
                      className="admin-btn admin-btn-secondary"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => onDelete(d.name)}
                    >
                      Löschen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <ToastHost toast={toast} />
    </div>
  )
}

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ApiError } from '../../api/client'
import { listSuppliers, type Supplier } from '../../api/admin/suppliers'
import {
  deleteWikiHandbook, listWikiHandbooks, reindexWiki, reindexWikiHandbook,
  updateWikiHandbook, uploadWikiHandbook, type WikiHandbook,
} from '../../api/wiki'
import { useToast, ToastHost } from '../components/useToast'

// ─── Lieferanten-Wiki: Handbücher hochladen, benennen, neu einlesen ──────────
//
// Spec docs/specs/lieferanten-wiki.md. Die Dateien liegen im privaten Bucket
// `supplier-docs`, die Monteure fragen sie in der Hilfe-Blase ab.
//
// Der Index läuft je Handbuch im Hintergrund (OCR grosser PDFs dauert Minuten),
// deshalb zeigt die Liste den Status pro Datei und lädt nach, solange noch
// etwas unterwegs ist. Ein Titelwechsel braucht KEINEN neuen Index — die Chunks
// kennen nur die id, die Beschriftung kommt aus dieser Tabelle.

const ACCEPT = '.pdf,.md,.markdown,.txt'
const POLL_MS = 5000

const STATUS_LABEL: Record<string, string> = {
  pending: 'wartet auf Index',
  running: 'wird eingelesen…',
  indexed: 'durchsuchbar',
  error: 'Fehler',
}

function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Läuft noch irgendwo ein Index? Dann lohnt das Nachladen. */
export function hasRunningIndex(handbooks: { index_status: string }[]): boolean {
  return handbooks.some(h => h.index_status === 'pending' || h.index_status === 'running')
}

export default function SupplierWikiScreen() {
  const { toast, showToast } = useToast()
  const [handbooks, setHandbooks] = useState<WikiHandbook[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [editing, setEditing] = useState<{ id: string; title: string; supplierId: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<number | null>(null)

  async function load(quiet = false) {
    if (!quiet) setLoading(true)
    try {
      setHandbooks(await listWikiHandbooks())
    } catch {
      if (!quiet) showToast('Handbücher konnten nicht geladen werden', 'error')
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    listSuppliers().then(setSuppliers).catch(() => { /* Auswahl bleibt leer, Freitext geht weiter */ })
    return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
  }, [])

  // Solange ein Index läuft, die Liste still nachladen — der Admin sieht sonst
  // «wird eingelesen» stehen, bis er selbst neu lädt.
  const running = hasRunningIndex(handbooks)
  useEffect(() => {
    if (running && pollRef.current === null) {
      pollRef.current = window.setInterval(() => load(true), POLL_MS)
    } else if (!running && pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [running])

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''  // erlaubt erneutes Wählen derselben Datei
    if (!file) return
    setUploading(true)
    try {
      const supplier = suppliers.find(s => s.id === supplierId)
      await uploadWikiHandbook(file, {
        title: title.trim() || undefined,
        supplier_id: supplierId || undefined,
        supplier_name: supplier?.name,
      })
      showToast(`„${file.name}" hochgeladen — wird eingelesen`, 'success')
      setTitle('')
      await load()
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : ''
      showToast(`Upload fehlgeschlagen${detail ? ': ' + detail : ''}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  async function onSaveEdit() {
    if (!editing) return
    const supplier = suppliers.find(s => s.id === editing.supplierId)
    setSaving(true)
    try {
      await updateWikiHandbook(editing.id, {
        title: editing.title.trim(),
        supplier_id: editing.supplierId || null,
        supplier_name: supplier?.name ?? '',
      })
      showToast('Gespeichert', 'success')
      setEditing(null)
      await load(true)
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : ''
      showToast(`Speichern fehlgeschlagen${detail ? ': ' + detail : ''}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(hb: WikiHandbook) {
    if (!window.confirm(`„${hb.title}" wirklich löschen? Die Datei und die Wiki-Einträge sind danach weg.`)) return
    try {
      await deleteWikiHandbook(hb.id)
      showToast('Gelöscht', 'success')
      await load(true)
    } catch {
      showToast('Löschen fehlgeschlagen', 'error')
    }
  }

  async function onReindexOne(hb: WikiHandbook) {
    try {
      await reindexWikiHandbook(hb.id)
      showToast('Wird neu eingelesen', 'success')
      await load(true)
    } catch {
      showToast('Neu einlesen fehlgeschlagen', 'error')
    }
  }

  async function onReindexAll() {
    if (!window.confirm('Alle Handbücher neu einlesen? Das dauert und kostet OCR pro PDF.')) return
    try {
      await reindexWiki()
      showToast('Alle Handbücher werden neu eingelesen', 'success')
      await load(true)
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : ''
      showToast(`Neu einlesen fehlgeschlagen${detail ? ': ' + detail : ''}`, 'error')
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Lieferanten-Wiki</div>
          <div className="admin-page-subtitle">
            Handbücher der Lieferanten für die Monteure — abfragbar in der Hilfe-Blase
          </div>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={onReindexAll} disabled={handbooks.length === 0}>
          Alle neu einlesen
        </button>
      </div>

      <div className="admin-table-wrap" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14 }}>
          Montageanleitungen, Datenblätter und Bedienungsanleitungen (PDF, Markdown oder Text,
          max. 40 MB). Nach dem Hochladen wird das Dokument gelesen und durchsuchbar gemacht —
          das dauert bei grossen PDFs einige Minuten. Öffnen können die Monteure es sofort.
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            Lieferant
            <select
              className="admin-input"
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              style={{ minWidth: 180 }}
            >
              <option value="">— ohne —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, flex: 1, minWidth: 220 }}>
            Titel (leer = Dateiname)
            <input
              className="admin-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="z.B. Vitodens 200 Montageanleitung"
            />
          </label>
          <input ref={fileRef} type="file" accept={ACCEPT} onChange={onPick} style={{ display: 'none' }} />
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Lädt hoch…' : '+ Handbuch hochladen'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-loading"><div className="admin-spinner" /> Handbücher werden geladen…</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Titel</th>
                <th>Lieferant</th>
                <th>Grösse</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {handbooks.length === 0 ? (
                <tr><td colSpan={5} className="admin-table-empty">Noch keine Handbücher hochgeladen.</td></tr>
              ) : handbooks.map(hb => (
                <tr key={hb.id}>
                  <td style={{ fontWeight: 600 }}>
                    {editing?.id === hb.id ? (
                      <input
                        className="admin-input"
                        value={editing.title}
                        onChange={e => setEditing({ ...editing, title: e.target.value })}
                      />
                    ) : (
                      hb.url
                        ? <a href={hb.url} target="_blank" rel="noopener noreferrer">{hb.title}</a>
                        : hb.title
                    )}
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{hb.file_name}</div>
                  </td>
                  <td>
                    {editing?.id === hb.id ? (
                      <select
                        className="admin-input"
                        value={editing.supplierId}
                        onChange={e => setEditing({ ...editing, supplierId: e.target.value })}
                      >
                        <option value="">— ohne —</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : (hb.supplier_name || '—')}
                  </td>
                  <td>{formatBytes(hb.size_bytes)}</td>
                  <td>
                    <span style={{ fontSize: 12 }}>
                      {STATUS_LABEL[hb.index_status] ?? hb.index_status}
                      {hb.index_status === 'indexed' && hb.chunk_count > 0 && (
                        <span style={{ color: 'var(--muted)' }}> · {hb.chunk_count} Abschnitte</span>
                      )}
                    </span>
                    {hb.index_status === 'error' && hb.index_error && (
                      <div style={{ fontSize: 11, color: 'var(--accent-red)', maxWidth: 280 }}>
                        {hb.index_error}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {editing?.id === hb.id ? (
                      <>
                        <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={onSaveEdit} disabled={saving}>
                          {saving ? '…' : 'Speichern'}
                        </button>
                        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setEditing(null)}>
                          Abbrechen
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => setEditing({ id: hb.id, title: hb.title, supplierId: hb.supplier_id ?? '' })}
                        >
                          Umbenennen
                        </button>
                        <button
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => onReindexOne(hb)}
                          disabled={hb.index_status === 'running' || hb.index_status === 'pending'}
                        >
                          Neu einlesen
                        </button>
                        <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => onDelete(hb)}>
                          Löschen
                        </button>
                      </>
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

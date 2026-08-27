import { useEffect, useRef, useState } from 'react'
import {
  commitMaterialImport, parseImportFile, previewMaterialImport,
} from '../../api/admin/materialImport'
import type {
  ImportFieldDef as FieldDef, ImportParseResult as ParseResult,
  ImportPreviewResult as PreviewResult, ImportResult, ImportRowAction as Action,
  MaterialImportRequest,
} from '../../api/admin/materialImport'
import { listSuppliers } from '../../api/admin/suppliers'
import type { Supplier } from '../../api/admin/suppliers'
import { useToast, ToastHost } from '../components/useToast'

type Mode = 'single' | 'per_row' | 'own'

interface Props {
  /** Feature-Flag import_eigenartikel — schaltet den Modus „Eigene Artikel" frei. */
  ownArticleEnabled?: boolean
}

const fmtChf = (n: number | null) => (n == null ? '—' : `CHF ${n.toFixed(2)}`)

const ACTION_LABEL: Record<Action, string> = {
  new: 'Neu',
  update: 'Update',
  unchanged: 'Unverändert',
}

const MODE_HINT: Record<Mode, string> = {
  single: 'Alle Zeilen werden diesem einen Lieferanten zugeordnet.',
  per_row: 'Für den Initialimport: Eine Spalte deiner Datei enthält den Lieferanten (Name oder Präfix). Unbekannte Lieferanten werden beim Import automatisch angelegt.',
  own: 'Eigene Artikel ohne Lieferant. Die System-Artikelnummer wird automatisch nach der normalen Konvention vergeben (nächste freie Nummer); bestehende eigene Artikel werden anhand der Bezeichnung abgeglichen.',
}

export default function ImportScreen({ ownArticleEnabled = false }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>('single')

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [supplierColumn, setSupplierColumn] = useState('')

  const [previewing, setPreviewing] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null)

  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const [error, setError] = useState('')
  const { toast, showToast } = useToast(4000)

  useEffect(() => {
    listSuppliers()
      .then(setSuppliers)
      .catch(() => setSuppliers([]))
  }, [])

  function resetAll() {
    setFile(null)
    setFileName('')
    setParsed(null)
    setMapping({})
    setSupplierColumn('')
    setPreviewData(null)
    setResult(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    resetAll()
  }

  const perRow = mode === 'per_row'
  const own = mode === 'own'
  const canUpload = mode !== 'single' || !!supplierId
  // Die im aktuellen Modus geltenden Mapping-Felder (Eigenartikel: ohne Lieferanten-Nr.)
  const activeFields = parsed ? (own ? parsed.own_fields : parsed.fields) : []

  async function handleFile(f: File) {
    if (mode === 'single' && !supplierId) {
      setError('Bitte zuerst einen Lieferanten wählen.')
      return
    }
    setFile(f)
    setFileName(f.name)
    setParsed(null)
    setPreviewData(null)
    setResult(null)
    setError('')
    setParsing(true)

    try {
      const res = await parseImportFile(f)
      setParsed(res)
      const fields = own ? res.own_fields : res.fields
      const map = own ? res.own_mapping : res.mapping
      const initial: Record<string, string> = {}
      for (const fld of fields) initial[fld.key] = map[fld.key] ?? ''
      setMapping(initial)
      setSupplierColumn(res.supplier_guess ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Datei konnte nicht gelesen werden')
    } finally {
      setParsing(false)
    }
  }

  function onMappingChange(field: string, column: string) {
    setMapping(prev => ({ ...prev, [field]: column }))
    setPreviewData(null) // Mapping geändert → Vorschau neu berechnen
    setResult(null)
  }

  function onSupplierColumnChange(column: string) {
    setSupplierColumn(column)
    setPreviewData(null)
    setResult(null)
  }

  function missingRequired(): string | null {
    if (!parsed) return null
    for (const fld of activeFields) {
      if (fld.required && !mapping[fld.key]) return fld.label
    }
    if (perRow && !supplierColumn) return parsed.supplier_field.label
    return null
  }

  // Die drei Modi unterscheiden sich nur darin, WIE der Lieferant mitkommt:
  // eigene Artikel gar nicht, «pro Zeile» als Spalten-Zuordnung, sonst als ID.
  function importRequest(): MaterialImportRequest {
    const mappingToSend: Record<string, string> = { ...mapping }
    if (!own && perRow && parsed) {
      mappingToSend[parsed.supplier_field.key] = supplierColumn
    }
    return {
      file: file as File,
      mapping: mappingToSend,
      ...(own ? { ownArticles: true } : {}),
      ...(!own && !perRow ? { supplierId } : {}),
    }
  }

  async function runPreview() {
    const miss = missingRequired()
    if (miss) { setError(`Pflichtfeld „${miss}" muss einer Spalte zugeordnet werden.`); return }
    setPreviewing(true)
    setError('')
    setResult(null)
    try {
      setPreviewData(await previewMaterialImport(importRequest()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vorschau fehlgeschlagen')
    } finally {
      setPreviewing(false)
    }
  }

  async function runImport() {
    setImporting(true)
    setError('')
    try {
      const res = await commitMaterialImport(importRequest())
      setResult(res)
      const supMsg = res.new_suppliers.length ? ` · ${res.new_suppliers.length} Lieferant(en) neu` : ''
      showToast(`${res.imported} neu · ${res.updated} aktualisiert${supMsg}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen')
    } finally {
      setImporting(false)
    }
  }

  const selectedSupplier = suppliers.find(s => s.id === supplierId)

  // Rendert KEIN eigenes `admin-page` — eingebettet als Tab in MaterialsScreen,
  // der den Seitenrahmen + Tab-Leiste liefert (analog FrequentMaterialsPanel).
  return (
    <>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Material-Import</div>
          <div className="admin-page-subtitle">Preisliste oder eigene Artikel (XLSX / CSV) importieren</div>
        </div>
        {(parsed || previewData) && (
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={resetAll}>Neu beginnen</button>
        )}
      </div>

      {error && <div className="admin-form-error" style={{ margin: '0 0 14px' }}>{error}</div>}

      {/* Schritt 1: Import-Art + (Lieferant) + Datei */}
      <div className="admin-table-wrap" style={{ padding: 20, marginBottom: 16 }}>
        <div className="admin-section-title">1 · Import-Art & Datei</div>

        {/* Modus-Umschalter */}
        <div className="admin-form-group" style={{ maxWidth: 620, marginTop: 12 }}>
          <label className="admin-form-label">Was möchtest du importieren?</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`admin-btn admin-btn-sm ${mode === 'single' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
              onClick={() => switchMode('single')}
            >
              Ein Lieferant für alle
            </button>
            <button
              type="button"
              className={`admin-btn admin-btn-sm ${mode === 'per_row' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
              onClick={() => switchMode('per_row')}
            >
              Lieferant je Zeile (Spalte)
            </button>
            {ownArticleEnabled && (
              <button
                type="button"
                className={`admin-btn admin-btn-sm ${mode === 'own' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                onClick={() => switchMode('own')}
              >
                Eigene Artikel
              </button>
            )}
          </div>
          <div className="admin-form-hint">{MODE_HINT[mode]}</div>
        </div>

        {mode === 'single' && (
          <div className="admin-form-group" style={{ maxWidth: 420, marginTop: 12 }}>
            <label className="admin-form-label">Lieferant *</label>
            <select
              className="admin-form-input"
              value={supplierId}
              onChange={e => { setSupplierId(e.target.value); setPreviewData(null); setResult(null) }}
            >
              <option value="">— Lieferant wählen —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.prefix})</option>
              ))}
            </select>
            {suppliers.length === 0 && (
              <div className="admin-form-hint">
                Noch keine Lieferanten erfasst — lege zuerst unter <strong>Lieferanten</strong> einen an.
              </div>
            )}
            {selectedSupplier && (
              <div className="admin-form-hint">
                System-Artikelnummern werden als <code>{selectedSupplier.prefix}-&lt;Lieferanten-Nr.&gt;</code> erzeugt.
              </div>
            )}
          </div>
        )}

        {!parsed && !parsing && (
          <div
            className="admin-table-wrap"
            style={{
              padding: 32, textAlign: 'center', marginTop: 8,
              border: '2px dashed var(--border)', background: 'transparent',
              cursor: canUpload ? 'pointer' : 'not-allowed', opacity: canUpload ? 1 : 0.5,
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onClick={() => { if (canUpload) fileRef.current?.click() }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>XLSX- oder CSV-Datei hier ablegen</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {canUpload ? 'oder klicken zum Auswählen' : 'zuerst Lieferant wählen'}
            </div>
            <input
              ref={fileRef} type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>
        )}

        {parsing && (
          <div className="admin-loading" style={{ height: 80 }}>
            <div className="admin-spinner" /> Datei wird analysiert…
          </div>
        )}

        {parsed && (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
            <strong style={{ color: 'var(--text)' }}>{fileName}</strong> — {parsed.row_count} Zeilen, {parsed.columns.length} Spalten erkannt.
          </div>
        )}
      </div>

      {/* Schritt 2: Spalten-Mapping */}
      {parsed && (
        <div className="admin-table-wrap" style={{ padding: 20, marginBottom: 16 }}>
          <div className="admin-section-title">2 · Spalten zuordnen</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 14px' }}>
            Ordne die Spalten deiner Datei den System-Feldern zu. Vorschläge sind bereits gesetzt.
          </p>
          <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
            {perRow && (
              <div className="admin-form-row admin-form-row-label">
                <label className="admin-form-label" style={{ margin: 0 }}>
                  {parsed.supplier_field.label}<span style={{ color: 'var(--danger)' }}> *</span>
                </label>
                <select
                  className="admin-form-input"
                  value={supplierColumn}
                  onChange={e => onSupplierColumnChange(e.target.value)}
                >
                  <option value="">— Spalte wählen —</option>
                  {parsed.columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            {activeFields.map(fld => (
              <div key={fld.key} className="admin-form-row admin-form-row-label">
                <label className="admin-form-label" style={{ margin: 0 }}>
                  {fld.label}{fld.required && <span style={{ color: 'var(--danger)' }}> *</span>}
                </label>
                <select
                  className="admin-form-input"
                  value={mapping[fld.key] ?? ''}
                  onChange={e => onMappingChange(fld.key, e.target.value)}
                >
                  <option value="">{fld.required ? '— Spalte wählen —' : '— nicht zuordnen —'}</option>
                  {parsed.columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>

          {own && (
            <div className="admin-form-hint" style={{ marginTop: 10 }}>
              Die Artikelnummer wird automatisch vergeben (nächste freie Nummer) — keine Nummern-Spalte nötig.
            </div>
          )}

          {parsed.sample_rows.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Beispieldaten:</div>
              <div className="admin-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>{parsed.columns.map(c => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {parsed.sample_rows.slice(0, 5).map((row, i) => (
                      <tr key={i}>{parsed.columns.map(c => <td key={c} style={{ whiteSpace: 'nowrap' }}>{String(row[c] ?? '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="admin-btn admin-btn-primary" onClick={runPreview} disabled={previewing}>
              {previewing ? 'Berechne…' : 'Vorschau anzeigen'}
            </button>
          </div>
        </div>
      )}

      {/* Schritt 3: Vorschau + Import */}
      {previewData && (
        <div className="admin-table-wrap" style={{ padding: 20 }}>
          <div className="admin-section-title">3 · Vorschau & Import</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, margin: '10px 0 14px' }}>
            <span><strong style={{ color: 'var(--success)' }}>{previewData.summary.new}</strong> neu</span>
            <span><strong style={{ color: '#3b82f6' }}>{previewData.summary.update}</strong> Update</span>
            <span><strong style={{ color: 'var(--muted)' }}>{previewData.summary.unchanged}</strong> unverändert</span>
            {previewData.new_suppliers.length > 0 && (
              <span><strong style={{ color: '#a855f7' }}>{previewData.new_suppliers.length}</strong> Lieferant(en) neu</span>
            )}
            {previewData.summary.errors > 0 && (
              <span style={{ color: 'var(--danger)' }}><strong>{previewData.summary.errors}</strong> Fehler</span>
            )}
          </div>

          {previewData.new_suppliers.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              Neu angelegt: {previewData.new_suppliers.join(', ')}
            </div>
          )}

          <div className="admin-table-wrap" style={{ marginBottom: 16, maxHeight: 460, overflowY: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  {previewData.per_row && <th>Lieferant</th>}
                  {!previewData.own_articles && <th>Lieferanten-Nr.</th>}
                  <th>System-Nr.</th>
                  <th>Bezeichnung</th>
                  <th>EK-Preis</th>
                  <th>VK (kalk.)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewData.rows.map((row, i) => (
                  <tr key={i}>
                    {previewData.per_row && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {row.supplier_name}
                        {row.supplier_new && (
                          <span className="admin-badge" style={{ marginLeft: 6, fontSize: 10, background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>neu</span>
                        )}
                      </td>
                    )}
                    {!previewData.own_articles && (
                      <td style={{ fontFamily: 'var(--mono)' }}>{row.manufacturer_art_nr}</td>
                    )}
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{row.art_nr}</td>
                    <td>{row.name}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>
                      {row.action === 'update' && row.old_cost_price != null && row.cost_price != null && Math.abs(row.old_cost_price - row.cost_price) > 0.005 ? (
                        <span><span style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>{fmtChf(row.old_cost_price)}</span> → {fmtChf(row.cost_price)}</span>
                      ) : fmtChf(row.cost_price)}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{fmtChf(row.unit_price)}</td>
                    <td>
                      <span
                        className="admin-badge"
                        style={{
                          fontSize: 11,
                          background: row.action === 'new' ? 'rgba(34,197,94,0.15)' : row.action === 'update' ? 'rgba(59,130,246,0.15)' : 'rgba(148,163,184,0.15)',
                          color: row.action === 'new' ? 'var(--success)' : row.action === 'update' ? '#3b82f6' : 'var(--muted)',
                        }}
                      >
                        {ACTION_LABEL[row.action]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previewData.errors.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              <strong>{previewData.errors.length} Zeile(n) übersprungen:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20, color: 'var(--danger)' }}>
                {previewData.errors.slice(0, 10).map((e, i) => <li key={i}>Zeile {e.row}: {e.message}</li>)}
                {previewData.errors.length > 10 && <li>… und {previewData.errors.length - 10} weitere</li>}
              </ul>
            </div>
          )}

          {result && (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--success)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
              <strong>Import abgeschlossen:</strong> {result.imported} neu angelegt, {result.updated} aktualisiert
              {result.skipped > 0 && <>, {result.skipped} unverändert</>}
              {result.new_suppliers.length > 0 && <>, {result.new_suppliers.length} Lieferant(en) neu angelegt</>}.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="admin-btn admin-btn-secondary" onClick={resetAll}>Abbrechen</button>
            <button
              className="admin-btn admin-btn-primary"
              onClick={runImport}
              disabled={importing || !!result || (previewData.summary.new + previewData.summary.update === 0)}
            >
              {importing ? 'Importiere…' : `${previewData.summary.new + previewData.summary.update} Artikel importieren`}
            </button>
          </div>
        </div>
      )}

      <ToastHost toast={toast} />
    </>
  )
}
